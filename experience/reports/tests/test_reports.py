from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from catalog.models import Product, Recipe, RecipeLine, RestaurantPrice
from sales.models import CashShift, Order, OrderLine
from sales.tests.helpers import call
from tenancy.tests.helpers import account, pos_client, restaurant

pytestmark = pytest.mark.django_db


def sale(s, when="2026-10-01T05:00:00+00:00", *, rest=None, total=10800, tip=0, guests=1, state="paid"):
    rest = rest or s["r1"]
    shift, _ = CashShift.objects.get_or_create(restaurant=rest, state="open", defaults={"opened_by": s["person"]})
    return Order.objects.create(
        organization=s["org"],
        restaurant=rest,
        shift=shift,
        uuid=uuid4(),
        service="takeout",
        prefix="TA",
        tracking=1,
        number="TA-1",
        created_by=s["person"],
        state=state,
        paid_at=datetime.fromisoformat(when),
        total=total,
        tip=tip,
        guests=guests,
    )


def test_summary_local_previous_and_tips(setup):
    # Falla si se usan días UTC, creación en vez de cobro, propinas como ventas o un periodo anterior desigual.
    s = setup
    sale(s, total=12000, tip=1200, guests=3)
    sale(s, "2026-10-02T04:59:59+00:00", rest=s["r2"], total=21600, guests=2)
    sale(s, "2026-10-01T04:59:59+00:00", total=5400)
    sale(s, "2026-10-02T05:00:00+00:00", total=999999)
    sale(s, state="draft", total=999999)
    result = call(s["client"], "get", "reports/summary?from=2026-10-01&to=2026-10-01")
    assert result["total"]["sales"] == 32400 and result["total"]["tips"] == 1200
    assert result["total"]["orders"] == 2 and result["total"]["guests"] == 5 and result["total"]["ticket"] == 16200
    assert result["total"]["previous"]["sales"] == 5400
    assert result["previous_from"] == result["previous_to"] == "2026-09-30"
    assert result["restaurants"][0]["sales"] == 10800
    longer = call(s["client"], "get", "reports/summary?from=2026-10-01&to=2026-10-03")
    assert longer["previous_from"] == "2026-09-28" and longer["previous_to"] == "2026-09-30"


def test_profitability_null_cost_prices_and_component_exclusion(setup):
    # Falla si el ingreso lleva impuesto, se pierde el precio de sede o un componente de combo se cuenta como venta.
    s = setup
    RestaurantPrice.objects.create(restaurant=s["r1"], product=s["dish"], price=21600)
    o = sale(s)
    line = OrderLine.objects.create(
        order=o, uuid=uuid4(), product=s["dish"], name="Papas", qty=2, unit_price=10800, total=21600, subtotal=20000
    )
    OrderLine.objects.create(
        order=o, uuid=uuid4(), product=s["dish"], name="Componente", qty=20, unit_price=0, parent=line
    )
    result = call(s["client"], "get", f"reports/profitability?from=2026-10-01&to=2026-10-01&restaurant_id={s['r1'].pk}")
    row = result["rows"][0]
    assert row["price"] == 21600 and row["cost"] == 500 and row["margin"] == 19500
    assert row["units"] == 2 and row["revenue"] == 20000 and row["gross_profit"] == 19000
    assert row["food_cost_pct"] == 2.5 and row["class"] == "star"
    s["ingredient"].cost = 0
    s["ingredient"].save()
    row = call(s["client"], "get", "reports/profitability?from=2026-10-01&to=2026-10-01")["rows"][0]
    assert row["cost"] is row["margin"] is row["food_cost_pct"] is row["gross_profit"] is row["class"] is None


def test_all_profitability_classes(setup):
    # Falla si popularidad no usa el 70 % del promedio o margen no usa el promedio ponderado por unidades.
    s = setup
    s["dish"].available_in_pos = False
    s["dish"].save()
    o = sale(s)
    for name, price, units in [
        ("Estrella", 20000, 10),
        ("Caballo", 1000, 10),
        ("Rompecabezas", 20000, 1),
        ("Perro", 1000, 1),
    ]:
        p = Product.objects.create(organization=s["org"], name=name, kind="dish", price=price)
        recipe = Recipe.objects.create(product=p)
        RecipeLine.objects.create(recipe=recipe, ingredient=s["ingredient"], qty=Decimal("0.25"), unit=s["kg"])
        OrderLine.objects.create(
            order=o,
            uuid=uuid4(),
            product=p,
            name=name,
            qty=units,
            unit_price=price,
            total=price * units,
            subtotal=price * units,
        )
    result = call(s["client"], "get", "reports/profitability?from=2026-10-01&to=2026-10-01")
    assert {r["name"]: r["class"] for r in result["rows"]} == {
        "Estrella": "star",
        "Caballo": "plowhorse",
        "Rompecabezas": "puzzle",
        "Perro": "dog",
    }
    assert result["thresholds"]["popularity_units"] == Decimal("3.85") and result["thresholds"]["margin"] == 10000


@pytest.mark.parametrize("role", ["admin", "waiter", "cashier"])
def test_profitability_scope(setup, role):
    # Falla si el encargado consulta toda la organización, otra sede, o un operador consulta rentabilidad.
    s = setup
    client = pos_client(account(s["org"], role, role, restaurants=[s["r1"]]))
    call(client, "get", "reports/profitability", status=400 if role == "admin" else 403)
    call(client, "get", f"reports/profitability?restaurant_id={s['r1'].pk}", status=200 if role == "admin" else 403)
    call(client, "get", f"reports/profitability?restaurant_id={s['r2'].pk}", status=404 if role == "admin" else 403)


@pytest.mark.parametrize("route", ["summary", "profitability"])
@pytest.mark.parametrize(
    "query", ["from=2026-02-30", "from=2026-10-02&to=2026-10-01", "from=9999-12-31", "from=20261001"]
)
def test_invalid_report_period(setup, route, query):
    # Falla si un periodo inválido produce cifras engañosas o un error de servidor.
    call(setup["client"], "get", f"reports/{route}?{query}", status=400)


def test_reports_batch_queries(setup):
    # Falla si cada plato o restaurante añade consultas al resumen o la rentabilidad.
    s = setup

    def count(path):
        with CaptureQueriesContext(connection) as queries:
            call(s["client"], "get", path)
        return len(queries)

    paths = ["reports/summary", "reports/profitability"]
    before = [count(path) for path in paths]
    for i in range(10):
        Product.objects.create(organization=s["org"], name=f"Plato {i}", kind="dish", price=1000)
        restaurant(s["org"], f"sede-{i}")
    assert [count(path) for path in paths] == before
