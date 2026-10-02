"""Matriz de permisos T3: cada ruta, con organización y sede ajenas."""

from datetime import date

import pytest
from rest_framework.test import APIClient

from catalog.services import seed_organization as seed_catalog
from loyalty.models import Customer, LoyaltyCard, LoyaltyProgram
from loyalty.services import seed_organization
from notifications.models import Notification
from reservations.services import create
from sales.tests.helpers import call, open_shift, order
from tables.models import Table
from tenancy.tests.helpers import account, organization, pos_client

pytestmark = pytest.mark.django_db


@pytest.fixture
def context(setup):
    s = setup
    seed_organization(s["org"])
    LoyaltyProgram.objects.filter(organization=s["org"]).update(active=True)
    s["customer"] = Customer.objects.create(organization=s["org"], name="Cliente")
    s["card"] = LoyaltyCard.objects.create(organization=s["org"], customer=s["customer"], points=100)
    s["table"] = Table.objects.create(floor=s["r1"].floors.get(), number=1)
    open_shift(s)
    s["order"] = order(s)
    s["reservation"] = create(
        s["person"],
        {
            "restaurant_id": s["r1"].pk,
            "customer_name": "Cliente",
            "people": 2,
            "date": date.today().isoformat(),
            "time_start": 15,
            "table_ids": [s["table"].pk],
            "deposit_amount": 100,
        },
    )
    s["notification"] = Notification.objects.create(
        organization=s["org"],
        restaurant=s["r1"],
        kind="inventory",
        title="Stock bajo",
        res_model="catalog.Product",
        res_id=s["ingredient"].pk,
        action="request_ingredient",
    )
    return s


ROUTES = [
    ("get", "customers", "session"),
    ("post", "customers", "manager"),
    ("patch", "customer", "manager"),
    ("get", "customers/id-types", "session"),
    ("get", "customer-card", "session"),
    ("get", "customer-orders", "session"),
    ("get", "loyalty/program", "session"),
    ("get", "card", "session"),
    ("post", "redeem", "charge"),
    ("patch", "associate", "charge"),
    ("get", "benefits", "owner"),
    ("put", "benefits", "owner"),
    ("get", "banners", "session"),
    ("put", "banners", "owner"),
    ("get", "timeline", "reservations"),
    ("get", "slots", "reservations"),
    ("get", "tables", "reservations"),
    ("post", "reservations", "reservations"),
    ("get", "reservation", "reservations"),
    ("get", "by-table", "reservations"),
    ("put", "set-tables", "reservations"),
    ("post", "seat", "reservations"),
    ("post", "no-show", "reservations"),
    ("post", "cancel", "reservations"),
    ("put", "deposit", "manager"),
    ("post", "deposit-paid", "manager"),
    ("get", "schedule", "reservations"),
    ("put", "schedule", "manager"),
    ("get", "me/notify-prefs", "session"),
    ("put", "me/notify-prefs", "session"),
    ("post", "request", "manager"),
]


def request_for(s, method, route):
    rid, cid, res = s["r1"].pk, s["customer"].pk, s["reservation"].pk
    query = f"?restaurant_id={rid}&date={date.today().isoformat()}"
    paths = {
        "customer": f"customers/{cid}",
        "customer-card": f"customers/{cid}/card",
        "customer-orders": f"customers/{cid}/orders",
        "card": f"loyalty/cards/{s['card'].code}",
        "redeem": f"orders/{s['order']['id']}/redeem",
        "associate": f"orders/{s['order']['id']}",
        "timeline": "reservations/timeline" + query,
        "slots": "reservations/slots" + query,
        "tables": "reservations/tables" + query + "&time_start=12&people=2",
        "reservation": f"reservations/{res}",
        "by-table": f"reservations?table_id={s['table'].pk}",
        "set-tables": f"reservations/{res}/tables",
        "seat": f"reservations/{res}/seat",
        "no-show": f"reservations/{res}/no-show",
        "cancel": f"reservations/{res}/cancel",
        "deposit": f"reservations/{res}/deposit",
        "deposit-paid": f"reservations/{res}/deposit/paid",
        "schedule": f"reservations/schedule?restaurant_id={rid}",
        "request": f"notifications/{s['notification'].pk}/request-ingredient",
    }
    data = {
        "customers": {"name": "Nuevo"},
        "customer": {"name": "Editado"},
        "associate": {"customer_id": cid},
        "redeem": {"card_id": s["card"].pk},
        "benefits": {},
        "banners": [{"layout": "notice", "title": "Hola", "target": "none", "theme": "dark", "active": True}],
        "reservations": {
            "restaurant_id": rid,
            "customer_name": "Nuevo",
            "people": 2,
            "date": date.today().isoformat(),
            "time_start": 12,
            "table_ids": [s["table"].pk],
        },
        "set-tables": {"table_ids": [s["table"].pk]},
        "deposit": {"amount": 200},
        "deposit-paid": {"reference": "Prueba"},
        "schedule": {"weekly": {str(i): [[10, 22]] for i in range(7)}},
        "me/notify-prefs": {"prefs": {"system_sound": False}},
    }
    return paths.get(route, route), data.get(route, {}) if method != "get" else {}


@pytest.mark.parametrize("method,route,permission", ROUTES)
@pytest.mark.parametrize("role", ["owner", "admin", "cashier", "waiter"])
def test_every_route_role(context, method, route, permission, role):
    # Falla si alguna ruta T3 ignora el rol o rechaza un rol autorizado por el contrato.
    s = context
    person = account(s["org"], role, "persona", [] if role == "owner" else [s["r1"]])
    client = pos_client(person)
    path, data = request_for(s, method, route)
    allowed = (
        role == "owner"
        or permission == "session"
        or role == "admin"
        and permission != "owner"
        or role == "cashier"
        and permission == "charge"
    )
    expected = (201 if method == "post" and route in ("customers", "reservations") else 200) if allowed else 403
    call(client, method, path, data, expected)


@pytest.mark.parametrize("method,route,permission", ROUTES)
def test_every_route_requires_session(context, method, route, permission):
    # Falla si alguna ruta privada funciona sin cookie de sesión.
    s = context
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=s["org"].slug)
    path, data = request_for(s, method, route)
    call(client, method, path, data, 401)


@pytest.mark.parametrize(
    "method,route",
    [
        (m, r)
        for m, r, _ in ROUTES
        if r
        in {
            "customer",
            "customer-card",
            "customer-orders",
            "card",
            "redeem",
            "associate",
            "timeline",
            "slots",
            "tables",
            "reservations",
            "reservation",
            "by-table",
            "set-tables",
            "seat",
            "no-show",
            "cancel",
            "deposit",
            "deposit-paid",
            "schedule",
            "request",
        }
    ],
)
def test_foreign_organization_ids(context, method, route):
    # Falla si un identificador ajeno atraviesa el filtro de organización, también en escrituras.
    s = context
    other = organization("ajena")
    seed_catalog(other)
    client = pos_client(account(other))
    path, data = request_for(s, method, route)
    call(client, method, path, data, 404)


@pytest.mark.parametrize(
    "method,route",
    [
        (m, r)
        for m, r, _ in ROUTES
        if r
        in {
            "redeem",
            "associate",
            "timeline",
            "slots",
            "tables",
            "reservations",
            "reservation",
            "by-table",
            "set-tables",
            "seat",
            "no-show",
            "cancel",
            "deposit",
            "deposit-paid",
            "schedule",
            "request",
        }
    ],
)
def test_admin_other_restaurant(context, method, route):
    # Falla si un encargado opera reservas, cobros o avisos fuera de sus sedes.
    s = context
    client = pos_client(account(s["org"], "admin", "otro", [s["r2"]]))
    path, data = request_for(s, method, route)
    call(client, method, path, data, 404)


def test_policy_grants_reservations_but_not_deposits(context):
    # Falla si la vista reservations no habilita al mesero o le concede también anticipos/horarios.
    s = context
    policy = s["org"].role_policy
    policy["waiter"]["views"].append("reservations")
    s["org"].role_policy = policy
    s["org"].save()
    client = pos_client(account(s["org"], "waiter", "mesero", [s["r1"]]))
    for method, route, permission in ROUTES:
        if permission not in ("reservations", "manager") or route in (
            "seat",
            "no-show",
            "cancel",
            "customer",
            "customers",
            "request",
        ):
            continue
        path, data = request_for(s, method, route)
        expected = (
            (201 if route == "reservations" and method == "post" else 200) if permission == "reservations" else 403
        )
        call(client, method, path, data, expected)


def test_public_and_internal_deposit_authentication(context, settings):
    # Falla si el enlace público exige sesión, filtra contactos o la conciliación admite una clave inválida u otra organización.
    s = context
    client = APIClient()
    token = s["reservation"].pay_token
    url = f"/api/pos/v1/public/reservations/{token}?org={s['org'].slug}"
    assert client.get(url).status_code == 200
    other = organization("ajena")
    assert client.get(url.replace(s["org"].slug, other.slug)).status_code == 404
    settings.EXPERIENCE_INTERNAL_KEY = "secreto"
    url = f"/api/pos/v1/internal/reservations/{token}/deposit-paid?org={s['org'].slug}"
    data = {"reference": "Pasarela", "amount": 100}
    assert client.post(url, data, format="json").status_code == 403
    assert client.post(url, data, format="json", HTTP_X_INTERNAL_KEY="errada").status_code == 403
    result = client.post(url, data, format="json", HTTP_X_INTERNAL_KEY="secreto")
    assert result.status_code == 200 and result.data == {"paid": True, "reason": "paid"}
    result = client.post(url.replace(s["org"].slug, other.slug), data, format="json", HTTP_X_INTERNAL_KEY="secreto")
    assert result.data == {"paid": False, "reason": "unknown"}
    settings.EXPERIENCE_INTERNAL_KEY = ""
    assert client.post(url, data, format="json").status_code == 403
