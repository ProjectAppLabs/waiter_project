"""Cifras e independencia del tamaño del historial de turnos de caja."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import Account
from sales.models import CashMove, CashShift, Order, Payment, Refund, RefundPayment
from tenancy.tests.helpers import account, organization, restaurant

from .helpers import BASE, call, cash_method

pytestmark = pytest.mark.django_db

# Medido en MySQL: el historial y los controles de acceso usan seis consultas, sin crecer por turno.
MAX_SHIFT_LIST_QUERIES = 6


def turno(s, restaurant=None, **changes):
    """Crea un turno histórico sin abrir ni cerrar la caja del escenario."""
    closed_at = timezone.now()
    return CashShift.objects.create(
        restaurant=restaurant or s["r1"],
        state="closed",
        opened_by=s["person"],
        opened_at=closed_at - timedelta(hours=1),
        closed_by=s["person"],
        closed_at=closed_at,
        **changes,
    )


def pedido(shift, state="paid", total="12000.42", tip="1200.11"):
    """Prepara importes guardados que la lista debe leer sin recalcular el pedido."""
    return Order.objects.create(
        organization=shift.restaurant.organization,
        restaurant=shift.restaurant,
        shift=shift,
        uuid=uuid4(),
        service="takeout",
        prefix="TA",
        tracking=1,
        number="TA1",
        state=state,
        subtotal=Decimal(total) - Decimal(tip),
        total=Decimal(total),
        tip=Decimal(tip),
        paid=Decimal(total) if state == "paid" else 0,
        paid_at=timezone.now() if state == "paid" else None,
        paid_by=shift.opened_by if state == "paid" else None,
    )


def test_lista_vacia_y_turno_sin_ventas_devuelven_cero(setup):
    # Falla si una sede sin turnos pierde la lista vacía o los borradores se cuentan como ventas.
    s = setup
    path = f"shifts?restaurant_id={s['r1'].pk}"
    assert call(s["client"], "get", path) == {"shifts": []}

    shift = CashShift.objects.create(restaurant=s["r1"], opened_by=s["person"], opening_cash=Decimal("999999.99"))
    pedido(shift, state="draft")
    pedido(shift, state="cancelled")

    response = s["client"].get(BASE + path)

    assert response.status_code == 200
    row = response.data["shifts"][0]
    assert row["id"] == shift.pk and row["orders"] == 0
    assert row["total"] == Decimal("0") and isinstance(row["total"], Decimal)
    assert type(row["orders"]) is int
    assert row["closed_by"] is None and row["closed_at"] is None
    assert response.json()["shifts"][0]["total"] == 0


def test_resumen_coincide_con_arqueo_sin_propinas_ni_duplicar_pagos(setup):
    # Falla si se suman propinas o borradores, se restan devoluciones o los pagos multiplican pedidos.
    s = setup
    shift = CashShift.objects.create(restaurant=s["r1"], opened_by=s["person"])
    first = pedido(shift)
    second = pedido(shift)
    pedido(shift, state="draft", total="999999.99")
    pedido(shift, state="cancelled", total="999999.99")
    method = cash_method(s)
    for order in (first, second):
        for amount in ("5000.11", "7000.31"):
            Payment.objects.create(
                organization=s["org"], order=order, method=method,
                amount=Decimal(amount), request_key=uuid4().hex, account=s["person"],
            )
    for kind in ("in", "out"):
        CashMove.objects.create(shift=shift, kind=kind, amount=100, reason="Cambio", account=s["person"])
    for _ in range(2):
        refund = Refund.objects.create(
            organization=s["org"], restaurant=s["r1"], order=first, shift=shift,
            total=Decimal("10.00"), tip=Decimal("10.00"), reason="Devolución parcial",
            request_key=uuid4().hex, account=s["person"],
        )
        RefundPayment.objects.create(refund=refund, method=method, amount=Decimal("10.00"))
    first.refunded = Decimal("20.00")
    first.save(update_fields=["refunded"])

    row = call(s["client"], "get", f"shifts?restaurant_id={s['r1'].pk}")["shifts"][0]
    report = call(s["client"], "get", f"shifts/{shift.pk}/closing")

    assert row["total"] == report["orders_total"] == Decimal("21600.62")
    assert row["orders"] == report["orders_count"] == 2
    assert isinstance(row["total"], Decimal) and type(row["orders"]) is int
    assert set(row) == {"id", "state", "opened_at", "closed_at", "opened_by", "closed_by", "total", "orders"}


def test_lista_y_suma_permanecen_en_la_sede_solicitada(setup):
    # Falla si el historial o sus importes incluyen turnos de otra sede u organización.
    s = setup
    own = turno(s)
    pedido(own)
    other_local = turno(s, restaurant=s["r2"])
    pedido(other_local, total="5555.55", tip="55.55")
    other_org = organization("otra-organizacion")
    other_restaurant = restaurant(other_org)
    other_person = account(other_org)
    other_shift = turno({"r1": other_restaurant, "person": other_person})
    pedido(other_shift, total="999999.99", tip="0")

    own_rows = call(s["client"], "get", f"shifts?restaurant_id={s['r1'].pk}")["shifts"]
    local_rows = call(s["client"], "get", f"shifts?restaurant_id={s['r2'].pk}")["shifts"]
    forbidden = s["client"].get(BASE + f"shifts?restaurant_id={other_restaurant.pk}")

    assert [(row["id"], row["orders"], row["total"]) for row in own_rows] == [(own.pk, 1, Decimal("10800.31"))]
    assert [(row["id"], row["orders"], row["total"]) for row in local_rows] == [(other_local.pk, 1, Decimal("5500.00"))]
    assert forbidden.status_code == 404 and "shifts" not in forbidden.data


def test_consultas_constantes_con_uno_doce_y_cincuenta_turnos(setup, record_testsuite_property):
    # Falla si listar más turnos repite el arqueo o consulta por cada persona, perdiendo orden o cifras.
    s = setup
    shifts = []
    for index in range(50):
        people = [
            Account.objects.create(
                organization=s["org"], username=f"{kind}.{index}", name=f"{kind.title()} {index}", role="owner",
            )
            for kind in ("apertura", "cierre")
        ]
        closed_at = timezone.now()
        shift = CashShift.objects.create(
            restaurant=s["r1"], state="closed", opened_by=people[0], opened_at=closed_at - timedelta(hours=1),
            closed_by=people[1], closed_at=closed_at,
        )
        pedido(shift, total=f"{index + 1}00.75", tip="0.50")
        shifts.append((shift, people, Decimal(f"{index + 1}00.25")))

    query_counts = []
    for count in (1, 12, 50):
        suffix = "" if count == 12 else f"&limit={count}"
        with CaptureQueriesContext(connection) as queries:
            rows = call(s["client"], "get", f"shifts?restaurant_id={s['r1'].pk}{suffix}")["shifts"]
        query_counts.append(len(queries))
        expected = list(reversed(shifts))[:count]
        assert [row["id"] for row in rows] == [shift.pk for shift, _, _ in expected]
        assert [(row["orders"], row["total"]) for row in rows] == [(1, total) for _, _, total in expected]
        assert [row["opened_by"] for row in rows] == [{"id": people[0].pk, "name": people[0].name} for _, people, _ in expected]
        assert [row["closed_by"] for row in rows] == [{"id": people[1].pk, "name": people[1].name} for _, people, _ in expected]

    record_testsuite_property("consultas_turnos_1_12_50", ",".join(map(str, query_counts)))
    assert query_counts == [query_counts[0]] * 3, query_counts
    assert query_counts[0] <= MAX_SHIFT_LIST_QUERIES
