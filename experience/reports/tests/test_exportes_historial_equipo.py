"""Contrato Y1, Y2 y Y5 con importes y límites de acceso reales."""

import csv
import io
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import transaction
from django.utils import timezone
from freezegun import freeze_time

from accounts.models import Attendance
from catalog.services import save_product
from experience_app.models import DinerAccount
from inventory.models import StockMove
from loyalty.models import Customer, LoyaltyCard
from reports.tests.test_reports import sale
from sales.models import OrderLine, Payment
from sales.tests.helpers import call, cash_method, open_shift
from sales.tests.test_devoluciones import devolver, venta
from tenancy.audit import _context
from tenancy.models import OrganizationAudit, OrganizationModule
from tenancy.tests.helpers import account, organization, platform_client, platform_user, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = "/api/pos/v1/"
PERIODO = "?from=2026-10-01&to=2026-10-01"


def csv_filas(cliente, tipo, periodo=PERIODO):
    respuesta = cliente.get(BASE + "exports/" + tipo + periodo)
    assert respuesta.status_code == 200, getattr(respuesta, "data", respuesta.content)
    assert respuesta.content.startswith(b"\xef\xbb\xbf")
    assert respuesta["Content-Type"].startswith("text/csv")
    return respuesta, list(csv.reader(io.StringIO(respuesta.content.decode("utf-8-sig")), delimiter=";"))


def linea_venta(s, local=None, fecha="2026-10-01T05:00:00+00:00", nombre="Café con piñón"):
    pedido = sale(s, fecha, rest=local, total=Decimal("1234.56"), tip=Decimal("34.56"))
    OrderLine.objects.create(
        order=pedido,
        product=s["dish"],
        uuid=uuid4(),
        name=nombre,
        qty=Decimal("1.25"),
        unit_price=Decimal("960.00"),
        subtotal=Decimal("1111.11"),
        total=Decimal("1200.00"),
        taxes=[{"name": "INC 8 %"}],
    )
    return pedido


def test_exporte_completo_excel_periodo_y_aislamiento(setup):
    # Falla si se trunca el exporte, se pierden tildes y decimales o aparecen ventas ajenas al local o al periodo.
    s = setup
    for _ in range(205):
        linea_venta(s)
    linea_venta(s, s["r2"], nombre="Venta de otro local")
    linea_venta(s, fecha="2026-10-01T04:59:59+00:00", nombre="Fuera del periodo")
    ajena = organization("otra-empresa")
    linea_venta({**s, "org": ajena}, restaurant(ajena), nombre="Venta ajena")
    encargado = pos_client(account(s["org"], "admin", "encargado", restaurants=[s["r1"]]))
    respuesta, filas = csv_filas(encargado, "ventas")
    assert len(filas) == 206
    assert filas[1][7:10] == ["Café con piñón", "1,250000", "960,00"]
    assert respuesta["Content-Disposition"] == 'attachment; filename="ventas-2026-10-01-a-2026-10-01.csv"'
    assert "ajena" not in respuesta.content.decode() and "otro local" not in respuesta.content.decode()
    assert "Fuera del periodo" not in respuesta.content.decode()
    assert encargado.get(BASE + "exports/ventas" + PERIODO + f"&restaurant_id={s['r2'].pk}").status_code == 404
    assert len(csv_filas(s["client"], "ventas")[1]) == 207


@pytest.mark.parametrize("tipo", ["ventas", "pagos", "inventario", "movimientos", "clientes", "historial", "equipo"])
def test_exportes_rechazan_roles_y_periodos_excesivos(setup, tipo):
    # Falla si un mesero exporta datos o cualquier exporte admite más de 366 días.
    s = setup
    mesero = pos_client(account(s["org"], "waiter", "mesero", restaurants=[s["r1"]]))
    assert mesero.get(BASE + f"exports/{tipo}").status_code == 403
    assert s["client"].get(BASE + f"exports/{tipo}?from=2025-01-01&to=2026-01-02").status_code == 400
    assert s["client"].get(BASE + f"exports/{tipo}?from=mal").status_code == 400


def test_pagos_inventario_movimientos_y_modulo_apagado(setup):
    # Falla si faltan pagos, se pierde el cambio, el costo no es decimal o se ignora el módulo de inventario.
    s = setup
    pedido = linea_venta(s)
    Payment.objects.create(
        organization=s["org"],
        order=pedido,
        method=cash_method(s),
        amount=Decimal("1234.56"),
        received=Decimal("2000"),
        reference="Árbol",
        request_key=uuid4().hex,
        account=s["person"],
        created_at=pedido.paid_at,
    )
    respuesta, filas = csv_filas(s["client"], "pagos")
    assert filas[1][4:8] == ["1234,56", "2000,00", "765,44", "Árbol"]
    assert csv_filas(s["client"], "inventario")[1][1][6] == "6000,000000000000"
    with freeze_time("2026-10-01T15:00:00Z"):
        StockMove.objects.create(
            organization=s["org"],
            restaurant=s["r1"],
            ingredient=s["ingredient"],
            kind="count",
            qty=Decimal("1.5"),
            reason="Conteo físico",
            account=s["person"],
            request_key=uuid4().hex,
        )
    assert csv_filas(s["client"], "movimientos")[1][1][3:7] == ["Conteo", "1,500000", "kg", "Conteo físico"]
    OrganizationModule.objects.create(organization=s["org"], key="inventario", active=False, starts=timezone.now())
    assert s["client"].get(BASE + "exports/inventario").data["error"] == "module_inactive"
    assert s["client"].get(BASE + "exports/movimientos").status_code == 403


def test_clientes_sin_filtrar_por_fecha_con_ambito_del_encargado(setup):
    # Falla si clientes pierde registros por el periodo o revela visitas y gasto de locales que el encargado no ve.
    s = setup
    cliente = Customer.objects.create(organization=s["org"], name="María", vat="123")
    LoyaltyCard.objects.create(organization=s["org"], customer=cliente, points=12)
    for local in (s["r1"], s["r2"]):
        pedido = linea_venta(s, local)
        pedido.customer = cliente
        pedido.save()
    Customer.objects.create(organization=s["org"], name="Sin visitas")
    solo_borrador = Customer.objects.create(organization=s["org"], name="Solo borrador")
    borrador = sale(s, state="draft")
    borrador.customer = solo_borrador
    borrador.save(update_fields=["customer"])
    encargado = pos_client(account(s["org"], "admin", "encargado", restaurants=[s["r1"]]))
    _, filas = csv_filas(encargado, "clientes", "?from=2020-01-01&to=2020-01-01")
    assert [fila[0] for fila in filas[1:]] == ["María", "Solo borrador"]
    assert filas[1][5:8] == ["12,000000", "1", "1234,56"]
    assert filas[2][5:] == ["0", "0", "0", "", "No"]
    _, organizacion = csv_filas(s["client"], "clientes")
    assert [fila[0] for fila in organizacion[1:]] == ["Consumidor final", "María", "Sin visitas", "Solo borrador"]
    assert organizacion[2][6:8] == ["2", "2469,12"]
    assert organizacion[3][5:] == ["0", "0", "0", "", "No"]
    assert csv_filas(s["client"], "clientes", f"?restaurant_id={s['r1'].pk}")[1] == filas


def test_clientes_consentimiento_por_organizacion_y_sin_cuenta(setup):
    # Falla si el consentimiento se toma de otra organización, se impone sin marcarlo o se pierde el CSV completo.
    s = setup
    for nombre, ambito, acepta in (
        ("Acepta", s["org"].slug, True),
        ("Cuenta ajena", "otra-empresa", True),
        ("No acepta", s["org"].slug, False),
    ):
        comensal = DinerAccount.objects.create(
            organization_slug=ambito, name=nombre, email=f"{uuid4().hex}@ejemplo.co", marketing=acepta
        )
        Customer.objects.create(
            organization=s["org"], name=nombre, diner_key=comensal.pk, email="cliente@ejemplo.co", phone="3001234",
            id_type="CE", vat="12345",
        )
    Customer.objects.create(organization=s["org"], name="Sin cuenta", diner_key=uuid4())
    ajena = organization("otra-empresa")
    Customer.objects.create(organization=ajena, name="Cliente ajeno")
    _, filas = csv_filas(s["client"], "clientes")
    assert filas[0] == [
        "Nombre", "Tipo de documento", "Número de documento", "Correo", "Teléfono", "Puntos", "Visitas",
        "Total gastado", "Última visita", "Acepta novedades",
    ]
    assert [fila[0] for fila in filas[1:]] == [
        "Acepta", "Consumidor final", "Cuenta ajena", "No acepta", "Sin cuenta"
    ]
    assert filas[1] == ["Acepta", "CE", "12345", "cliente@ejemplo.co", "3001234", "0", "0", "0", "", "Sí"]
    assert all(fila[-1] == "No" for fila in filas[2:])


def test_precio_archivo_actor_antes_despues_y_transaccion(setup):
    # Falla si un precio o un plato archivado carece de identidad e instantáneas, o si se conserva historial de un cambio revertido.
    s = setup
    save_product(account=s["person"], raw={"price": 12000}, product=s["dish"])
    registro = OrganizationAudit.objects.filter(entity="catalog.product").latest("id")
    assert registro.actor_id == s["person"].pk and registro.at
    assert registro.before["price"] == 10800 and registro.after["price"] == 12000
    total = OrganizationAudit.objects.count()
    with pytest.raises(RuntimeError):
        with transaction.atomic():
            save_product(s["person"], {"price": 15000}, s["dish"])
            raise RuntimeError("Reversión de prueba")
    s["dish"].refresh_from_db()
    assert s["dish"].price == 12000 and OrganizationAudit.objects.count() == total
    call(s["client"], "post", f"products/{s['dish'].pk}/archive")
    registro = OrganizationAudit.objects.filter(entity="catalog.product").latest("id")
    assert registro.before["active"] and not registro.after["active"]
    resultado = call(s["client"], "get", "audit")
    assert resultado["total"] >= 2 and resultado["entries"][0]["actor"]["name"] == s["person"].name
    assert call(s["client"], "get", "audit/actions")["actions"]
    assert csv_filas(s["client"], "historial", "")[1][1][5] == s["person"].name


def test_auditoria_locales_equipo_y_projectapp(setup):
    # Falla si el encargado ve acciones de ProjectApp, de otro local o del equipo fuera de su alcance.
    s = setup
    for local in (s["r1"], s["r2"]):
        call(s["client"], "put", f"catalog/restaurants/{local.pk}/products/{s['dish'].pk}", {"unavailable": True})
    plataforma = platform_client(platform_user())
    respuesta = plataforma.patch(
        "/api/platform/v1/organizations/" + s["org"].slug, {"name": "Nuevo nombre"}, format="json"
    )
    assert respuesta.status_code == 200
    registro = OrganizationAudit.objects.filter(entity="tenancy.organization").latest("id")
    assert registro.actor_kind == "platform" and registro.before["name"] == "Burger House"
    assert registro.after["name"] == "Nuevo nombre"
    encargado = pos_client(account(s["org"], "admin", "encargado", restaurants=[s["r1"]]))
    resultado = call(encargado, "get", "audit")
    assert resultado["total"] == 1
    assert all(e["restaurant"]["id"] == s["r1"].pk and e["actor"]["kind"] == "account" for e in resultado["entries"])
    assert call(encargado, "get", "audit?action=tenancy.organization.updated")["total"] == 0


def test_devolucion_y_descuento_conservan_historial(setup):
    # Falla si la devolución o el descuento de una operación pierde antes, después y persona responsable.
    s = setup
    open_shift(s)
    pedido = venta(s)
    devolver(s, pedido)
    registro = OrganizationAudit.objects.get(entity="sales.refund")
    assert registro.actor_id == s["person"].pk and registro.after["total"] == 10800
    assert registro.before == {} and registro.at
    token = _context.set((s["person"], False))
    try:
        with transaction.atomic():
            plato = OrderLine.objects.get(pk=pedido["lines"][0]["id"])
            plato.discount_pct = Decimal("10")
            plato.save(update_fields=["discount_pct"])
    finally:
        _context.reset(token)
    registro = OrganizationAudit.objects.filter(entity="sales.orderline").latest("id")
    assert registro.before["discount_pct"] == 0 and registro.after["discount_pct"] == 10
    assert registro.actor_id == s["person"].pk
    _, filas = csv_filas(s["client"], "ventas", "")
    assert any(fila[-1] == "Sí" and fila[8].startswith("-") for fila in filas[1:])


@freeze_time("2026-10-02T01:00:00Z")
def test_horas_asistencias_propinas_tarifa_y_pago_estimado(setup):
    # Falla si no recorta las asistencias al periodo, atribuye propinas al cajero o calcula mal el pago estimado.
    s = setup
    mesero = account(s["org"], "waiter", "mesero", restaurants=[s["r1"]], hourly_rate=Decimal("10000"))
    Attendance.objects.create(
        account=mesero,
        restaurant=s["r1"],
        check_in=datetime.fromisoformat("2026-10-01T04:00:00+00:00"),
        check_out=datetime.fromisoformat("2026-10-01T07:30:00+00:00"),
    )
    Attendance.objects.create(
        account=mesero, restaurant=s["r1"], check_in=datetime.fromisoformat("2026-10-02T00:00:00+00:00")
    )
    pedido = linea_venta(s)
    pedido.created_by, pedido.paid_by = mesero, s["person"]
    pedido.save()
    resultado = call(s["client"], "get", "reports/team" + PERIODO)
    fila = next(f for f in resultado["rows"] if f["account"]["id"] == mesero.pk)
    assert fila["hours"] == Decimal("3.5") and fila["shifts"] == 2
    assert fila["orders"] == 1 and fila["sales"] == Decimal("1200") and fila["tips"] == Decimal("34.56")
    assert fila["estimated_pay"] == Decimal("35034.56")
    dueno = next(f for f in resultado["rows"] if f["account"]["id"] == s["person"].pk)
    assert dueno["tips"] == 0 and dueno["estimated_pay"] is None
    assert resultado["totals"]["estimated_pay"] == Decimal("35034.56")
    _, filas = csv_filas(s["client"], "equipo")
    assert next(f for f in filas[1:] if f[0] == "Mesero")[-1] == "35034,56"
    encargado = pos_client(account(s["org"], "admin", "encargado", restaurants=[s["r1"]]))
    assert encargado.get(BASE + "reports/team").status_code == 403
    assert encargado.get(BASE + "exports/equipo").status_code == 403


def test_tarifa_solo_dueno_y_decimal_no_negativo(setup):
    # Falla si el encargado modifica la tarifa o se admiten valores negativos o ambiguos.
    s = setup
    mesero = account(s["org"], "waiter", "mesero", restaurants=[s["r1"]])
    encargado = pos_client(account(s["org"], "admin", "encargado", restaurants=[s["r1"]]))
    assert encargado.patch(BASE + f"team/{mesero.pk}", {"hourly_rate": 10}, format="json").status_code == 403
    for invalida in (-1, True, "100", 1.001):
        assert (
            s["client"].patch(BASE + f"team/{mesero.pk}", {"hourly_rate": invalida}, format="json").status_code == 400
        )
    respuesta = s["client"].patch(BASE + f"team/{mesero.pk}", {"hourly_rate": 1234.56}, format="json")
    assert respuesta.status_code == 200 and respuesta.data["person"]["hourly_rate"] == 1234.56
    mesero.refresh_from_db()
    assert mesero.hourly_rate == Decimal("1234.56")
