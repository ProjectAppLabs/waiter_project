"""Presupuesto de lectura del tablero de Inicio: 84 días de ventas sin cargar el pedido completo."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from freezegun import freeze_time

from sales.models import CashShift, Course, Order, OrderLine, Payment
from sales.tests.helpers import BASE, cash_method
from tenancy.tests.helpers import account

pytestmark = pytest.mark.django_db

# Medido en MySQL: sesión, organización, sede y módulo (5) más ventas, ventana de platos, líneas y devoluciones.
MAX_INSIGHTS_QUERIES = 9


@pytest.fixture(autouse=True)
def reloj_congelado():
    """Las 10:00 de Bogotá: cada venta cae en el día local que indica su desfase."""
    with freeze_time("2026-10-08T15:00:00Z"):
        yield


def ventas(s, desde, hasta):
    """Pedidos cobrados hace `i` días, cada uno con su mesero, dos platos, un curso y un pago."""
    shift, _ = CashShift.objects.get_or_create(restaurant=s["r1"], state="open", defaults={"opened_by": s["person"]})
    for i in range(desde, hasta):
        order = Order.objects.create(
            organization=s["org"], restaurant=s["r1"], shift=shift, uuid=uuid4(), service="takeout", prefix="TA",
            tracking=i + 1, number=f"TA-{i}", state="paid", subtotal=20000, total=21600, tip=600, paid=21600,
            created_by=account(s["org"], role="waiter", username=f"mesero{i}", restaurants=[s["r1"]]),
            paid_at=timezone.now() - timedelta(days=i))
        course = Course.objects.create(order=order, index=1)
        for _ in range(2):
            OrderLine.objects.create(order=order, uuid=uuid4(), product=s["dish"], name="Papas", qty=1,
                                     unit_price=10800, subtotal=10000, total=10800, course=course)
        Payment.objects.create(organization=s["org"], order=order, method=cash_method(s), amount=Decimal(21600),
                               request_key=uuid4().hex, account=s["person"])


def leer(s):
    """Pide el tablero de la sede y devuelve su respuesta con el SQL que ejecutó."""
    with CaptureQueriesContext(connection) as queries:
        data = s["client"].get(f"{BASE}sales/insights?restaurant_id={s['r1'].pk}").json()
    return data, [query["sql"] for query in queries.captured_queries]


def test_tablero_suma_84_dias_sin_cargar_cursos_pagos_ni_meseros(setup):
    """El Inicio suma ventas, horas y platos con las mismas consultas para una venta que para cincuenta."""
    # Falla si el Inicio vuelve a cargar cursos, pagos y meseros de cada pedido de 84 días para sumar ventas, si sus
    # consultas crecen con las ventas o si deja de contar los pedidos y platos de cada ventana.
    s = setup
    ventas(s, 0, 1)
    _, uno = leer(s)
    ventas(s, 1, 50)
    data, cincuenta = leer(s)
    assert len(uno) == len(cincuenta) <= MAX_INSIGHTS_QUERIES
    assert not any("sales_course" in sql or "sales_payment" in sql for sql in cincuenta)
    assert not any("FROM `sales_order`" in sql and "accounts_account" in sql for sql in cincuenta)
    assert sum(day["orders"] for day in data["daily"]) == 50
    assert data["hourly"] == [{"hour": 10, "total": 28 * 21000, "orders": 28}]
    assert (data["products"][0]["qty"], data["products"][0]["prev_qty"]) == (56, 44)
