from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from catalog.models import CatalogRevision, Product, RestaurantPrice, RestaurantUnavailable
from catalog.reading import CatalogData
from inventory.models import Stock, StockMove
from notifications.models import Notification
from sales.models import CashShift, Course, Order, Payment, PaymentMethod
from tables.models import Floor, Table
from tenancy.tests.helpers import account, pos_client

from .helpers import call, cash_method, line, open_shift, order, pay, payment

pytestmark = pytest.mark.django_db


def test_seed_and_unique_shift(setup):
    # Falla si faltan los ajustes, los métodos o el piso inicial, o se abren dos turnos.
    s = setup
    assert s["r1"].settings.alert_late_minutes == 18
    assert s["r1"].floors.get().name == "Salón"
    assert PaymentMethod.objects.filter(organization=s["org"], restaurants__isnull=True).count() == 3
    first = open_shift(s)
    call(s["client"], "post", "shifts", {"restaurant_id": s["r1"].pk, "opening_cash": 0, "notes": ""}, 409)
    open_shift(s, restaurant=s["r2"])
    assert first["opened_at"].endswith("Z")


def test_snapshot_totals_idempotence_and_etag(setup):
    # Falla si se usa el precio base, se recalculan impuestos históricos o un pedido cambia el ETag.
    s = setup
    RestaurantPrice.objects.create(restaurant=s["r1"], product=s["dish"], price=21600)
    revision = CatalogRevision.objects.get(organization=s["org"]).version
    open_shift(s)
    uid = str(uuid4())
    o = order(s, uuid=uid)
    assert (o["subtotal"], o["tax"], o["total"]) == (20000, 1600, 21600)
    assert o["lines"][0]["unit_price"] == 21600
    response = call(
        s["client"],
        "post",
        "orders",
        {"restaurant_id": s["r1"].pk, "uuid": uid, "service": "takeout", "lines": [], "fire": False},
    )
    assert response["order"]["id"] == o["id"]
    s["tax"].amount = 19
    s["tax"].save()
    assert Order.objects.get(pk=o["id"]).lines.get().taxes[0]["amount"] == 8
    assert CatalogRevision.objects.get(organization=s["org"]).version == revision
    call(
        s["client"],
        "post",
        "orders",
        {
            "restaurant_id": s["r1"].pk,
            "uuid": str(uuid4()),
            "service": "takeout",
            "lines": [line(s)],
            "fire": False,
            "total": 1,
        },
        400,
    )


def test_numbering_local_day_service_and_restaurant(setup, monkeypatch):
    # Falla si la numeración mezcla servicios, sedes o días UTC con el día de Bogotá.
    s = setup
    open_shift(s)
    open_shift(s, restaurant=s["r2"])
    Stock.objects.filter(restaurant=s["r2"]).update(qty=10)
    monkeypatch.setattr("sales.services.timezone.now", lambda: datetime(2026, 10, 2, 3, tzinfo=UTC))
    a = order(s)
    b = order(s)
    c = order(s, service="delivery")
    d = order(s, restaurant=s["r2"])
    assert [x["number"] for x in (a, b, c, d)] == ["TA-001", "TA-002", "DE-001", "TA-001"]
    monkeypatch.setattr("sales.services.timezone.now", lambda: datetime(2026, 10, 2, 6, tzinfo=UTC))
    assert order(s)["number"] == "TA-001"


@pytest.mark.parametrize("kind", ["closed", "table", "unavailable", "archived", "outside", "stock"])
def test_order_rejections(setup, kind):
    # Falla si un pedido entra sin caja, mesa válida, carta activa o disponibilidad.
    s = setup
    if kind != "closed":
        open_shift(s)
    if kind == "unavailable":
        RestaurantUnavailable.objects.create(restaurant=s["r1"], product=s["dish"])
    if kind == "archived":
        s["dish"].active = False
        s["dish"].save()
    if kind == "outside":
        s["dish"].available_in_pos = False
        s["dish"].save()
    if kind == "stock":
        Stock.objects.filter(restaurant=s["r1"]).update(qty=0)
    data = {
        "restaurant_id": s["r1"].pk,
        "uuid": str(uuid4()),
        "service": "dine_in" if kind == "table" else "takeout",
        "lines": [line(s)],
        "fire": False,
    }
    response = call(s["client"], "post", "orders", data, 409 if kind == "closed" else 400)
    assert response["error"] == (
        "shift_closed" if kind == "closed" else "invalid_data" if kind == "table" else "unavailable"
    )


def test_combo_options_and_pending(setup):
    # Falla si el combo cobra componentes o duplica sus reservas de ingredientes.
    s = setup
    open_shift(s)
    second = Product.objects.create(organization=s["org"], name="Agua", kind="dish", price=3000)
    combo = Product.objects.create(
        organization=s["org"],
        name="Combo",
        kind="dish",
        price=15000,
        diner_attributes={"combo": [{"producto": s["dish"].pk, "cantidad": 2}, {"producto": second.pk, "cantidad": 1}]},
    )
    o = order(
        s,
        lines=[
            line(
                s,
                product_id=combo.pk,
                options=[{"group": "Tamaño", "name": "Grande", "price_extra": 2000}],
                children=[line(s, qty=2), line(s, product_id=second.pk)],
            )
        ],
    )
    assert o["total"] == 17000 and [line["total"] for line in o["lines"]] == [17000, 0, 0]
    data = CatalogData(s["org"], [s["r1"]])
    row = data.quantities(s["dish"].pk, s["r1"].pk)[0]
    assert (row["pending"], row["free"], row["servings"]) == (0.5, 2.5, 10)
    payment(s, o)
    pay(s, o)
    pay(s, o)
    assert StockMove.objects.filter(kind="sale").count() == 1
    assert Stock.objects.get(restaurant=s["r1"], ingredient=s["ingredient"]).qty == Decimal("2.5")
    assert CatalogData(s["org"], [s["r1"]]).pending[(s["r1"].pk, s["ingredient"].pk)] == 0


def test_prepay_and_inventory_shortage(setup):
    # Falla si el prepago dispara antes de cobrar o un faltante deja existencias negativas.
    s = setup
    open_shift(s)
    settings = s["r1"].settings
    settings.kitchen_prepay_roles = ["owner"]
    settings.save()
    o = order(s)
    result = call(s["client"], "post", f"orders/{o['id']}/fire", status=409)
    assert result["error"] == "prepay_required"
    assert not Course.objects.exists()
    payment(s, o)
    Stock.objects.filter(restaurant=s["r1"]).update(qty=Decimal(".1"))
    paid = pay(s, o)
    assert paid["courses"] and paid["state"] == "paid"
    move = StockMove.objects.get(kind="sale")
    assert move.qty == Decimal("-.1") and "faltaron" in move.reason
    pay(s, o)
    assert StockMove.objects.filter(kind="sale").count() == 1


def test_payment_change_tip_and_cash(setup):
    # Falla si el cambio se resta dos veces, se acepta sobrepago o se pierde la propina.
    s = setup
    shift = open_shift(s)
    o = order(s)
    o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": 1200})["order"]
    assert o["total"] == 12000
    key = uuid4().hex
    payment(s, o, 5000, received=10000, request_key=key)
    payment(s, o, 5000, received=10000, request_key=key)
    assert Payment.objects.count() == 1
    assert call(s["client"], "post", f"orders/{o['id']}/pay", status=400)["error"] == "unpaid"
    assert (
        call(
            s["client"],
            "post",
            f"orders/{o['id']}/payments",
            {"method_id": cash_method(s).pk, "amount": 7001, "request_key": uuid4().hex},
            400,
        )["error"]
        == "overpaid"
    )
    bank = PaymentMethod.objects.filter(type="bank").first()
    payment(s, o, 7000, method_id=bank.pk)
    result = pay(s, o)
    assert result["change"] == 5000 and result["paid"] == 12000
    call(s["client"], "post", f"shifts/{shift['id']}/moves", {"kind": "in", "amount": 100, "reason": "Cambio"})
    call(s["client"], "post", f"shifts/{shift['id']}/moves", {"kind": "out", "amount": 50, "reason": "Compra"})
    report = call(s["client"], "get", f"shifts/{shift['id']}/closing")
    assert report["expected_cash"] == 6050 and report["cash_payments"] == 10000
    assert report["orders_total"] == 10800 and report["other_methods"][0]["amount"] == 7000
    result = call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": 6050, "notes": ""})
    assert result["shift"]["difference"] == 0


@pytest.mark.parametrize("counted,tolerance,notify", [(900, 100, False), (899, 100, True), (1101, 100, True)])
def test_closing_note_tolerance_and_recipients(setup, counted, tolerance, notify):
    # Falla si se cierra sin nota o se avisa dentro de tolerancia o a encargados ajenos.
    s = setup
    shift = open_shift(s)
    admin = account(s["org"], "admin", "encargado", restaurants=[s["r1"]])
    account(s["org"], "admin", "otro", restaurants=[s["r2"]])
    call(s["client"], "put", "settings/cash", {"tolerance": tolerance})
    assert (
        call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": counted}, 400)["error"]
        == "note_required"
    )
    result = call(
        s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": counted, "notes": "Diferencia contada"}
    )
    assert result["shift"]["over_tolerance"] == notify
    recipients = set(Notification.objects.filter(kind="cash").values_list("recipient_id", flat=True))
    assert recipients == ({s["person"].pk, admin.pk} if notify else set())


@pytest.mark.parametrize("role", ["owner", "admin", "cashier"])
def test_nobody_closes_with_drafts(setup, role):
    # Falla si algún rol puede cerrar caja dejando borradores.
    s = setup
    shift = open_shift(s)
    order(s)
    person = account(s["org"], role, "cierre", restaurants=[] if role == "owner" else [s["r1"]])
    client = pos_client(person)
    assert (
        call(client, "post", f"shifts/{shift['id']}/close", {"counted_cash": 1000, "notes": "No fuerza"}, 409)["error"]
        == "open_orders"
    )


def test_kitchen_line_and_course_workflow(setup):
    # Falla si preparar, listar, servir parcialmente o cerrar cursos rompe las dos manos.
    s = setup
    open_shift(s)
    waiter = account(s["org"], "waiter", "mesero", restaurants=[s["r1"]])
    wc = pos_client(waiter)
    o = order(s, lines=[line(s), line(s)], fire=True)
    cid = o["courses"][0]["id"]
    ids = [line["id"] for line in o["lines"]]
    assert call(wc, "post", f"courses/{cid}/serve", status=400)["error"] == "not_ready"
    call(s["client"], "post", f"courses/{cid}/start")
    assert (
        call(s["client"], "delete", f"orders/{o['id']}/lines", {"line_ids": [ids[0]]}, 409)["error"] == "not_editable"
    )
    call(s["client"], "post", "lines/ready", {"line_ids": [ids[0]]})
    call(wc, "post", f"courses/{cid}/serve")
    assert Course.objects.get(pk=cid).served_at is None
    assert Notification.objects.filter(kind="kitchen", recipient=waiter).count() == 1
    call(s["client"], "post", "lines/ready", {"line_ids": [ids[1]]})
    call(s["client"], "post", "lines/ready", {"line_ids": [ids[1]]})
    assert Notification.objects.filter(kind="kitchen", recipient=waiter).count() == 2
    assert Course.objects.get(pk=cid).ready_at
    call(wc, "post", "lines/serve", {"line_ids": [ids[1]]})
    assert Course.objects.get(pk=cid).served_at
    assert call(s["client"], "get", f"kitchen/tickets?restaurant_id={s['r1'].pk}")["tickets"] == []


def test_ready_course_and_cancel_empty(setup):
    # Falla si «listo todo» no arranca el curso o cancelar la última línea deja un borrador vacío.
    s = setup
    open_shift(s)
    a = order(s, fire=True)
    cid = a["courses"][0]["id"]
    ready = call(s["client"], "post", f"courses/{cid}/ready")["course"]
    assert ready["ready_at"] and ready["preparation_at"]
    b = order(s, fire=True)
    bid = b["courses"][0]["id"]
    result = call(s["client"], "delete", f"orders/{b['id']}/lines", {"line_ids": [b["lines"][0]["id"]]})["order"]
    assert result["state"] == "cancelled" and result["lines"] == [] and not Course.objects.filter(pk=bid).exists()


def test_calls_move_and_release(setup):
    # Falla si mover ocupa otra cuenta o cobrar apaga una llamada con otra cuenta pendiente.
    s = setup
    floor = s["r1"].floors.get()
    t1 = Table.objects.create(floor=floor, number=1)
    t2 = Table.objects.create(floor=floor, number=2, x=200)
    open_shift(s)
    a = order(s, service="dine_in", table_id=t1.pk)
    b = order(s, service="dine_in", table_id=t1.pk)
    order(s, service="dine_in", table_id=t2.pk)
    call(s["client"], "put", f"tables/{t1.pk}/call", {"kind": "bill"})
    assert call(s["client"], "patch", f"orders/{a['id']}", {"table_id": t2.pk}, 409)["error"] == "table_busy"
    payment(s, a)
    pay(s, a)
    t1.refresh_from_db()
    assert t1.call == "bill"
    payment(s, b)
    pay(s, b)
    t1.refresh_from_db()
    assert t1.call == "none" and t1.call_at is None


def test_batch_order_reads(setup, django_assert_num_queries):
    # Falla si listar pedidos añade consultas por cada pedido, línea, curso o pago.
    s = setup
    open_shift(s)
    a = order(s, fire=True)
    payment(s, a)
    pay(s, a)
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    with CaptureQueriesContext(connection) as first:
        call(s["client"], "get", f"orders?restaurant_id={s['r1'].pk}&state=paid")
    for _ in range(4):
        o = order(s, fire=True)
        payment(s, o)
        pay(s, o)
    with CaptureQueriesContext(connection) as second:
        result = call(s["client"], "get", f"orders?restaurant_id={s['r1'].pk}&state=paid")
    assert len(result["orders"]) == 5 and len(second) == len(first)


def test_create_restaurant_copy_settings(setup):
    # Falla si la siembra «como otro» pierde ajustes o comparte referencias mutables de prepago.
    from tenancy.services import create_restaurant

    s = setup
    s["org"].max_restaurants = 3
    s["org"].save()
    settings = s["r1"].settings
    settings.alert_late_minutes = 27
    settings.kitchen_prepay_roles = ["waiter"]
    settings.save()
    new = create_restaurant(s["person"], {"name": "Sur", "slug": "sur"}, source_restaurant=s["r1"])
    assert new.settings.alert_late_minutes == 27 and new.settings.kitchen_prepay_roles == ["waiter"]
    assert new.floors.get().name == "Salón" and PaymentMethod.objects.filter(restaurants=new, type="cash").count() == 1


def test_payment_key_conflict_and_editing_paid_lines(setup):
    # Falla si se reutiliza la clave para otro pago o una línea pagada se elimina.
    s = setup
    open_shift(s)
    a = order(s)
    b = order(s)
    key = uuid4().hex
    payment(s, a, 100, request_key=key)
    result = call(
        s["client"],
        "post",
        f"orders/{b['id']}/payments",
        {"method_id": cash_method(s).pk, "amount": 100, "request_key": key},
        409,
    )
    assert result["error"] == "request_key_conflict"
    assert (
        call(s["client"], "delete", f"orders/{a['id']}/lines", {"line_ids": [a["lines"][0]["id"]]}, 409)["error"]
        == "not_editable"
    )
    assert call(s["client"], "post", f"orders/{a['id']}/cancel", {"reason": "No"}, 409)["error"] == "not_editable"


def test_pending_limits_whole_round_and_cancellation(setup):
    # Falla si dos líneas de la misma ronda reservan más porciones disponibles o cancelar no las libera.
    s = setup
    open_shift(s)
    Stock.objects.filter(restaurant=s["r1"]).update(qty=Decimal(".25"))
    result = call(
        s["client"],
        "post",
        "orders",
        {
            "restaurant_id": s["r1"].pk,
            "uuid": str(uuid4()),
            "service": "takeout",
            "lines": [line(s), line(s)],
            "fire": False,
        },
        400,
    )
    assert result["error"] == "unavailable" and not Order.objects.exists()
    o = order(s)
    assert CatalogData(s["org"], [s["r1"]]).servings(s["dish"].pk, s["r1"].pk) == 0
    call(s["client"], "post", f"orders/{o['id']}/cancel", {"reason": "Se retiró"})
    assert CatalogData(s["org"], [s["r1"]]).servings(s["dish"].pk, s["r1"].pk) == 1


def test_prepay_creation_rolls_back(setup):
    # Falla si crear con fire y prepago deja un pedido fantasma tras devolver el error.
    s = setup
    open_shift(s)
    config = s["r1"].settings
    config.kitchen_prepay_roles = ["owner"]
    config.save()
    result = call(
        s["client"],
        "post",
        "orders",
        {"restaurant_id": s["r1"].pk, "uuid": str(uuid4()), "service": "takeout", "lines": [line(s)], "fire": True},
        409,
    )
    assert result["error"] == "prepay_required" and not Order.objects.exists()


def test_policy_changes_are_effective_for_live_sessions(setup):
    # Falla si una sesión viva conserva permisos viejos al cambiar la política del dueño.
    from sales.policy import default_role_policy

    s = setup
    open_shift(s)
    o = order(s)
    waiter = account(s["org"], "waiter", "mesero", restaurants=[s["r1"]])
    client = pos_client(waiter)
    call(client, "put", f"orders/{o['id']}/tip", {"amount": 1}, 403)
    policy = default_role_policy()
    policy["waiter"]["actions"].append("charge_orders")
    call(s["client"], "put", "settings/roles", policy)
    call(client, "put", f"orders/{o['id']}/tip", {"amount": 1})
    assert call(client, "get", f"settings?restaurant_id={s['r1'].pk}")["can_charge"] is True
    policy["waiter"]["actions"] = []
    call(s["client"], "put", "settings/roles", policy)
    call(client, "post", f"orders/{o['id']}/fire", {}, 403)


def test_database_unique_open_shift(setup):
    # Falla si dos escritores que eviten la API pueden dejar dos turnos abiertos en una sede.
    from django.db import IntegrityError, transaction

    s = setup
    open_shift(s)
    with pytest.raises(IntegrityError), transaction.atomic():
        CashShift.objects.create(restaurant=s["r1"], opened_by=s["person"])


def test_seed_migration_is_idempotent(setup):
    # Falla si migrar restaurantes existentes duplica medios de pago o pisos.
    import importlib

    from django.apps import apps
    from django.db import connection

    from sales.models import RestaurantSettings

    PaymentMethod.objects.all().delete()
    Floor.objects.all().delete()
    RestaurantSettings.objects.all().delete()
    seed = importlib.import_module("sales.migrations.0002_seed_restaurants").seed
    from types import SimpleNamespace

    editor = SimpleNamespace(connection=connection)
    seed(apps, editor)
    seed(apps, editor)
    assert PaymentMethod.objects.count() == 4 and Floor.objects.count() == 2 and RestaurantSettings.objects.count() == 2


def test_reports_skip_combo_components(setup):
    # Falla si los componentes gratuitos inflan top products o el conteo de ventas.
    s = setup
    open_shift(s)
    second = Product.objects.create(organization=s["org"], name="Agua", kind="dish", price=3000)
    combo = Product.objects.create(
        organization=s["org"],
        name="Combo",
        kind="dish",
        price=15000,
        diner_attributes={"combo": [{"producto": s["dish"].pk, "cantidad": 1}, {"producto": second.pk, "cantidad": 1}]},
    )
    o = order(s, lines=[line(s, product_id=combo.pk, children=[line(s), line(s, product_id=second.pk)])])
    payment(s, o)
    pay(s, o)
    result = call(s["client"], "get", f"sales/summary?restaurant_id={s['r1'].pk}")
    assert result["top_products"] == [{"product": "Combo", "qty": 1, "amount": 15000}]


def test_closings_manager_scope(setup):
    # Falla si el encargado ve cuadres ajenos o el dueño pierde los de alguna sede.
    s = setup
    first = open_shift(s)
    second = open_shift(s, restaurant=s["r2"])
    for shift in (first, second):
        call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": 1000})
    admin = account(s["org"], "admin", "encargado", restaurants=[s["r1"]])
    client = pos_client(admin)
    assert len(call(client, "get", "shifts/closings")["closings"]) == 1
    assert len(call(s["client"], "get", "shifts/closings")["closings"]) == 2


def test_notification_includes_order_id(setup):
    # Falla si el aviso listo no lleva el order_id necesario para la acción «servir» del POS.
    s = setup
    waiter = account(s["org"], "waiter", "mesero", restaurants=[s["r1"]])
    client = pos_client(waiter)
    open_shift(s)
    o = order(s, fire=True)
    call(s["client"], "post", f"courses/{o['courses'][0]['id']}/ready")
    result = call(client, "get", "notifications")["notifications"][0]
    assert result["order_id"] == o["id"] and result["action"] == "serve"
