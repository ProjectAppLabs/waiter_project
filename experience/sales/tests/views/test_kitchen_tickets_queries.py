"""Presupuesto de lectura del tablero de cocina: los cursos terminados no cargan el pedido completo."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from freezegun import freeze_time

from sales.models import CashShift, Course, Order, OrderLine
from sales.tests.helpers import BASE

pytestmark = pytest.mark.django_db

# Medido en MySQL: sesión, organización, sede y módulo (5) más comandas, sus líneas, sus categorías y los terminados.
MAX_KITCHEN_TICKETS_QUERIES = 9
DISPARO = datetime(2026, 10, 8, 14, 40, tzinfo=UTC)
LISTO, ENTREGADO = DISPARO + timedelta(minutes=12), DISPARO + timedelta(minutes=15)


@pytest.fixture(autouse=True)
def reloj_congelado():
    """Mantiene la sesión y las horas de los cursos en el mismo instante de prueba."""
    with freeze_time("2026-10-08T15:00:00Z"):
        yield


def cursos(s, cantidad, ready=None, served=None):
    """Pedidos del turno abierto con un curso de dos platos disparado a las 14:40 UTC."""
    shift, _ = CashShift.objects.get_or_create(restaurant=s["r1"], state="open", defaults={"opened_by": s["person"]})
    for i in range(cantidad):
        order = Order.objects.create(organization=s["org"], restaurant=s["r1"], shift=shift, uuid=uuid4(),
                                     service="takeout", prefix="TA", tracking=i + 1, number=f"TA-{i}",
                                     created_by=s["person"])
        course = Course.objects.create(order=order, index=1, fired_at=DISPARO, ready_at=ready, served_at=served)
        for _ in range(2):
            OrderLine.objects.create(order=order, uuid=uuid4(), product=s["dish"], name="Papas", qty=1,
                                     unit_price=10800, subtotal=10000, total=10800, course=course)


def leer(s):
    """Pide el tablero de cocina de la sede y devuelve su respuesta con el SQL que ejecutó."""
    with CaptureQueriesContext(connection) as queries:
        data = s["client"].get(f"{BASE}kitchen/tickets?restaurant_id={s['r1'].pk}").json()
    return data, [query["sql"] for query in queries.captured_queries]


def test_cocina_entrega_terminados_sin_cargar_sus_lineas_ni_categorias(setup):
    """Los terminados solo aportan sus dos horas y la lectura no crece con el turno."""
    # Falla si los cursos terminados vuelven a cargar pedido, mesero, líneas, productos y categorías que la cocina no
    # muestra, si la lectura crece con el turno o si se pierden la comanda en el fuego o las horas de los terminados.
    s = setup
    cursos(s, 1)
    cursos(s, 1, ready=LISTO, served=ENTREGADO)
    _, uno = leer(s)
    cursos(s, 49, ready=LISTO, served=ENTREGADO)
    data, cincuenta = leer(s)
    assert len(uno) == len(cincuenta) <= MAX_KITCHEN_TICKETS_QUERIES
    assert sum("FROM `sales_orderline`" in sql for sql in cincuenta) == 1
    assert sum("catalog_category" in sql for sql in cincuenta) == 1
    assert (len(data["tickets"]), len(data["tickets"][0]["lines"])) == (1, 2)
    assert data["completed"] == [{"fired_at": "2026-10-08T14:40:00Z", "ready_at": "2026-10-08T14:52:00Z"}] * 50
