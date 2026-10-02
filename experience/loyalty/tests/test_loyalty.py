import importlib
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.apps import apps
from django.db import connection

from loyalty.models import BenefitGrant, Customer, LoyaltyCard, LoyaltyMove, LoyaltyProgram
from loyalty.promotions import today
from loyalty.services import (
    benefit_actions,
    coupon_quote,
    diner_benefits,
    grant_points,
    seed_organization,
    settle_points,
)
from sales.models import Order
from sales.tests.helpers import call, open_shift, order, pay, payment
from tenancy.http import Problem
from tenancy.tests.helpers import platform_client, platform_user

pytestmark = pytest.mark.django_db


def program(s):
    seed_organization(s["org"])
    p = LoyaltyProgram.objects.get(organization=s["org"])
    p.active = True
    p.save()
    return p


def member(s, points=100):
    program(s)
    customer = Customer.objects.create(organization=s["org"], name="Ana Pérez", phone="3001234567", vat="12345")
    return LoyaltyCard.objects.create(organization=s["org"], customer=customer, points=points)


def test_seed_signup_and_migration(setup):
    # Falla si el alta o la migración omiten o duplican consumidor final y programa inactivo.
    s = setup
    client = platform_client(platform_user())
    result = client.post(
        "/api/platform/v1/organizations",
        {"name": "Nuevo", "slug": "nuevo", "owner": {"name": "Dueña", "email": "ana@ejemplo.co"}},
        format="json",
    )
    assert result.status_code == 201, result.data
    org = apps.get_model("tenancy", "Organization").objects.get(slug="nuevo")
    assert Customer.objects.get(organization=org).vat == "222222222222"
    p = LoyaltyProgram.objects.get(organization=org)
    assert not p.active and p.name == "Puntos Waiter"
    seed = importlib.import_module("loyalty.migrations.0002_seed_organizations").seed
    from types import SimpleNamespace

    seed(apps, SimpleNamespace(connection=connection))
    seed(apps, SimpleNamespace(connection=connection))
    assert Customer.objects.filter(organization=s["org"], vat="222222222222").count() == 1
    assert LoyaltyProgram.objects.filter(organization=org).count() == 1


@pytest.mark.parametrize("query", ["Pérez", "12345", "300123"])
def test_customer_search_and_paid_orders(setup, query):
    # Falla si la búsqueda omite documento/teléfono, cuenta pedidos sin pagar o confunde cobro con facturación.
    s = setup
    card = member(s)
    open_shift(s)
    o = order(s)
    call(s["client"], "patch", f"orders/{o['id']}", {"customer_id": card.customer_id})
    payment(s, o)
    pay(s, o)
    row = call(s["client"], "get", f"customers?q={query}")["customers"][0]
    assert row["name"] == "Ana Pérez" and row["orders"] == 1 and row["invoiced"] == 0
    assert call(s["client"], "get", f"customers/{card.customer_id}/orders")["orders"][0]["id"] == o["id"]
    assert call(s["client"], "get", f"customers/{card.customer_id}/card")["card"]["program"] == "Puntos Waiter"
    assert call(s["client"], "get", f"loyalty/cards/{card.code}")["member"]["name"] == row["name"]
    assert len(call(s["client"], "get", "customers/id-types")["id_types"]) == 6


def test_customer_write_validation_and_limit(setup):
    # Falla si admite documentos inválidos o devuelve más de 200 clientes.
    s = setup
    row = call(s["client"], "post", "customers", {"name": "Beatriz", "id_type": "CE", "email": "bea@ejemplo.co"}, 201)[
        "customer"
    ]
    call(s["client"], "patch", f"customers/{row['id']}", {"phone": "300"})
    call(s["client"], "post", "customers", {"name": "X", "id_type": "OTRO"}, 400)
    call(s["client"], "post", "customers", {"name": "X", "email": "correo"}, 400)
    Customer.objects.bulk_create([Customer(organization=s["org"], name=f"Cliente {i}") for i in range(205)])
    assert len(call(s["client"], "get", "customers")["customers"]) == 200


def test_coupon_dates_restrictions_minimum_and_rounding(setup):
    # Falla si cotiza un cupón vencido, de otra sede, bajo mínimo o con cálculo distinto del servidor.
    s = setup
    day = today(s["org"])
    raw = {
        "code": "cena_10",
        "percent": 12.5,
        "minimum": 100,
        "start": str(day),
        "end": str(day),
        "configs": [s["r1"].pk],
    }
    result = call(s["client"], "put", "benefits", {"coupon": raw})
    c = result["coupons"][0]
    assert c["code"] == "CENA_10" and c["configs"] == [s["r1"].pk]
    assert coupon_quote(s["org"], s["r1"], "cena_10", 100.04)["monto"] == 12.51
    for restaurant, subtotal in [(s["r2"], 1000), (s["r1"], 99)]:
        with pytest.raises(Problem):
            coupon_quote(s["org"], restaurant, "CENA_10", subtotal)
    for field, value in [
        ("end", str(day - timedelta(days=1))),
        ("start", str(day + timedelta(days=1))),
        ("active", False),
    ]:
        change = {**raw, "id": c["id"], "start": "", "end": "", field: value}
        call(s["client"], "put", "benefits", {"coupon": change})
        with pytest.raises(Problem):
            coupon_quote(s["org"], s["r1"], "CENA_10", 1000)


def test_redeem_reserves_settles_net_without_tip_once(setup):
    # Falla si dos borradores gastan los mismos puntos, si se abona la propina o si pagar duplica el abono.
    s = setup
    card = member(s, 100)
    open_shift(s)
    o = order(s)
    result = call(s["client"], "post", f"orders/{o['id']}/redeem", {"card_id": card.pk})
    assert (result["points"], result["amount"], result["order"]["total"]) == (100, 10000, 800)
    assert result["order"]["customer_id"] == card.customer_id
    discount = Order.objects.get(pk=o["id"]).lines.get(points_cost__gt=0)
    assert discount.taxes == [] and discount.total == -10000
    card.refresh_from_db()
    assert card.points == 100
    other = order(s)
    failure = call(s["client"], "post", f"orders/{other['id']}/redeem", {"card_id": card.pk}, 400)
    assert failure["error"] == "minimum_points"
    assert call(s["client"], "post", f"orders/{o['id']}/redeem", {"card_id": card.pk})["amount"] == 10000
    o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": 2000})["order"]
    payment(s, o)
    pay(s, o)
    pay(s, o)
    settle_points(Order.objects.get(pk=o["id"]))
    card.refresh_from_db()
    assert card.points == 0  # El consumo neto de 800 no alcanza los 1.000 por punto.
    assert LoyaltyMove.objects.filter(order_id=o["id"], kind="release").count() == 1
    assert not discount.order.courses.filter(lines=discount).exists()


def test_earn_net_and_release_on_cancel(setup):
    # Falla si el abono usa el bruto antes del canje o cancelar deja puntos bloqueados.
    s = setup
    card = member(s, 50)
    open_shift(s)
    o = order(s)
    call(s["client"], "post", f"orders/{o['id']}/redeem", {"card_id": card.pk})
    o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": 3000})["order"]
    payment(s, o)
    pay(s, o)
    card.refresh_from_db()
    assert card.points == Decimal("5.80")
    card.points = 30
    card.save()
    o = order(s)
    call(s["client"], "post", f"orders/{o['id']}/redeem", {"card_id": card.pk})
    call(s["client"], "post", f"orders/{o['id']}/cancel", {"reason": "Cliente desistió"})
    next_order = order(s)
    assert call(s["client"], "post", f"orders/{next_order['id']}/redeem", {"card_id": card.pk})["points"] == 30


@pytest.mark.parametrize("case", ["minimum", "expired", "inactive", "payments", "paid", "other_card", "small_total"])
def test_redeem_rejects_invalid_conditions(setup, case):
    # Falla si se canjea sin mínimo, vigencia, programa, borrador sin pagos o con otra tarjeta.
    s = setup
    card = member(s, 1 if case == "minimum" else 100)
    open_shift(s)
    o = order(s)
    status = 400
    if case == "expired":
        card.expires = today(s["org"]) - timedelta(days=1)
        card.save()
    elif case == "inactive":
        LoyaltyProgram.objects.filter(organization=s["org"]).update(active=False)
    elif case in ("payments", "paid"):
        payment(s, o, amount=100 if case == "payments" else o["total"])
        if case == "paid":
            pay(s, o)
        status = 409
    elif case == "other_card":
        call(s["client"], "post", f"orders/{o['id']}/redeem", {"card_id": card.pk})
        card = member(s)
        status = 409
    elif case == "small_total":
        LoyaltyProgram.objects.filter(organization=s["org"]).update(value_per_point=10000)
    call(s["client"], "post", f"orders/{o['id']}/redeem", {"card_id": card.pk}, status)


def test_diner_grant_idempotence_and_actions(setup):
    # Falla si la misma clave duplica premios, mezcla cuentas o cuenta no sincroniza primera compra.
    s = setup
    program(s)
    key = uuid4()
    before = diner_benefits(s["org"], key, None)
    assert len(before["codigo"]) == 8 and before["puntos"] == 0
    assert grant_points(s["org"], key, "opinion:1", 20, "Opinión")["otorgados"] == 20
    assert grant_points(s["org"], key, "opinion:1", 20, "Opinión")["otorgados"] == 0
    with pytest.raises(Problem):
        grant_points(s["org"], uuid4(), "opinion:1", 20, "Opinión")
    assert BenefitGrant.objects.count() == 1
    action = {"action": "cuenta", "active": True, "reward": "descuento", "percent": 15}
    call(s["client"], "put", "benefits", {"action": action})
    s["org"].refresh_from_db()
    assert s["org"].signup_discount_percent == 15
    assert benefit_actions(s["org"], s["r1"]) == [
        {"accion": "cuenta", "premio": {"tipo": "descuento", "porcentaje": 15}}
    ]
    call(s["client"], "put", "benefits", {"action": {**action, "reward": "puntos", "points": 10}})
    s["org"].refresh_from_db()
    assert s["org"].signup_discount_percent == 0
    assert benefit_actions(s["org"], s["r1"])[0]["premio"]["tipo"] == "puntos"


def test_benefits_program_activation_and_customer_earned(setup):
    # Falla si el programa inactivo no se puede activar o los ganados de un pedido se atribuyen a otra cuenta.
    s = setup
    seed_organization(s["org"])
    assert call(s["client"], "get", "loyalty/program")["program"] is None
    data = {"spendPerPoint": 1000, "valuePerPoint": 100, "minimumPoints": 10, "active": True}
    assert call(s["client"], "put", "benefits", {"loyalty": data})["loyalty"]["active"]
    key = uuid4()
    info = diner_benefits(s["org"], key, None)
    card = LoyaltyCard.objects.get(pk=info["tarjeta"])
    open_shift(s)
    o = order(s)
    call(s["client"], "patch", f"orders/{o['id']}", {"customer_id": card.customer_id})
    payment(s, o)
    pay(s, o)
    assert diner_benefits(s["org"], key, o["uuid"])["ganados"] == 10.8
    assert diner_benefits(s["org"], uuid4(), o["uuid"])["ganados"] == 0
