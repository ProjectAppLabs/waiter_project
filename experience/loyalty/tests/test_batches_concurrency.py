"""Lecturas de tamaño constante y escrituras concurrentes sobre saldos compartidos."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from time import sleep
from uuid import uuid4

import pytest
from freezegun import freeze_time
from django.db import OperationalError, close_old_connections, connection
from django.test.utils import CaptureQueriesContext

from loyalty.models import Customer, LoyaltyCard, LoyaltyMove, LoyaltyProgram
from loyalty.services import grant_points, settle_points
from reservations.models import Reservation
from reservations.services import create, deposit_paid
from sales.models import Order
from sales.services import get_order, writing
from sales.tests.helpers import call, open_shift, order
from tables.models import Table
from tenancy.http import Problem
from tenancy.models import Organization


@pytest.mark.django_db
# Hora fija de servicio (10:05 en Bogotá): con la reserva de las 10:00 ya apartando su mesa, el salón hace la misma
# consulta antes y después de crear más reservas. A otras horas la primera lectura no traía reservas y se saltaba una
# consulta, y la prueba fallaba según la hora del reloj.
@freeze_time('2026-10-02 15:05:00')
def test_reservation_and_customer_reads_are_batched(setup):
    # Falla si cada nueva reserva/cliente añade consultas al calendario, al salón o al listado.
    s = setup
    table = Table.objects.create(floor=s["r1"].floors.get(), number=1)

    def reserve(hour):
        return create(
            s["person"],
            {
                "restaurant_id": s["r1"].pk,
                "customer_name": "Cliente",
                "people": 2,
                "date": date.today().isoformat(),
                "time_start": hour,
                "prep_minutes": 0,
                "table_ids": [table.pk],
            },
        )

    reserve(10)
    routes = [
        "customers",
        f"floors?restaurant_id={s['r1'].pk}",
        f"reservations/timeline?restaurant_id={s['r1'].pk}&date={date.today().isoformat()}",
    ]
    counts = []
    for route in routes:
        with CaptureQueriesContext(connection) as queries:
            call(s["client"], "get", route)
        counts.append(len(queries))
    for hour in (12, 14, 16, 18):
        reserve(hour)
    Customer.objects.bulk_create([Customer(organization=s["org"], name=f"Persona {i}") for i in range(30)])
    for route, before in zip(routes, counts, strict=True):
        with CaptureQueriesContext(connection) as queries:
            call(s["client"], "get", route)
        assert len(queries) == before, [q["sql"] for q in queries]


def race(actions):
    barrier = Barrier(len(actions))

    def run(action):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            # SQLite de pruebas no espera SQLITE_LOCKED en caché compartida. Reintenta la transacción entera,
            # como haría el cliente; PostgreSQL espera el bloqueo de fila sin necesitar este reintento.
            for attempt in range(100):
                try:
                    return action()
                except OperationalError as exc:
                    if connection.vendor != "sqlite" or "locked" not in str(exc).lower() or attempt == 99:
                        raise
                    sleep(0.01)
                except Problem as exc:
                    return exc.body["error"]
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=len(actions)) as pool:
        return list(pool.map(run, actions))


@pytest.mark.django_db(transaction=True)
def test_concurrent_grant_and_deposit(setup):
    # Falla si dos peticiones simultáneas conceden dos premios o pagan dos veces un anticipo.
    s = setup
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    key = uuid4()

    def grant():
        return grant_points(Organization.objects.get(pk=s["org"].pk), key, "opinion:concurrente", 25, "Premio")

    results = race([grant, grant])
    assert sorted(r["otorgados"] for r in results) == [0, 25]
    assert LoyaltyCard.objects.get(customer__diner_key=key).points == 25
    table = Table.objects.create(floor=s["r1"].floors.get(), number=1)
    r = create(
        s["person"],
        {
            "restaurant_id": s["r1"].pk,
            "customer_name": "Cliente",
            "people": 2,
            "date": str(date.today()),
            "time_start": 15,
            "table_ids": [table.pk],
            "deposit_amount": 100,
        },
    )

    def paid():
        return deposit_paid(Organization.objects.get(pk=s["org"].pk), r.pay_token, "PAGO", 100)

    results = race([paid, paid])
    assert all(r["paid"] for r in results)
    assert {r["reason"] for r in results} == {"paid", "already_paid"}


@pytest.mark.django_db(transaction=True)
def test_concurrent_reservations_redeem_and_earn(setup):
    # Falla si se duplican mesas, se canjea dos veces el saldo disponible o el mismo pedido abona dos veces.
    s = setup
    table = Table.objects.create(floor=s["r1"].floors.get(), number=1)

    def reserve():
        from accounts.models import Account

        person = Account.objects.select_related("organization").get(pk=s["person"].pk)
        return create(
            person,
            {
                "restaurant_id": s["r1"].pk,
                "customer_name": "Cliente",
                "people": 2,
                "date": str(date.today()),
                "time_start": 15,
                "table_ids": [table.pk],
            },
        ).pk

    results = race([reserve, reserve])
    assert sum(r == "reservation_overlap" for r in results) == 1
    assert Reservation.objects.count() == 1
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    c = Customer.objects.create(organization=s["org"], name="Socio")
    card = LoyaltyCard.objects.create(organization=s["org"], customer=c, points=100)
    open_shift(s)
    a, b = order(s), order(s)

    def redeem(pk):
        from accounts.models import Account
        from loyalty.services import redeem as apply

        person = Account.objects.select_related("organization").get(pk=s["person"].pk)
        with writing(person.organization):
            return apply(get_order(person, pk, True), card.pk)

    results = race([lambda: redeem(a["id"]), lambda: redeem(b["id"])])
    assert sum(r == "minimum_points" for r in results) == 1
    selected = Order.objects.get(lines__points_cost__gt=0)
    selected.state = "paid"
    selected.save()

    def settle():
        settle_points(Order.objects.select_related("organization").get(pk=selected.pk))

    race([settle, settle])
    assert LoyaltyMove.objects.filter(order=selected, kind="earn").count() == 1
    assert LoyaltyMove.objects.filter(order=selected, kind="redeem").count() == 1
    assert LoyaltyMove.objects.filter(order=selected, kind="release").count() == 1
    card.refresh_from_db()
    assert card.points == 0
