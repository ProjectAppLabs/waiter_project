"""Reenvío de rondas del POS sin duplicar líneas ni comandos de cocina."""

import pytest

from catalog.models import Product, RestaurantUnavailable
from sales.models import OrderLine

from .helpers import call, line, open_shift, order, pay, payment

pytestmark = pytest.mark.django_db


def test_reenvio_de_lineas_y_ronda_sin_duplicados(setup):
    # Falla si reenviar la misma ronda duplica líneas, importes o cursos de cocina.
    s = setup
    open_shift(s)
    o = order(s)
    raw = line(s)
    data = {"lines": [raw, raw], "fire": True}
    first = call(s["client"], "post", f"orders/{o['id']}/lines", data)["order"]
    second = call(s["client"], "post", f"orders/{o['id']}/lines", data)["order"]
    assert first == second and len(first["lines"]) == 2 and len(first["courses"]) == 1


@pytest.mark.parametrize("campo", ["product_id", "qty"])
def test_conflicto_de_uuid_revierte_toda_la_ronda(setup, campo):
    # Falla si un UUID se acepta con otro producto o cantidad, o deja media ronda agregada.
    s = setup
    open_shift(s)
    raw = line(s)
    o = order(s, lines=[raw])
    value = (
        2
        if campo == "qty"
        else Product.objects.create(organization=s["org"], name="Otro plato", kind="dish", price=100).pk
    )
    data = {"lines": [line(s), {**raw, campo: value}], "fire": False}
    result = call(s["client"], "post", f"orders/{o['id']}/lines", data, 409)
    assert result["error"] == "uuid_conflict" and OrderLine.objects.filter(order_id=o["id"]).count() == 1


def test_reenvio_tras_pago_y_producto_agotado(setup):
    # Falla si la disponibilidad actual o el pago impiden reconocer una línea ya aceptada.
    s = setup
    open_shift(s)
    raw = line(s)
    o = order(s, lines=[raw])
    payment(s, o)
    o = pay(s, o)
    RestaurantUnavailable.objects.create(restaurant=s["r1"], product=s["dish"])
    again = call(s["client"], "post", f"orders/{o['id']}/lines", {"lines": [raw], "fire": True})["order"]
    assert again == o
    result = call(s["client"], "post", f"orders/{o['id']}/lines", {"lines": [line(s)], "fire": False}, 409)
    assert result["error"] == "not_editable"


def test_uuid_aislado_por_pedido(setup):
    # Falla si una línea de otro pedido se omite como si fuera un reintento del actual.
    s = setup
    open_shift(s)
    raw = line(s)
    first, second = order(s, lines=[raw]), order(s, lines=[raw])
    assert first["lines"][0]["id"] != second["lines"][0]["id"]


def test_combo_idempotente_compara_tambien_sus_componentes(setup):
    # Falla si un reenvío duplica componentes o acepta otro contenido con sus UUID ya usados.
    s = setup
    open_shift(s)
    combo = Product.objects.create(
        organization=s["org"],
        name="Combo",
        kind="dish",
        price=20000,
        diner_attributes={"combo": [{"producto": s["dish"].pk, "cantidad": 2}]},
    )
    raw = line(s, product_id=combo.pk, children=[line(s, qty=2)])
    o = order(s, lines=[raw])
    data = {"lines": [raw], "fire": True}
    first = call(s["client"], "post", f"orders/{o['id']}/lines", data)["order"]
    assert call(s["client"], "post", f"orders/{o['id']}/lines", data)["order"] == first
    raw["children"][0]["qty"] = 1
    assert call(s["client"], "post", f"orders/{o['id']}/lines", data, 409)["error"] == "uuid_conflict"
