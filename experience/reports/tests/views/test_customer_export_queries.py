"""Presupuesto del exporte de clientes con ventas y consentimientos distintos."""

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from experience_app.models import DinerAccount
from loyalty.models import Customer, LoyaltyCard
from reports.tests.test_exportes_historial_equipo import csv_filas
from reports.tests.test_reports import sale
from sales.models import Order
from tenancy.tests.helpers import account, pos_client

pytestmark = pytest.mark.django_db
MAX_CUSTOMER_EXPORT_QUERIES = 2


def crear_cliente(s, indice):
    nombre = f"Cliente {indice:02d}"
    comensal = DinerAccount.objects.create(
        organization_slug=s["org"].slug,
        name=nombre,
        email=f"cliente-{indice}@ejemplo.co",
        marketing=indice % 2 == 0,
    )
    cliente = Customer.objects.create(
        organization=s["org"], name=nombre, diner_key=comensal.pk, email=comensal.email
    )
    LoyaltyCard.objects.create(organization=s["org"], customer=cliente, points=Decimal("2.5"))
    for fecha, local, estado in (
        ("2026-10-01T05:00:00+00:00", s["r1"], "paid"),
        ("2026-10-02T05:00:00+00:00", s["r1"], "paid"),
        ("2026-10-03T05:00:00+00:00", s["r1"], "draft"),
        ("2026-10-04T05:00:00+00:00", s["r2"], "paid"),
    ):
        pedido = sale(s, fecha, rest=local, state=estado, total=Decimal("1234.56"))
        pedido.customer = cliente
        pedido.refunded = Decimal("34.56")
        pedido.save(update_fields=["customer", "refunded"])
    return cliente


@pytest.mark.parametrize("rol", ["owner", "admin"])
def test_exporte_clientes_consultas_constantes_y_cifras(setup, rol):
    # Falla si ventas o consentimiento añaden consultas por cliente, duplican importes o incluyen sedes ajenas.
    s = setup
    cliente_api = s["client"] if rol == "owner" else pos_client(
        account(s["org"], "admin", "encargado", restaurants=[s["r1"]])
    )
    consultas = []
    consultas_datos = []
    tablas_exporte = [modelo._meta.db_table for modelo in (Customer, Order, DinerAccount)]
    creados = 0
    for cantidad in (1, 12, 50):
        for indice in range(creados, cantidad):
            crear_cliente(s, indice)
        creados = cantidad
        with CaptureQueriesContext(connection) as capturadas:
            _, filas = csv_filas(
                cliente_api, "clientes", f"?from=2020-01-01&to=2020-01-01&restaurant_id={s['r1'].pk}"
            )
        consultas.append(len(capturadas))
        consultas_datos.append(sum(any(tabla in consulta["sql"] for tabla in tablas_exporte) for consulta in capturadas))
        assert len(filas) == cantidad + 1
        assert [fila[0] for fila in filas[1:]] == [f"Cliente {indice:02d}" for indice in range(cantidad)]
        for indice, fila in enumerate(filas[1:]):
            assert fila[5:] == [
                "2,500000", "2", "2400,00", "2026-10-02T00:00:00-05:00", "Sí" if indice % 2 == 0 else "No"
            ]
    print(f"Consultas exporte clientes ({rol}, 1/12/50): {consultas}; datos: {consultas_datos}")
    assert consultas == [consultas[0]] * 3
    assert consultas_datos == [consultas_datos[0]] * 3
    assert max(consultas_datos) <= MAX_CUSTOMER_EXPORT_QUERIES
