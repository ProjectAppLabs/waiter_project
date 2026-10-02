from datetime import UTC, datetime, timedelta

import pytest
from django.core import mail

from reservations.models import Reservation
from reservations.services import deposit_paid, public_deposit
from sales.models import CashShift, Order, Payment
from sales.tests.helpers import call, open_shift
from tables.models import Table

pytestmark = pytest.mark.django_db


@pytest.fixture
def s(setup, monkeypatch):
    monkeypatch.setattr("django.utils.timezone.now", lambda: datetime(2026, 10, 2, 15, tzinfo=UTC))
    from accounts.models import Session

    Session.objects.all().update(expires=datetime(2026, 10, 4, tzinfo=UTC))
    setup["table"] = Table.objects.create(floor=setup["r1"].floors.get(), number=1, seats=4)
    setup["table2"] = Table.objects.create(floor=setup["r1"].floors.get(), number=2, seats=4)
    setup["foreign_table"] = Table.objects.create(floor=setup["r2"].floors.get(), number=1, seats=4)
    return setup


def raw(s, **kwargs):
    return {
        "restaurant_id": s["r1"].pk,
        "customer_name": "Ana Pérez",
        "customer_email": "ana@ejemplo.co",
        "customer_phone": "3001234567",
        "people": 2,
        "date": "2026-10-02",
        "time_start": 15,
        "table_ids": [s["table"].pk],
        "notes": "Cumpleaños",
        **kwargs,
    }


def create(s, **kwargs):
    return call(s["client"], "post", "reservations", raw(s, **kwargs), 201)


def schedule(s, **kwargs):
    data = {
        "weekly": {str(i): [[10, 22]] for i in range(7)},
        "overrides": [],
        "rules": {"minNotice": 0, "maxDays": 0},
        **kwargs,
    }
    return call(s["client"], "put", f"reservations/schedule?restaurant_id={s['r1'].pk}", data)


@pytest.mark.parametrize(
    "fields",
    [
        {"time_start": 10.25},
        {"time_start": 9.5},
        {"time_start": 22},
        {"time_start": 23.5},
        {"time_start": True},
        {"people": 0},
        {"baby_chair": "sí"},
        {"prep_minutes": 20},
        {"date": "2026-02-30"},
        {"deposit_amount": 50000001},
        {"time_end": 14},
        {"customer_email": "correo"},
        {"people": 5},
        {"table_ids": []},
        {"customer_name": ""},
        {"time_start": -1},
    ],
)
def test_reservation_validation(s, fields):
    # Falla si se guarda una reserva con hora, capacidad, identidad o importe inválidos.
    call(s["client"], "post", "reservations", raw(s, **fields), 400)
    assert not Reservation.objects.exists()


def test_shared_table_margin_capacity_and_foreign_restaurant(s):
    # Falla si una segunda mesa compartida no bloquea el choque, se ignora el margen o se cruza de sede.
    a = create(s, table_ids=[s["table2"].pk, s["table"].pk], people=8)
    assert a["table_id"] == s["table2"].pk and a["seats"] == 8
    result = call(s["client"], "post", "reservations", raw(s, time_start=13.5), 409)
    assert result["error"] == "reservation_overlap"
    create(s, time_start=13)
    call(s["client"], "post", "reservations", raw(s, table_ids=[s["foreign_table"].pk]), 400)
    assert a["name"] == "RV001" and a["prep_minutes"] == "30"


def test_rules_apply_to_owner_and_slots(s):
    # Falla si el personal elude antelación/ventana o las franjas omiten soon y los días fuera de ventana.
    schedule(s, rules={"minNotice": 120, "maxDays": 3})
    call(s["client"], "post", "reservations", raw(s, time_start=11), 400)
    call(s["client"], "post", "reservations", raw(s, date="2026-10-06"), 400)
    create(s, time_start=12)
    slots = call(s["client"], "get", f"reservations/slots?restaurant_id={s['r1'].pk}&date=2026-10-02")
    assert slots[0] == {"time": 10, "label": "10:00", "past": False, "closed": False, "soon": True}
    assert not slots[4]["soon"]
    assert call(s["client"], "get", f"reservations/slots?restaurant_id={s['r1'].pk}&date=2026-10-06") == []


@pytest.mark.parametrize(
    "bad",
    [
        {"weekly": {"0": []}},
        {"weekly": {str(i): [[12, 11]] for i in range(7)}},
        {"weekly": {str(i): [[10, 12], [11, 13]] for i in range(7)}},
        {"weekly": {str(i): [[10.25, 12]] for i in range(7)}},
        {"rules": {"minNotice": 15}},
        {"rules": {"maxDays": 731}},
        {"rules": {"minNotice": True}},
        {"overrides": [{"date": "2026-02-30"}]},
        {"overrides": [{"date": "2026-10-03", "note": "x" * 81}]},
        {"overrides": [{"date": "2026-10-03"}, {"date": "2026-10-03"}]},
    ],
)
def test_schedule_rejects_bad_shapes(s, bad):
    # Falla si el horario permite franjas superpuestas, fechas imposibles o reglas fuera de límites.
    data = {"weekly": {str(i): [[10, 22]] for i in range(7)}, **bad}
    call(s["client"], "put", f"reservations/schedule?restaurant_id={s['r1'].pk}", data, 400)


def test_override_closed_day_timeline_preserves_old_reservations(s):
    # Falla si acortar el horario invalida reservas existentes, oculta la grilla o impide cambiarles mesas.
    r = create(s, time_start=20)
    schedule(s, overrides=[{"date": "2026-10-02", "ranges": [], "note": "Evento privado"}])
    call(s["client"], "post", "reservations", raw(s), 400)
    assert call(s["client"], "get", f"reservations/slots?restaurant_id={s['r1'].pk}&date=2026-10-02") == []
    changed = call(s["client"], "put", f"reservations/{r['id']}/tables", {"table_ids": [s["table2"].pk]})
    assert changed["table_id"] == s["table2"].pk
    timeline = call(s["client"], "get", f"reservations/timeline?restaurant_id={s['r1'].pk}&date=2026-10-02")
    assert all(slot["closed"] for slot in timeline["slots"])
    assert timeline["tables"][1]["reservations"][0]["id"] == r["id"]


def test_availability_and_excluding_current(s):
    # Falla si la disponibilidad no distingue reserva/capacidad o exclude_id ocupa sus propias mesas.
    r = create(s)
    url = f"reservations/tables?restaurant_id={s['r1'].pk}&date=2026-10-02&time_start=15&people=5&include_unavailable=true"
    rows = call(s["client"], "get", url)
    assert [row["status"] for row in rows] == ["reserved", "unavailable"]
    assert rows[0]["reserved_at"] == "15:00"
    rows = call(s["client"], "get", url.replace("people=5", "people=2") + f"&exclude_id={r['id']}")
    assert all(row["available"] for row in rows)


@pytest.mark.parametrize(
    "hour,expected", [(14, False), (14.5, True), (15, True), (16.49, True), (16.5, False), (23, False)]
)
def test_floor_reserved_only_inside_window(s, monkeypatch, hour, expected):
    # Falla si una reserva inutiliza la mesa antes de preparar o después de terminar, incluso a medianoche.
    r = create(s)
    now = datetime(2026, 10, 2, 5, tzinfo=UTC) + timedelta(hours=hour)
    monkeypatch.setattr("django.utils.timezone.now", lambda: now)
    floors = call(s["client"], "get", f"floors?restaurant_id={s['r1'].pk}")["floors"]
    value = floors[0]["tables"][0]["reserved_at"]
    assert bool(value) == expected
    if expected:
        assert value["id"] == r["id"] and value["label"] == "15:00"
    plan = call(s["client"], "get", f"floors/{s['table'].floor_id}/plan")
    assert bool(plan["tables"][0]["reserved_at"]) == expected


def test_preorder_price_table_and_seating(s, django_capture_on_commit_callbacks):
    # Falla si el pre-pedido no usa ventas, su principal no sigue el cambio o sentar conserva el turno cerrado.
    open_shift(s)
    with django_capture_on_commit_callbacks(execute=True):
        r = create(s, lines=[{"product_id": s["dish"].pk, "qty": 2, "note": "Sin sal"}])
    assert len(mail.outbox) == 1 and "RV001" in mail.outbox[0].body
    assert r["amount_total"] == 21600 and r["lines"][0]["price_subtotal"] == 20000
    assert Reservation.objects.get(pk=r["id"]).lines.get().price == 10800
    assert not call(s["client"], "get", f"orders?restaurant_id={s['r1'].pk}")["orders"]
    call(s["client"], "put", f"reservations/{r['id']}/tables", {"table_ids": [s["table2"].pk, s["table"].pk]})
    assert Order.objects.get(pk=r["preorder_id"]).table_id == s["table2"].pk
    current = CashShift.objects.get(restaurant=s["r1"], state="open")
    call(s["client"], "post", f"shifts/{current.pk}/close", {"counted_cash": 1000, "notes": ""})
    shift = open_shift(s)
    seated = call(s["client"], "post", f"reservations/{r['id']}/seat")
    assert seated["state"] == "seated"
    assert Order.objects.get(pk=r["preorder_id"]).shift_id == shift["id"]
    assert call(s["client"], "get", f"orders?restaurant_id={s['r1'].pk}")["orders"][0]["id"] == r["preorder_id"]
    call(s["client"], "post", f"reservations/{r['id']}/seat", status=409)
    call(s["client"], "put", f"reservations/{r['id']}/tables", {"table_ids": [s["table"].pk]}, 409)


def test_seat_without_preorder_requires_shift(s):
    # Falla si sentar sin caja deja estado parcial o no crea el pedido vacío en la mesa.
    r = create(s)
    call(s["client"], "post", f"reservations/{r['id']}/seat", status=409)
    assert Reservation.objects.get(pk=r["id"]).state == "confirmed"
    open_shift(s)
    result = call(s["client"], "post", f"reservations/{r['id']}/seat")
    o = Order.objects.get(pk=result["preorder_id"])
    assert o.state == "draft" and o.table_id == s["table"].pk and o.total == 0


@pytest.mark.parametrize("action,state", [("no-show", "no_show"), ("cancel", "cancelled")])
def test_close_cancels_draft_and_emits_event(s, action, state):
    # Falla si cerrar una reserva deja su pre-pedido vivo o no libera el salón en tiempo real.
    from realtime.models import SalesEvent

    open_shift(s)
    r = create(s, lines=[{"product_id": s["dish"].pk, "qty": 1}])
    SalesEvent.objects.all().delete()
    result = call(s["client"], "post", f"reservations/{r['id']}/{action}")
    assert result["state"] == state and result["preorder_state"] == "cancel"
    assert Order.objects.get(pk=r["preorder_id"]).lines.get().cancelled
    assert SalesEvent.objects.filter(restaurant=s["r1"], kind="tables").exists()


def test_deposit_lifecycle_public_exact_idempotent_and_private(s, settings):
    # Falla si el anticipo se modifica pagado, acepta otro monto, duplica conciliación o revela datos privados.
    settings.DINER_PUBLIC_URL = "https://menu.ejemplo.co"
    settings.EXPERIENCE_INTERNAL_KEY = "clave-interna"
    r = create(s)
    assert r["pay_url"] == f"https://menu.ejemplo.co/{s['org'].slug}/{s['r1'].slug}/reserva/{r['pay_token']}"
    url = f"reservations/{r['id']}/deposit"
    assert call(s["client"], "put", url, {"amount": 15000})["deposit_state"] == "pending"
    assert call(s["client"], "put", url, {"amount": 0})["deposit_state"] == "none"
    call(s["client"], "post", url + "/paid", {"reference": "Caja"}, 409)
    call(s["client"], "put", url, {"amount": 15000})
    public = public_deposit(s["org"], r["pay_token"])
    assert set(public) == {
        "code",
        "customer",
        "date",
        "time_label",
        "people",
        "table_number",
        "table_numbers",
        "state",
        "deposit_state",
        "amount_in_cents",
    }
    assert public["customer"] == "Ana" and public["amount_in_cents"] == 1500000
    assert deposit_paid(s["org"], r["pay_token"], "ABC", 14000) == {"paid": False, "reason": "amount_changed"}
    assert deposit_paid(s["org"], r["pay_token"], "ABC", 15000) == {"paid": True, "reason": "paid"}
    assert deposit_paid(s["org"], r["pay_token"], "ABC", 15000) == {"paid": True, "reason": "already_paid"}
    assert not deposit_paid(s["org"], r["pay_token"], "OTRO", 15000)["paid"]
    assert not deposit_paid(s["org"], r["pay_token"], "ABC", 1)["paid"]
    call(s["client"], "put", url, {"amount": 0}, 409)
    assert not Payment.objects.exists() and not Order.objects.exists()
    paid = call(s["client"], "get", f"reservations/{r['id']}")
    assert paid["deposit_paid_at"].endswith("Z")
    r2 = create(s, table_ids=[s["table2"].pk], deposit_amount=1000)
    result = call(s["client"], "post", f"reservations/{r2['id']}/deposit/paid", {"reference": "Transferencia"})
    assert result["deposit_state"] == "paid"


def test_plan_cannot_remove_future_reserved_table(s):
    # Falla si quitar una mesa o archivar su piso destruye una reserva confirmada futura.
    create(s, date="2026-10-03")
    plan = call(s["client"], "get", f"floors/{s['table'].floor_id}/plan")
    plan["tables"] = []
    plan.pop("background_size", None)
    plan.pop("background", None)
    failure = call(s["client"], "put", f"floors/{s['table'].floor_id}/plan", plan, 409)
    assert failure["error"] == "table_reserved"
    assert Table.objects.filter(pk=s["table"].pk).exists()
