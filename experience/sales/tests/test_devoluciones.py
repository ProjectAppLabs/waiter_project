"""Contrato U1: importes históricos, caja, permisos y efectos de las devoluciones."""

from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4
from xml.etree import ElementTree

import pytest
from django.db import IntegrityError, transaction
from freezegun import freeze_time

from billing.models import Resolution, SalesDocument
from billing.tests.helpers import configured, emit
from catalog.models import Product, RecipeLine
from inventory.models import Stock, StockMove
from loyalty.models import Customer, LoyaltyCard, LoyaltyMove, LoyaltyProgram
from notifications.models import Notification
from sales.models import Order, OrderLine, PaymentMethod, Refund
from sales.policy import default_role_policy
from sales.services import recalculate
from tenancy.tests.helpers import account, organization, pos_client, restaurant

from .helpers import call, cash_method, line, open_shift, order, pay, payment

pytestmark = pytest.mark.django_db


def venta(s, cantidad=2, propina=1000):
    o = order(s, lines=[line(s, qty=cantidad)])
    if propina:
        o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": propina})["order"]
    payment(s, o)
    return pay(s, o)


def datos(s, o, cantidad=1, propina=0, **cambios):
    total = o["lines"][0]["total"] / o["lines"][0]["qty"] * cantidad + propina
    return dict(
        lines=[{"line_id": o["lines"][0]["id"], "qty": cantidad}],
        tip=propina,
        payments=[{"method_id": cash_method(s).pk, "amount": round(total, 2)}] if total else [],
        reason="Plato devuelto",
        restock=False,
        request_key=uuid4().hex,
        **cambios,
    )


def devolver(s, o, cuerpo=None, estado=200):
    return call(s["client"], "post", f"orders/{o['id']}/refunds", cuerpo or datos(s, o), estado)


def test_devolucion_parcial_total_y_saldos(setup):
    # Falla si devuelve precios actuales, duplica cantidades o altera el estado pagado.
    s = setup
    open_shift(s)
    o = venta(s)
    s["dish"].price = 99999
    s["dish"].save()
    first = devolver(s, o)
    assert first["refund"]["total"] == 10800 and first["order"]["refunded"] == 10800
    assert first["credit_note"] is None and first["order"]["state"] == "paid"
    available = call(s["client"], "get", f"orders/{o['id']}/refundable")
    assert available["lines"][0] == dict(
        line_id=o["lines"][0]["id"], name="Papas", qty=2, refundable_qty=1, unit_amount=10800, refundable_amount=10800
    )
    assert available["tip"] == 1000 and available["payments"][0]["refundable"] == 11800
    assert len(available["refunds"]) == 1 and not available["credit_note"]
    second = devolver(s, o, datos(s, o, propina=1000))
    assert second["order"]["refunded"] == o["total"]
    assert devolver(s, o, estado=409)["error"] == "not_refundable"
    assert Notification.objects.filter(kind="cash", res_model="sales.Refund", recipient=s["person"]).count() == 2


@pytest.mark.parametrize(
    "fallo", ["cantidad", "linea", "duplicada", "propina", "suma", "metodo", "motivo", "vacia", "clave", "precision"]
)
def test_datos_invalidos_no_producen_efectos(setup, fallo):
    # Falla si cantidades, métodos o campos inválidos dejan una devolución o afectan caja e inventario.
    s = setup
    open_shift(s)
    o = venta(s)
    data = datos(s, o)
    if fallo == "cantidad":
        data["lines"][0]["qty"] = 3
    elif fallo == "linea":
        data["lines"][0]["line_id"] = 999999
    elif fallo == "duplicada":
        data["lines"] *= 2
    elif fallo == "propina":
        data["tip"] = 1001
    elif fallo == "suma":
        data["payments"][0]["amount"] -= 1
    elif fallo == "metodo":
        data["payments"][0]["method_id"] = PaymentMethod.objects.filter(organization=s["org"], type="bank").first().pk
    elif fallo == "motivo":
        data["reason"] = "  no "
    elif fallo == "vacia":
        data["lines"], data["payments"] = [], []
    elif fallo == "clave":
        data["request_key"] = "corta"
    else:
        data["lines"][0]["qty"] = 0.0000001
    assert devolver(s, o, data, 400)["error"] == "invalid_data"
    assert not Refund.objects.exists()
    assert not StockMove.objects.filter(kind="return").exists()
    assert Order.objects.get(pk=o["id"]).refunded == 0


def test_no_devuelve_borrador_ni_sin_caja(setup):
    # Falla si permite devolver ventas no pagadas o retirar dinero sin un turno abierto.
    s = setup
    shift = open_shift(s)
    o = order(s)
    assert devolver(s, o, estado=409)["error"] == "not_refundable"
    payment(s, o)
    o = pay(s, o)
    call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": 11800})
    assert devolver(s, o, estado=409)["error"] == "shift_closed"


def test_idempotencia_incluso_despues_del_cierre_y_clave_exacta(setup):
    # Falla si un reintento duplica efectos, acepta otra carga o confunde mayúsculas en la clave.
    s = setup
    shift = open_shift(s)
    o = venta(s, propina=0)
    data = datos(s, o)
    data["request_key"] = "DevolucionExacta123"
    first = devolver(s, o, data)
    assert devolver(s, o, data) == first
    changed = {**data, "reason": "Otro motivo"}
    assert devolver(s, o, changed, 409)["error"] == "request_key_conflict"
    other = devolver(s, o, {**data, "request_key": data["request_key"].lower()})
    assert other["refund"]["id"] != first["refund"]["id"]
    call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": 1000})
    assert devolver(s, o, data)["refund"] == first["refund"]
    assert Refund.objects.count() == 2


def test_cuadre_usa_turno_actual_y_descuenta_solo_efectivo(setup):
    # Falla si una devolución de ayer cambia su cierre o descuenta tarjeta del efectivo esperado.
    s = setup
    old = open_shift(s)
    o = order(s)
    bank = PaymentMethod.objects.filter(organization=s["org"], type="bank").first()
    payment(s, o, amount=5000)
    payment(s, o, amount=5800, method_id=bank.pk)
    o = pay(s, o)
    call(s["client"], "post", f"shifts/{old['id']}/close", {"counted_cash": 6000})
    current = open_shift(s, amount=10000)
    data = datos(s, o)
    data["payments"] = [{"method_id": cash_method(s).pk, "amount": 5000}, {"method_id": bank.pk, "amount": 5800}]
    returned = devolver(s, o, data)
    assert returned["refund"]["shift_id"] == current["id"]
    report = call(s["client"], "get", f"shifts/{current['id']}/closing")
    assert report["refunds_cash"] == 5000 and report["expected_cash"] == 5000
    assert len(report["refunds"]) == 1
    assert call(s["client"], "get", f"shifts/{old['id']}/closing")["expected_cash"] == 6000
    closed = call(s["client"], "post", f"shifts/{current['id']}/close", {"counted_cash": 5000})["shift"]
    assert closed["expected_cash"] == 5000 and closed["difference"] == 0


def test_limite_acumulado_por_metodo(setup):
    # Falla si la segunda devolución supera lo originalmente cobrado por un método.
    s = setup
    open_shift(s)
    o = order(s, lines=[line(s, qty=2)])
    bank = PaymentMethod.objects.filter(organization=s["org"], type="bank").first()
    payment(s, o, amount=10800)
    payment(s, o, amount=10800, method_id=bank.pk)
    o = pay(s, o)
    devolver(s, o)
    assert devolver(s, o, estado=400)["error"] == "invalid_data"
    data = datos(s, o)
    data["payments"][0]["method_id"] = bank.pk
    assert devolver(s, o, data)["order"]["refunded"] == 21600


@pytest.mark.parametrize("rol", ["waiter", "cashier", "admin", "owner"])
def test_permiso_y_concesion_al_cajero(setup, rol):
    # Falla si un rol devuelve sin permiso o el dueño no puede concedérselo al cajero.
    s = setup
    open_shift(s)
    o = venta(s)
    original = s["client"]
    s["client"] = pos_client(account(s["org"], rol, "operador", restaurants=[] if rol == "owner" else [s["r1"]]))
    status = 200 if rol in ("admin", "owner") else 403
    result = devolver(s, o, estado=status)
    call(s["client"], "get", f"orders/{o['id']}/refundable", status=status)
    call(s["client"], "get", "refunds", status=200 if rol in ("admin", "owner") else 403)
    if status == 403:
        assert result["error"] == "forbidden"
    if rol == "cashier":
        policy = default_role_policy()
        policy["cashier"]["actions"].append("refund_orders")
        call(original, "put", "settings/roles", policy)
        assert devolver(s, o)["refund"]["total"] == 10800


def test_aislamiento_organizacion_y_restaurante(setup):
    # Falla si se consulta o devuelve una venta ajena, o se acepta un método de otra organización.
    s = setup
    open_shift(s)
    o = venta(s)
    foreign = organization("otra")
    foreign_restaurant = restaurant(foreign)
    outsider = pos_client(account(foreign))
    call(outsider, "get", f"orders/{o['id']}/refundable", status=404)
    call(outsider, "post", f"orders/{o['id']}/refunds", datos(s, o), 404)
    admin = pos_client(account(s["org"], "admin", "norte", restaurants=[s["r2"]]))
    call(admin, "post", f"orders/{o['id']}/refunds", datos(s, o), 404)
    data = datos(s, o)
    data["payments"][0]["method_id"] = PaymentMethod.objects.get(type="cash", restaurants=foreign_restaurant).pk
    assert devolver(s, o, data, 400)["error"] == "invalid_data"
    devolver(s, o)
    assert call(outsider, "get", "refunds")["refunds"] == []
    assert call(admin, "get", "refunds")["refunds"] == []


def test_inventario_opcional_y_receta_historica(setup):
    # Falla si repone sin autorización, repone dos veces o utiliza una receta editada tras cobrar.
    s = setup
    open_shift(s)
    o = venta(s, propina=0)
    stock = Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"])
    assert stock.qty == Decimal("2.5")
    devolver(s, o)
    stock.refresh_from_db()
    assert stock.qty == Decimal("2.5")
    RecipeLine.objects.filter(recipe=s["recipe"]).update(qty=1000)
    data = datos(s, o)
    data["restock"] = True
    devolver(s, o, data)
    devolver(s, o, data)
    stock.refresh_from_db()
    assert stock.qty == Decimal("2.75")
    assert StockMove.objects.get(kind="return").qty == Decimal("0.25")


def test_puntos_revertidos_sin_negativos_y_sin_propina(setup):
    # Falla si revierte puntos por propina o deja saldo negativo sin anotar la diferencia.
    s = setup
    open_shift(s)
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    customer = Customer.objects.create(organization=s["org"], name="Comensal")
    o = order(s)
    call(s["client"], "patch", f"orders/{o['id']}", {"customer_id": customer.pk})
    o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": 1000})["order"]
    payment(s, o)
    o = pay(s, o)
    card = LoyaltyCard.objects.get(customer=customer)
    assert card.points == Decimal("10.8")
    card.points = 2
    card.save()
    data = datos(s, o)
    data.update(lines=[], tip=1000, payments=[{"method_id": cash_method(s).pk, "amount": 1000}])
    devolver(s, o, data)
    assert not LoyaltyMove.objects.filter(kind="reversal").exists()
    devolver(s, o)
    card.refresh_from_db()
    assert card.points == 0
    movement = LoyaltyMove.objects.get(kind="reversal")
    assert movement.points == -2 and "8.800000" in movement.description


def test_canje_devuelto_proporcional_y_sin_sobrepago(setup):
    # Falla si el canje se devuelve como dinero o los puntos no regresan al devolver los platos.
    s = setup
    open_shift(s)
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    customer = Customer.objects.create(organization=s["org"], name="Comensal")
    card = LoyaltyCard.objects.create(organization=s["org"], customer=customer, points=100)
    o = order(s, lines=[line(s, qty=2)])
    from loyalty.services import redeem
    from sales.services import writing

    with writing(s["org"]):
        redeem(Order.objects.get(pk=o["id"]), card.pk)
    o = call(s["client"], "get", f"orders/{o['id']}")["order"]
    payment(s, o)
    o = pay(s, o)
    available = call(s["client"], "get", f"orders/{o['id']}/refundable")
    assert len(available["lines"]) == 1 and available["lines"][0]["refundable_amount"] == 11600
    data = datos(s, o)
    data["payments"][0]["amount"] = 5800
    devolver(s, o, data)
    card.refresh_from_db()
    assert card.points == Decimal("55.8")
    data["request_key"] = uuid4().hex
    result = devolver(s, o, data)
    card.refresh_from_db()
    assert result["order"]["refunded"] == 11600 and card.points == 100


def test_nota_credito_original_numeracion_y_xml(setup):
    # Falla si NC usa la resolución, pierde su original, duplica el documento o no genera XML de nota crédito.
    s = configured(setup)
    o = venta(s)
    original = emit(s, o)
    before = Resolution.objects.get(organization=s["org"]).next_number
    first = devolver(s, o)["credit_note"]
    second = devolver(s, o, datos(s, o, propina=1000))["credit_note"]
    assert first["kind"] == "credit_note" and first["number"] == "NC-1"
    assert second["number"] == "NC-2" and second["tip"] == 1000
    assert first["original_id"] == original["id"] and first["resolution_id"] is None
    assert first["subtotal"] == 10000 and first["tax_total"] == 800 and first["state"] == "issued"
    assert Resolution.objects.get(organization=s["org"]).next_number == before
    assert Order.objects.get(pk=o["id"]).documents.count() == 3
    assert call(s["client"], "get", "billing/orders")["orders"][0]["document_id"] == original["id"]
    assert call(s["client"], "get", "billing/orders?pending=1")["orders"] == []
    again = call(s["client"], "post", f"billing/orders/{o['id']}/document", {"request_key": uuid4().hex})["document"]
    assert again["id"] == original["id"]
    document = SalesDocument.objects.get(pk=first["id"])
    with document.xml.open() as stream:
        root = ElementTree.parse(stream).getroot()
    assert root.tag.endswith("CreditNote")
    assert original["number"] in ElementTree.tostring(root).decode()
    detail = call(s["client"], "get", f"documents/{first['id']}/detail")
    assert detail["original"] == original["number"] and detail["lines"][0]["credit"] == 10800
    buyer = SalesDocument.objects.get(pk=original["id"]).buyer
    from loyalty.api import customers

    assert customers(s["org"]).get(pk=buyer.pk).invoiced == 0


def test_nota_credito_contingencia_no_repite_devolucion(setup):
    # Falla si una caída del proveedor pierde la devolución o consume otro número al reintentar.
    s = configured(setup)
    o = venta(s)
    emit(s, o)
    data = datos(s, o)
    with patch("billing.services.provider") as provider:
        provider.return_value.issue.side_effect = TimeoutError()
        first = devolver(s, o, data)
    assert first["credit_note"]["state"] == "contingency"
    assert devolver(s, o, data) == first
    restored = call(s["client"], "post", f"documents/{first['credit_note']['id']}/retry")["document"]
    assert restored["state"] == "issued" and restored["number"] == "NC-1"
    assert Refund.objects.count() == 1


def test_informes_netos_en_fecha_de_devolucion(setup):
    # Falla si la devolución reescribe ayer, incluye propina en ventas o borra costos sin reponer inventario.
    s = setup
    with freeze_time("2026-10-01T15:00:00Z"):
        open_shift(s)
        o = venta(s)
    with freeze_time("2026-10-02T15:00:00Z"):
        devolver(s, o, datos(s, o, propina=500))
    summary = call(s["client"], "get", "reports/summary?from=2026-10-02&to=2026-10-02")
    assert summary["total"]["sales"] == -10800 and summary["total"]["tips"] == -500
    assert summary["total"]["previous"]["sales"] == 21600
    report = call(s["client"], "get", f"sales/summary?restaurant_id={s['r1'].pk}&from=2026-10-02&to=2026-10-02")
    assert report["total"] == -10800 and report["by_method"][0]["amount"] == -11300
    assert report["top_products"][0]["qty"] == -1
    profitability = call(s["client"], "get", "reports/profitability?from=2026-10-02&to=2026-10-02")["rows"][0]
    assert profitability["revenue"] == -10000 and profitability["gross_profit"] == -10000
    listed = call(s["client"], "get", "refunds?from=2026-10-02&to=2026-10-02")["refunds"]
    assert len(listed) == 1
    # La lista del dueño dice de qué pedido y restaurante es cada devolución.
    assert listed[0]["order_number"] == o["number"] and listed[0]["restaurant_name"] == s["r1"].name
    assert call(s["client"], "get", "refunds?from=2026-10-01&to=2026-10-01")["refunds"] == []


def test_redondeo_acumulado_y_descuento_historico(setup):
    # Falla si devolver por tercios crea centavos adicionales o ignora descuentos y cupones cobrados.
    s = setup
    open_shift(s)
    o = order(s, lines=[line(s, qty=3)])
    row = OrderLine.objects.get(order_id=o["id"])
    row.total, row.subtotal, row.discount_pct, row.coupon_code = Decimal("10"), Decimal("9.26"), 20, "PROMO20"
    row.save()
    recalculate(Order.objects.get(pk=o["id"]))
    o = call(s["client"], "get", f"orders/{o['id']}")["order"]
    payment(s, o)
    o = pay(s, o)
    for amount in [3.33, 3.34, 3.33]:
        data = datos(s, o)
        data["payments"][0]["amount"] = amount
        devolver(s, o, data)
    assert Order.objects.get(pk=o["id"]).refunded == 10
    assert sum(Decimal(str(row["subtotal"])) for r in Refund.objects.all() for row in r.lines) == Decimal("9.26")


def test_canje_total_devuelve_puntos_sin_dinero_y_nota_equilibrada(setup):
    # Falla si un canje total exige dinero, no reintegra puntos o produce una nota con totales fiscales distintos.
    s = configured(setup)
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    customer = Customer.objects.create(organization=s["org"], name="Comensal")
    card = LoyaltyCard.objects.create(organization=s["org"], customer=customer, points=108)
    o = order(s)
    from loyalty.services import redeem
    from sales.services import writing

    with writing(s["org"]):
        redeem(Order.objects.get(pk=o["id"]), card.pk)
    o = pay(s, o)
    assert o["total"] == 0
    original = emit(s, o)
    data = datos(s, o)
    data["payments"] = []
    result = devolver(s, o, data)
    card.refresh_from_db()
    assert card.points == 108 and result["refund"]["total"] == 0
    note = result["credit_note"]
    assert note["subtotal"] == original["subtotal"] == -800
    assert note["tax_total"] == original["tax_total"] == 800
    assert sum(row["base"] for row in note["lines"]) == note["subtotal"]
    assert sum(row["total"] for row in note["lines"]) == note["total"] == 0
    assert note["lines"][0]["base"] == 10000 and note["lines"][1]["base"] == -10800
    assert devolver(s, o, estado=409)["error"] == "not_refundable"
    summary = call(s["client"], "get", f"sales/summary?restaurant_id={s['r1'].pk}")
    assert summary["total"] == 0 and summary["top_products"][0]["amount"] == 0
    revenue = call(s["client"], "get", "reports/profitability")["rows"][0]["revenue"]
    assert revenue == 0


def test_combo_devuelve_componentes_y_rechaza_devolucion_suelta(setup):
    # Falla si un combo repone dos veces la receta o permite devolver por separado un componente sin precio.
    s = setup
    open_shift(s)
    combo = Product.objects.create(
        organization=s["org"],
        name="Combo",
        kind="dish",
        price=20000,
        diner_attributes={"combo": [{"producto": s["dish"].pk, "cantidad": 2}]},
    )
    o = order(s, lines=[line(s, product_id=combo.pk, children=[line(s, qty=2)])])
    payment(s, o)
    o = pay(s, o)
    child = next(row for row in o["lines"] if row["parent_id"])
    data = datos(s, o)
    data["lines"][0]["line_id"] = child["id"]
    assert devolver(s, o, data, 400)["error"] == "invalid_data"
    data["lines"][0]["line_id"] = o["lines"][0]["id"]
    data["restock"] = True
    devolver(s, o, data)
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == 3
    assert StockMove.objects.get(kind="return").qty == Decimal("0.5")


def test_reposicion_venta_antigua_y_cambio_de_unidad(setup):
    # Falla si una venta anterior a U1 pierde su reposición o convierte mal unidades históricas.
    s = setup
    open_shift(s)
    o = venta(s, propina=0)
    OrderLine.objects.filter(order_id=o["id"]).update(stock_usage=[])
    data = datos(s, o)
    data["restock"] = True
    devolver(s, o, data)
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == Decimal("2.75")
    call(s["client"], "patch", f"products/{s['ingredient'].pk}", {"unit_id": s["gram"].pk})
    data["request_key"] = uuid4().hex
    devolver(s, o, data)
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == 3000


def test_restricciones_de_documentos_y_devoluciones(setup):
    # Falla si la base permite duplicar claves u originales o guardar una factura sin resolución.
    s = configured(setup)
    o = venta(s)
    original = emit(s, o)
    result = devolver(s, o)
    record = Refund.objects.get(pk=result["refund"]["id"])
    record.pk = None
    with pytest.raises(IntegrityError), transaction.atomic():
        record.save(force_insert=True)
    document = SalesDocument.objects.get(pk=original["id"])
    document.pk = None
    document.number, document.request_key = "SETP-otro", uuid4().hex
    with pytest.raises(IntegrityError), transaction.atomic():
        document.save(force_insert=True)
    with pytest.raises(IntegrityError), transaction.atomic():
        SalesDocument.objects.filter(pk=original["id"]).update(resolution=None)


def test_puntos_por_comensal_en_mesa_compartida(setup):
    # Falla si devolver un plato revierte puntos del otro comensal de la misma mesa.
    s = setup
    open_shift(s)
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    cards = [
        LoyaltyCard.objects.create(
            organization=s["org"], customer=Customer.objects.create(organization=s["org"], name=name)
        )
        for name in ["Ana", "Luis"]
    ]
    o = order(s, lines=[line(s), line(s)])
    record = Order.objects.get(pk=o["id"])
    record.channel = "menu"
    record.save()
    for row, card in zip(record.lines.order_by("id"), cards, strict=True):
        row.loyalty_card = card
        row.save()
    payment(s, o)
    o = pay(s, o)
    devolver(s, o)
    for card in cards:
        card.refresh_from_db()
    assert cards[0].points == 0 and cards[1].points == Decimal("10.8")


def test_reposicion_no_crea_existencias_por_redondeo_o_faltantes(setup):
    # Falla si repartir un faltante entre platos repone más ingredientes de los que se descontaron.
    s = setup
    open_shift(s)
    o = order(s, lines=[line(s), line(s), line(s)])
    Stock.objects.filter(restaurant=s["r1"], ingredient=s["ingredient"]).update(qty=Decimal("0.000002"))
    payment(s, o)
    o = pay(s, o)
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == 0
    data = datos(s, o)
    data["lines"] = [{"line_id": row["id"], "qty": 1} for row in o["lines"]]
    data["payments"][0]["amount"] = o["total"]
    data["restock"] = True
    devolver(s, o, data)
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == Decimal("0.000002")


def test_clave_no_se_puede_reutilizar_en_otro_pedido(setup):
    # Falla si una clave ya utilizada devuelve otro pedido o expone su devolución como propia.
    s = setup
    open_shift(s)
    first, second = venta(s), venta(s)
    data = datos(s, first)
    devolver(s, first, data)
    other = datos(s, second)
    other["request_key"] = data["request_key"]
    assert devolver(s, second, other, 409)["error"] == "request_key_conflict"
    assert Order.objects.get(pk=second["id"]).refunded == 0


def test_notas_parciales_conservan_cada_impuesto_del_original(setup):
    # Falla si redondear cada devolución por separado traslada centavos entre impuestos del original.
    s = configured(setup)
    from catalog.models import Tax

    s["dish"].taxes.add(Tax.objects.get(organization=s["org"], amount=19))
    s["dish"].price = Decimal("0.09")
    s["dish"].save()
    o = venta(s, cantidad=3, propina=0)
    original = emit(s, o)
    amounts = {}
    for _ in range(3):
        note = devolver(s, o)["credit_note"]
        assert sum(Decimal(str(tax["amount"])) for tax in note["taxes"]) == Decimal(str(note["tax_total"]))
        for tax in note["taxes"]:
            amounts[tax["name"]] = amounts.get(tax["name"], Decimal(0)) + Decimal(str(tax["amount"]))
    assert amounts == {tax["name"]: Decimal(str(tax["amount"])) for tax in original["taxes"]}


def test_fallo_interno_revierte_todos_los_efectos(setup):
    # Falla si un error después de reponer inventario deja dinero, existencias o avisos sin devolución completa.
    s = setup
    open_shift(s)
    o = venta(s, propina=0)
    data = datos(s, o)
    data["restock"] = True
    with patch("billing.services.credit_note", side_effect=RuntimeError("Fallo de prueba")):
        with pytest.raises(RuntimeError, match="Fallo de prueba"):
            devolver(s, o, data)
    assert not Refund.objects.exists()
    assert Order.objects.get(pk=o["id"]).refunded == 0
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == Decimal("2.5")
    assert not StockMove.objects.filter(kind="return").exists()
    assert not Notification.objects.filter(res_model="sales.Refund").exists()
    assert devolver(s, o, data)["refund"]["total"] == 10800
