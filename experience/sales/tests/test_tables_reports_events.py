import json
import base64
from copy import deepcopy
from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from notifications.models import Notification
from realtime.api import stream
from realtime.models import SalesEvent
from sales.models import Order
from sales.policy import default_role_policy
from tables.models import Floor
from tenancy.tests.helpers import account, organization

from .helpers import call, open_shift, order, pay, payment

pytestmark = pytest.mark.django_db


def plan(s):
    floor = s["r1"].floors.get()
    return floor, call(s["client"], "get", f"floors/{floor.pk}/plan")


def plan_table(number=1, **kwargs):
    return {
        "id": None,
        "key": uuid4().hex,
        "number": number,
        "seats": 4,
        "zone": "",
        "x": 20,
        "y": 20,
        "width": 80,
        "height": 80,
        **kwargs,
    }


def test_plan_revision_and_open_shift(setup):
    # Falla si dos guardados pisan revisiones o se modifica el plano con caja abierta.
    s = setup
    floor, doc = plan(s)
    doc["tables"] = [plan_table()]
    saved = call(s["client"], "put", f"floors/{floor.pk}/plan", doc)
    assert saved["revision"] == 1 and saved["tables"][0]["id"]
    assert call(s["client"], "put", f"floors/{floor.pk}/plan", doc, 409)["error"] == "stale_plan"
    open_shift(s)
    assert call(s["client"], "put", f"floors/{floor.pk}/plan", saved, 409)["error"] == "shift_open"


@pytest.mark.parametrize(
    "change",
    ["overlap", "wall", "number", "seats", "grid", "zone", "color", "duplicate_zone", "many", "image", "decor", "nan"],
)
def test_invalid_plan(setup, change):
    # Falla si el plano acepta colisiones, geometría inválida, zonas o imágenes ajenas.
    s = setup
    floor, doc = plan(s)
    doc["tables"] = [plan_table()]
    if change == "overlap":
        doc["tables"].append(plan_table(2, x=100))
    if change == "wall":
        doc["walls"] = [{"id": "w", "x": 100, "y": 20, "width": 20, "height": 80}]
    if change == "number":
        doc["tables"][0]["number"] = 10000
    if change == "seats":
        doc["tables"][0]["seats"] = 0
    if change == "grid":
        doc["tables"][0]["width"] = 81
    if change == "zone":
        doc["tables"][0]["zone"] = "desconocida"
    if change == "color":
        doc["zones"] = [{"id": "z", "name": "Zona", "color": "rojo", "x": 0, "y": 0, "width": 400, "height": 400}]
    if change == "duplicate_zone":
        doc["zones"] = [
            {"id": "z", "name": "Zona", "color": "#123456", "x": 0, "y": 0, "width": 400, "height": 400}
        ] * 2
    if change == "many":
        doc["walls"] = [{"id": str(i), "x": 0, "y": 500, "width": 20, "height": 20} for i in range(501)]
    if change == "image":
        doc["images"] = [{"id": "ajena", "x": 0, "y": 0, "width": 100, "height": 100}]
    if change == "decor":
        doc["decor"] = [{"id": "d", "asset": "desconocido", "x": 0, "y": 0, "width": 100, "height": 100}]
    if change == "nan":
        doc["tables"][0]["width"] = "NaN"
    result = call(s["client"], "put", f"floors/{floor.pk}/plan", doc, 400)
    assert result["error"] == "invalid_plan"
    floor.refresh_from_db()
    assert floor.revision == 0


def test_plan_images_webp_and_tenant(setup):
    # Falla si las imágenes no se convierten a WebP o pueden leerse desde otra organización.
    s = setup
    floor, doc = plan(s)
    image = Image.new("RGB", (50, 50), "red")
    output = BytesIO()
    image.save(output, "PNG")
    encoded = base64.b64encode(output.getvalue()).decode()
    doc["background"] = encoded
    doc["background_size"] = {"width": 400, "height": 400}
    doc["images"] = [{"id": "imagen", "x": 0, "y": 0, "width": 100, "height": 100, "data": encoded}]
    saved = call(s["client"], "put", f"floors/{floor.pk}/plan", doc)
    assert saved["background"] is True and "data" not in saved["images"][0] and "file" not in saved["images"][0]
    from rest_framework.test import APIClient

    public = APIClient()
    for path in (f"floors/{floor.pk}/background", f"floors/{floor.pk}/images/imagen"):
        response = public.get("/api/pos/v1/" + path + "?org=" + s["org"].slug)
        assert response.status_code == 200 and response["Content-Type"] == "image/webp"
        assert Image.open(BytesIO(b"".join(response.streaming_content))).format == "WEBP"
        other = organization("otra-" + uuid4().hex[:6])
        response = public.get("/api/pos/v1/" + path + "?org=" + other.slug)
        assert response.status_code == 404
    saved = call(s["client"], "put", f"floors/{floor.pk}/plan", saved)
    assert saved["revision"] == 2


def test_floor_protection_history_and_number_swap(setup):
    # Falla si desaparecen mesas con borrador, se borra historial o no se pueden intercambiar números.
    s = setup
    floor, doc = plan(s)
    doc["tables"] = [plan_table(1), plan_table(2, x=200)]
    doc = call(s["client"], "put", f"floors/{floor.pk}/plan", doc)
    doc["tables"][0]["number"], doc["tables"][1]["number"] = 2, 1
    doc = call(s["client"], "put", f"floors/{floor.pk}/plan", doc)
    shift = open_shift(s)
    o = order(s, service="dine_in", table_id=doc["tables"][0]["id"])
    from sales.models import CashShift

    CashShift.objects.filter(pk=shift["id"]).update(state="closed")
    bad = deepcopy(doc)
    bad["tables"] = []
    assert call(s["client"], "put", f"floors/{floor.pk}/plan", bad, 409)["error"] == "table_in_use"
    call(s["client"], "post", "floors", {"restaurant_id": s["r1"].pk, "name": "Terraza"}, 201)
    assert call(s["client"], "delete", f"floors/{floor.pk}", status=409)["error"] == "table_in_use"
    CashShift.objects.filter(pk=shift["id"]).update(state="open")
    payment(s, o)
    pay(s, o)
    call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": 11800})
    assert call(s["client"], "delete", f"floors/{floor.pk}")["result"] == "archived"
    floor.refresh_from_db()
    assert not floor.active
    assert Order.objects.get(pk=o["id"]).table_id
    last = Floor.objects.get(restaurant=s["r1"], active=True)
    assert call(s["client"], "delete", f"floors/{last.pk}", status=409)["error"] == "last_floor"
    spare = call(s["client"], "post", "floors", {"restaurant_id": s["r1"].pk, "name": "Vacío"}, 201)["floor"]
    assert call(s["client"], "delete", f"floors/{spare['id']}")["result"] == "removed"


def test_zone_staff_and_kitchen_recipients(setup):
    # Falla si el reparto del turno pisa el habitual o los avisos llegan a otra zona.
    s = setup
    floor, doc = plan(s)
    doc["zones"] = [
        {"id": key, "name": key, "color": "#123456", "x": 0, "y": 0, "width": 400, "height": 400} for key in ("a", "b")
    ]
    doc["tables"] = [plan_table(zone="a")]
    doc = call(s["client"], "put", f"floors/{floor.pk}/plan", doc)
    a = account(s["org"], "waiter", "mesero.a", restaurants=[s["r1"]])
    b = account(s["org"], "waiter", "mesero.b", restaurants=[s["r1"]])
    admin = account(s["org"], "admin", "encargado", restaurants=[s["r1"]])
    call(s["client"], "put", f"floors/{floor.pk}/zone-staff", {"assignments": {"a": [a.pk], "b": [b.pk]}})
    shift = open_shift(s)
    assert call(s["client"], "get", f"floors/{floor.pk}/zone-staff?shift_id={shift['id']}")["source"] == "plan"
    call(s["client"], "put", f"shifts/{shift['id']}/zones", {"floor_id": floor.pk, "assignments": {"a": [b.pk]}})
    assert call(s["client"], "get", f"floors/{floor.pk}/zone-staff?shift_id={shift['id']}")["source"] == "shift"
    o = order(s, service="dine_in", table_id=doc["tables"][0]["id"], fire=True)
    call(s["client"], "post", f"courses/{o['courses'][0]['id']}/ready")
    assert set(Notification.objects.filter(kind="kitchen").values_list("recipient_id", flat=True)) == {b.pk, admin.pk}
    result = call(s["client"], "put", f"shifts/{shift['id']}/zones", {"floor_id": floor.pk, "assignments": None})
    assert result["source"] == "plan" and result["assignments"]["a"] == [a.pk]


def test_reports_tax_tip_origin_and_local_day(setup):
    # Falla si ventas incluye propina, omite impuestos o agrupa el cobro por el día UTC.
    s = setup
    shift = open_shift(s)
    o = order(s)
    o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": 1200})["order"]
    payment(s, o)
    pay(s, o)
    Order.objects.filter(pk=o["id"]).update(paid_at=datetime(2026, 10, 2, 3, tzinfo=UTC), origin="ai")
    report = call(s["client"], "get", f"sales/summary?restaurant_id={s['r1'].pk}&from=2026-10-01&to=2026-10-01")
    assert report["total"] == 10800 and report["autonomous"] == 1 and report["orders"] == 1
    assert report["by_method"][0]["amount"] == 12000 and report["by_waiter"][0]["amount"] == 10800
    assert report["top_products"][0]["qty"] == 1
    empty = call(s["client"], "get", f"sales/summary?restaurant_id={s['r1'].pk}&from=2026-10-02&to=2026-10-02")
    assert empty["orders"] == 0
    listed = call(s["client"], "get", f"sales/orders?restaurant_id={s['r1'].pk}&shift_id={shift['id']}")
    assert listed["orders"][0]["payments"]


def test_insights_local_days_and_previous_window(setup, monkeypatch):
    # Falla si insights pierde días locales, la ventana anterior o mezcla propinas.
    s = setup
    open_shift(s)
    a = order(s)
    payment(s, a)
    pay(s, a)
    b = order(s)
    payment(s, b)
    pay(s, b)
    Order.objects.filter(pk=a["id"]).update(paid_at=datetime(2026, 10, 2, 3, tzinfo=UTC))
    Order.objects.filter(pk=b["id"]).update(paid_at=datetime(2026, 9, 1, 18, tzinfo=UTC))
    monkeypatch.setattr("sales.reports.timezone.now", lambda: datetime(2026, 10, 2, 18, tzinfo=UTC))
    result = call(s["client"], "get", f"sales/insights?restaurant_id={s['r1'].pk}")
    assert result["today"] == "2026-10-02" and result["daily"][-1]["date"] == "2026-10-01"
    assert result["hourly"] == [{"hour": 22, "total": 10800, "orders": 1}]
    assert result["products"][0]["qty"] == 1 and result["products"][0]["prev_qty"] == 1


def test_sse_after_tenant_and_cleanup(setup, settings):
    # Falla si el SSE no publica la escritura, ignora after o filtra mal la sede.
    s = setup
    settings.SALES_SSE_TEST_ITERATIONS = 1
    old = SalesEvent.objects.create(organization=s["org"], restaurant=s["r1"], kind="tables")
    SalesEvent.objects.filter(pk=old.pk).update(created_at=datetime(2000, 1, 1, tzinfo=UTC))
    open_shift(s)
    first = SalesEvent.objects.latest("id")
    open_shift(s, restaurant=s["r2"])
    order(s)
    response = s["client"].get(f"/api/pos/v1/events?restaurant_id={s['r1'].pk}&after={first.pk}")
    data = b"".join(response.streaming_content).decode()
    assert response["Content-Type"] == "text/event-stream" and not SalesEvent.objects.filter(pk=old.pk).exists()
    assert "event: orders\ndata: {}\n\n" in data and "event: cash" not in data
    assert all(int(chunk.split("\n")[0][4:]) > first.pk for chunk in data.strip().split("\n\n"))


def test_sse_accepts_event_stream(setup, settings):
    # Falla si EventSource (que pide `Accept: text/event-stream`) recibe 406 en vez del flujo, o si un error con ese
    # Accept no sale como JSON.
    s = setup
    settings.SALES_SSE_TEST_ITERATIONS = 1
    open_shift(s)
    response = s["client"].get(f"/api/pos/v1/events?restaurant_id={s['r1'].pk}&after=0", HTTP_ACCEPT="text/event-stream")
    assert response.status_code == 200 and response["Content-Type"] == "text/event-stream"
    assert "event: cash\ndata: {}\n\n" in b"".join(response.streaming_content).decode()
    bad = s["client"].get("/api/pos/v1/events?restaurant_id=999&after=0", HTTP_ACCEPT="text/event-stream")
    assert bad.status_code == 404 and json.loads(bad.content)["error"] == "not_found"


def test_sse_heartbeat_and_five_minute_close(setup, monkeypatch):
    # Falla si el latido no aparece a los 15 segundos o la conexión no termina a los cinco minutos.
    s = setup
    clock = [0]
    monkeypatch.setattr("realtime.api.time.monotonic", lambda: clock[0])
    monkeypatch.setattr("realtime.api.time.sleep", lambda seconds: clock.__setitem__(0, clock[0] + seconds))
    monkeypatch.setattr("realtime.api.close_old_connections", lambda: None)
    events = list(stream(s["org"].pk, s["r1"].pk, 0))
    assert events == [": ping\n\n"] * 19 and clock[0] == 300


@pytest.mark.parametrize("variant", ["roles", "views", "create", "charge", "serve", "unknown", "shape"])
def test_invalid_role_policy(setup, variant):
    # Falla si se guarda una política incompleta o acciones sin las vistas necesarias.
    s = setup
    policy = default_role_policy()
    if variant == "roles":
        del policy["admin"]
    if variant == "views":
        policy["waiter"]["views"] = []
    if variant in ("create", "charge"):
        policy["cashier"] = {"views": ["sales"], "actions": [variant + "_orders"]}
    if variant == "serve":
        policy["waiter"]["views"] = ["orders"]
    if variant == "unknown":
        policy["waiter"]["actions"].append("administrar_todo")
    if variant == "shape":
        policy["waiter"] = []
    assert call(s["client"], "put", "settings/roles", policy, 400)["error"] == "invalid_policy"
