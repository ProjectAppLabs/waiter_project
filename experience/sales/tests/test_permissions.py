"""Matriz de permisos y aislamiento de todas las rutas del contrato operativo."""

from uuid import uuid4

import pytest

from sales.policy import default_role_policy
from tables.models import Table
from tenancy.tests.helpers import account, organization, pos_client

from .helpers import BASE, cash_method, line, open_shift, order

pytestmark = pytest.mark.django_db

# El cuerpo se construye con identificadores propios de cada escenario, nunca con ids fijos.
ROUTES = [
    ("get", "floors?restaurant_id={r}", None, "session"),
    ("post", "floors", {"restaurant_id": "$r", "name": "Terraza"}, "admin"),
    ("patch", "floors/{f}", {"name": "Salón nuevo"}, "admin"),
    ("delete", "floors/{f}", {}, "admin"),
    ("get", "floors/{f}/plan", None, "session"),
    (
        "put",
        "floors/{f}/plan",
        {"id": "$f", "name": "Salón", "revision": 0, "tables": [], "walls": [], "zones": []},
        "admin",
    ),
    ("get", "floors/{f}/zone-staff?shift_id={s}", None, "session"),
    ("put", "floors/{f}/zone-staff", {"assignments": {}}, "admin"),
    ("put", "shifts/{s}/zones", {"floor_id": "$f", "assignments": {}}, "admin"),
    ("get", "tables/calls?restaurant_id={r}", None, "session"),
    ("put", "tables/{t}/call", {"kind": "assist"}, "serve_orders"),
    ("get", "shifts/open?restaurant_id={r}", None, "session"),
    ("post", "shifts", {"restaurant_id": "$r", "opening_cash": 0, "notes": ""}, "cashier"),
    ("get", "shifts?restaurant_id={r}", None, "sales"),
    ("get", "shifts/{s}/closing", None, "sales"),
    ("post", "shifts/{s}/moves", {"kind": "in", "amount": 10, "reason": "Cambio"}, "sales"),
    ("post", "shifts/{s}/close", {"counted_cash": 1000, "notes": ""}, "cashier"),
    ("get", "shifts/closings?restaurant_ids={r}", None, "admin"),
    ("put", "settings/cash", {"tolerance": 100}, "owner"),
    ("get", "payment-methods?restaurant_id={r}", None, "session"),
    ("post", "payment-methods", {"name": "Banco", "type": "bank", "restaurant_ids": ["$r"]}, "owner"),
    ("patch", "payment-methods/{m}", {"name": "Efectivo local"}, "owner"),
    ("delete", "payment-methods/{m}", {}, "owner"),
    ("get", "orders?restaurant_id={r}", None, "session"),
    ("get", "orders/{o}", None, "session"),
    (
        "post",
        "orders",
        {"restaurant_id": "$r", "uuid": "$uuid", "service": "takeout", "lines": "$lines", "fire": False},
        "create_orders",
    ),
    ("post", "orders/{o}/lines", {"lines": "$lines", "fire": False}, "create_orders"),
    ("delete", "orders/{o}/lines", {"line_ids": ["$l"]}, "create_orders"),
    ("post", "orders/{o}/fire", {}, "create_orders"),
    ("patch", "orders/{o}", {"note": "Sin sal"}, "create_orders"),
    ("patch", "orders/{o}", {"billing": True}, "billing"),
    ("post", "orders/{o}/payments", {"method_id": "$m", "amount": 100, "request_key": "$key"}, "charge_orders"),
    ("put", "orders/{o}/tip", {"amount": 100}, "charge_orders"),
    ("post", "orders/{o}/pay", {}, "charge_orders"),
    ("post", "orders/{o}/cancel", {"reason": "Cancelación"}, "admin"),
    ("get", "kitchen/tickets?restaurant_id={r}", None, "session"),
    ("post", "courses/{c}/start", {}, "kitchen"),
    ("post", "courses/{c}/ready", {}, "kitchen"),
    ("post", "courses/{c}/serve", {}, "serve_orders"),
    ("post", "lines/ready", {"line_ids": ["$l"]}, "kitchen"),
    ("post", "lines/serve", {"line_ids": ["$l"]}, "serve_orders"),
    ("get", "sales/summary?restaurant_id={r}&shift_id={s}", None, "sales"),
    ("get", "sales/orders?restaurant_id={r}&shift_id={s}", None, "history"),
    ("get", "sales/insights?restaurant_id={r}", None, "dashboard"),
    ("get", "settings?restaurant_id={r}", None, "session"),
    ("patch", "settings?restaurant_id={r}", {"alert_late_minutes": 20}, "admin"),
    ("patch", "settings?restaurant_id={r}", {"kitchen_prepay_roles": ["waiter"]}, "owner"),
    ("put", "settings/roles", default_role_policy(), "owner"),
    ("get", "events?restaurant_id={r}&after=0", None, "session"),
]


@pytest.fixture
def scenario(setup, settings):
    settings.SALES_SSE_TEST_ITERATIONS = 1
    s = setup
    floor = s["r1"].floors.get()
    table = Table.objects.create(floor=floor, number=1)
    shift = open_shift(s)
    o = order(s, service="dine_in", table_id=table.pk, fire=True)
    values = {
        "r": s["r1"].pk,
        "f": floor.pk,
        "t": table.pk,
        "s": shift["id"],
        "o": o["id"],
        "c": o["courses"][0]["id"],
        "l": o["lines"][0]["id"],
        "m": cash_method(s).pk,
        "uuid": str(uuid4()),
        "key": uuid4().hex,
        "lines": [line(s)],
    }
    return s, values


def body(raw, values):
    if isinstance(raw, dict):
        return {k: body(v, values) for k, v in raw.items()}
    if isinstance(raw, list):
        return [body(v, values) for v in raw]
    return values[raw[1:]] if isinstance(raw, str) and raw.startswith("$") else raw


def request(client, route, values):
    method, path, raw, _ = route
    response = getattr(client, method)(BASE + path.format(**values), body(raw, values) or {}, format="json")
    if response.streaming:
        list(response.streaming_content)
    return response


def allowed(role, permission):
    if role == "owner" or permission == "session":
        return True
    if permission == "owner":
        return False
    if role == "admin":
        return True
    if permission == "admin":
        return False
    if permission == "cashier":
        return role == "cashier"
    policy = default_role_policy()[role]
    if permission == "billing":
        return bool(set(policy["actions"]) & {"create_orders", "serve_orders"})
    return permission in policy["views"] + policy["actions"]


@pytest.mark.parametrize("role", ["waiter", "cashier", "admin", "owner"])
@pytest.mark.parametrize("route", ROUTES, ids=[f"{r[0]}-{r[1]}-{r[3]}" for r in ROUTES])
def test_role_every_route(scenario, role, route):
    # Falla si una ruta omite su permiso: en particular mesero cobra o cajero sirve.
    s, values = scenario
    client = pos_client(account(s["org"], role, "actor", restaurants=[] if role == "owner" else [s["r1"]]))
    response = request(client, route, values)
    if not allowed(role, route[3]):
        assert response.status_code == 403, response.data
    else:
        assert response.status_code in (200, 201, 400, 409), getattr(response, "data", None)


SCOPED = [r for r in ROUTES if r[1] not in ("settings/cash", "settings/roles", "payment-methods")]


@pytest.mark.parametrize("scope", ["organization", "restaurant"])
@pytest.mark.parametrize("route", SCOPED, ids=[f"{r[0]}-{r[1]}-{r[3]}" for r in SCOPED])
def test_isolation_every_route(scenario, scope, route):
    # Falla si el identificador de otra organización o sede permite leer o modificar datos.
    s, values = scenario
    if scope == "organization":
        other = organization("otro")
        client = pos_client(account(other, username="ajeno"))
    else:
        client = pos_client(account(s["org"], "admin", "otra.sede", restaurants=[s["r2"]]))
    response = request(client, route, values)
    assert response.status_code in (403, 404), getattr(response, "data", None)


@pytest.mark.parametrize("route", ROUTES, ids=[f"{r[0]}-{r[1]}-{r[3]}" for r in ROUTES])
def test_session_required_every_route(scenario, route):
    # Falla si una ruta operativa puede leerse o escribirse sin cookie de sesión.
    from rest_framework.test import APIClient

    s, values = scenario
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=s["org"].slug)
    assert request(client, route, values).status_code == 401
