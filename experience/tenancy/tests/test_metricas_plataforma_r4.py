"""Métricas de la plataforma: MRR con la tarifa que se cobra y ventas netas de devoluciones."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from freezegun import freeze_time

from sales.models import CashShift, Order, Refund
from tenancy.metrics import metrics
from tenancy.models import PricingRevision
from tenancy.price_lists import default_pricing, effective_pricing
from tenancy.pricing import consumption

from .helpers import account, organization, restaurant

pytestmark = pytest.mark.django_db

# Siete lecturas agregadas (clientes, ventas, devoluciones, actividad, locales, cuentas y deudas) más una de las
# versiones de la lista de precios cuando algún cliente paga la tarifa estándar.
MAX_PLATFORM_METRICS_QUERIES = 8
NUEVE = {"from": "2026-10-09", "to": "2026-10-09"}


@pytest.fixture(autouse=True)
def nueve_de_octubre():
    """La lista estándar subió de 150.000 a 200.000 por local desde septiembre; hoy es 9 de octubre."""
    with freeze_time("2026-10-09T15:00:00Z"):
        PricingRevision.objects.create(starts=None, pricing={**default_pricing(), "local_monthly": 150000})
        PricingRevision.objects.create(starts=datetime(2026, 9, 1, 5, tzinfo=UTC),
                                       pricing={**default_pricing(), "local_monthly": 200000})
        yield


def venta(org, venue, total, paid_at, tip=Decimal(0)):
    """Un pedido cobrado en el restaurante, con su caja abierta y quien lo cobró."""
    person = account(org, role="cashier", username=f"caja-{uuid4().hex[:8]}", restaurants=[venue])
    shift, _ = CashShift.objects.get_or_create(restaurant=venue, state="open", defaults={"opened_by": person})
    return Order.objects.create(organization=org, restaurant=venue, shift=shift, uuid=uuid4(), service="takeout",
                                prefix="TA", tracking=1, number="TA-1", state="paid", total=total, tip=tip,
                                paid_at=paid_at, created_by=person)


def devolucion(order, total, created_at):
    """Una devolución sin propina del pedido, hecha en el instante dado."""
    return Refund.objects.create(organization=order.organization, restaurant=order.restaurant, order=order,
                                 shift=order.shift, total=total, reason="Devuelto", request_key=uuid4().hex,
                                 account=order.created_by, created_at=created_at)


def cliente_estandar(i, zona):
    """Un cliente con la tarifa estándar, un local y una venta de 1.000 con 100 devueltos el mismo día local."""
    org = organization(f"cliente-{i}", status="active", pricing={"mode": "estandar"}, timezone=zona)
    pedido = venta(org, restaurant(org), Decimal(1000), datetime(2026, 10, 9, 6, tzinfo=UTC))
    devolucion(pedido, Decimal(100), datetime(2026, 10, 9, 7, tzinfo=UTC))


def test_mrr_suma_lo_que_cobra_la_cuenta_de_cada_cliente():
    """El MRR y el precio por local salen de la tarifa vigente del mes, la misma de la cuenta."""
    # Falla si Métricas usa el `monthly_price` guardado al contratar (150.000) en vez de la tarifa vigente del mes con
    # la que se genera la cuenta (200.000 por local), o si se aparta de la regla de precios propios y heredados.
    estandar = organization("estandar", status="active", monthly_price=150000, pricing={"mode": "estandar"})
    propio = organization("propio", status="active", pricing={"mode": "personalizado", "local_monthly": 180000})
    heredado = organization("heredado", status="active", monthly_price=100000)
    for org, sedes in ((estandar, ("centro", "norte")), (propio, ("centro",)), (heredado, ("centro",))):
        for sede in sedes:
            restaurant(org, sede)
    result = metrics({})
    cuenta = consumption(estandar, "2026-10", billing=True)["estimated_total"]
    tarifas = {row["slug"]: row["monthly_price"] for row in result["organizations"]}
    assert cuenta == 400000
    assert result["totals"]["mrr"] == cuenta + 180000 + 100000
    assert tarifas == {org.slug: effective_pricing(org)["local_monthly"] for org in (estandar, propio, heredado)}


def ventas_con_devoluciones():
    """Dos ventas del 9 (75.000 sin propina): 20.000 devueltos el 9 y 7.000 el 10, fuera del periodo."""
    org = organization("frisby", status="active")
    venue = restaurant(org)
    pedido = venta(org, venue, Decimal(50000), datetime(2026, 10, 9, 14, tzinfo=UTC), tip=Decimal(5000))
    devolucion(pedido, Decimal(20000), datetime(2026, 10, 9, 16, tzinfo=UTC))
    otro = venta(org, venue, Decimal(30000), datetime(2026, 10, 9, 15, tzinfo=UTC))
    devolucion(otro, Decimal(7000), datetime(2026, 10, 10, 6, tzinfo=UTC))
    return org, venue


def test_ventas_netas_de_las_devoluciones_del_periodo():
    """Los totales y cada cliente descuentan lo devuelto en el periodo y no lo de otros días."""
    # Falla si las ventas o el ticket de Métricas no descuentan las devoluciones del periodo, o si descuentan las
    # hechas fuera de él.
    ventas_con_devoluciones()
    result = metrics(NUEVE)
    assert (result["totals"]["sales"], result["totals"]["orders"]) == (55000, 2)
    assert (result["organizations"][0]["sales"], result["organizations"][0]["ticket"]) == (55000, Decimal("27500.00"))


def test_detalle_neto_por_dia_y_por_restaurante():
    """El detalle de un cliente cuadra con sus totales: cada día y cada restaurante descuentan lo devuelto."""
    # Falla si el detalle por día o por restaurante sigue sumando lo cobrado sin descontar las devoluciones del
    # periodo, y deja de cuadrar con las ventas netas del cliente.
    org, venue = ventas_con_devoluciones()
    result = metrics(NUEVE, org.slug)
    assert result["totals"]["sales"] == 55000
    assert result["daily"] == [{"date": "2026-10-09", "sales": 55000, "orders": 2}]
    assert result["by_restaurant"] == [{"id": venue.pk, "name": venue.name, "sales": 55000, "orders": 2}]


def test_muchos_clientes_con_tarifa_estandar_y_devoluciones_sin_consultas_por_cliente():
    """Con once clientes en dos zonas el MRR y las ventas netas salen de las mismas consultas que con uno."""
    # Falla si la tarifa vigente o las devoluciones agregan una consulta por cliente o por zona, o si con muchos
    # clientes el MRR deja de usar la tarifa vigente o las ventas dejan de descontar lo devuelto.
    cliente_estandar(0, "America/Bogota")
    with CaptureQueriesContext(connection) as uno:
        metrics(NUEVE)
    for i in range(1, 11):
        cliente_estandar(i, ("America/Bogota", "Asia/Tokyo")[i % 2])
    with CaptureQueriesContext(connection) as once:
        result = metrics(NUEVE)
    assert len(uno) == len(once) <= MAX_PLATFORM_METRICS_QUERIES
    assert (result["totals"]["mrr"], result["totals"]["sales"]) == (11 * 200000, 11 * 900)
