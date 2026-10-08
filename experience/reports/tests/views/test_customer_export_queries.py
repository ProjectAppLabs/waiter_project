"""Presupuesto del exporte de clientes con ventas y consentimientos distintos."""

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from experience_app.models import DinerAccount
from loyalty.models import Customer, LoyaltyCard
from reports.tests.test_reports import sale
from reports.tests.views.test_exportes_historial_equipo import csv_filas
from sales.models import Order
from tenancy.tests.helpers import account, pos_client

pytestmark = pytest.mark.django_db
MAX_CUSTOMER_EXPORT_QUERIES = 2


def crear_cliente(s, indice):
    """Crea un cliente distinto con ventas, devolución y consentimiento propios."""
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


def cifras_esperadas(cantidad, por_sede):
    """Devuelve el CSV concreto de los clientes sembrados en el ámbito solicitado."""
    cifras = ["2", "2400,00", "2026-10-02T00:00:00-05:00"] if por_sede else [
        "3", "3600,00", "2026-10-04T00:00:00-05:00"
    ]
    return [
        [
            f"Cliente {indice:02d}", "CC", "", f"cliente-{indice}@ejemplo.co", "", "2,500000", *cifras,
            "Sí" if indice % 2 == 0 else "No",
        ]
        for indice in range(cantidad)
    ]


@pytest.fixture
def exporte_clientes(setup, rol, por_sede):
    """Prepara datos fuera de la captura y permite exportar tamaños crecientes."""
    s = setup
    cliente_api = s["client"] if rol == "owner" else pos_client(
        account(s["org"], "admin", "encargado", restaurants=[s["r1"]])
    )
    periodo = "?from=2020-01-01&to=2020-01-01"
    if por_sede:
        periodo += f"&restaurant_id={s['r1'].pk}"
    creados = []
    tablas_exporte = [modelo._meta.db_table for modelo in (Customer, Order, DinerAccount)]

    def consultar(cantidad):
        """Obtiene CSV y conteos de una petición real después de preparar sus clientes."""
        for indice in range(len(creados), cantidad):
            creados.append(crear_cliente(s, indice))
        with CaptureQueriesContext(connection) as capturadas:
            _, filas = csv_filas(cliente_api, "clientes", periodo)
        return {
            "filas": [fila for fila in filas[1:] if fila[0].startswith("Cliente ")],
            "consultas": len(capturadas),
            "datos": sum(any(tabla in consulta["sql"] for tabla in tablas_exporte) for consulta in capturadas),
        }

    return consultar


@pytest.mark.parametrize(
    ("rol", "por_sede"),
    [("owner", True), ("admin", True), ("owner", False)],
    ids=["dueno-sede", "encargado-sede", "dueno-organizacion"],
)
def test_exporte_clientes_consultas_constantes_y_cifras(exporte_clientes, rol, por_sede):
    """Mantiene el presupuesto y el CSV con uno, doce y cincuenta clientes."""
    # Falla si el exporte crece en consultas o suma mal las sedes del dueño y las visitas visibles del encargado.
    una = exporte_clientes(1)
    doce = exporte_clientes(12)
    cincuenta = exporte_clientes(50)
    consultas = [una["consultas"], doce["consultas"], cincuenta["consultas"]]
    consultas_datos = [una["datos"], doce["datos"], cincuenta["datos"]]
    assert consultas == [una["consultas"]] * 3
    assert consultas_datos == [una["datos"]] * 3
    assert max(consultas_datos) <= MAX_CUSTOMER_EXPORT_QUERIES
    assert una["filas"] == cifras_esperadas(1, por_sede)
    assert doce["filas"] == cifras_esperadas(12, por_sede)
    assert cincuenta["filas"] == cifras_esperadas(50, por_sede)
