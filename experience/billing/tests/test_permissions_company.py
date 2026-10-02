import base64
import io
from uuid import uuid4

import pytest
from PIL import Image
from rest_framework.test import APIClient

from billing.models import Resolution
from billing.tests.helpers import configured, emit, paid
from sales.tests.helpers import call
from tenancy.tests.helpers import account, organization, pos_client

pytestmark = pytest.mark.django_db

OWNER_ROUTES = [
    ("get", "reports/summary", {}),
    ("get", "billing/orders", {}),
    ("get", "billing/orders/999/review", {}),
    ("post", "billing/orders/999/document", {"request_key": "x" * 16}),
    ("get", "documents", {}),
    ("get", "documents/999", {}),
    ("get", "documents/999/detail", {}),
    ("get", "documents/999/pdf", {}),
    ("post", "documents/999/retry", {}),
    ("get", "billing/settings", {}),
    ("patch", "billing/settings", {"send_email": True}),
    ("get", "billing/resolutions", {}),
    ("post", "billing/resolutions", {}),
    ("patch", "billing/resolutions/999", {}),
    ("patch", "company", {"name": "Otra"}),
    ("patch", "brand", {"color": "#123456"}),
]


@pytest.mark.parametrize("role", ["admin", "cashier", "waiter"])
@pytest.mark.parametrize("method,path,data", OWNER_ROUTES)
def test_owner_permissions_before_lookup(setup, role, method, path, data):
    # Falla si una ruta exclusiva del dueño permite leer o escribir a otro rol, incluso con permisos amplios.
    s = setup
    person = account(s["org"], role, username=role, restaurants=[s["r1"]])
    call(pos_client(person), method, path, data, 403)


@pytest.mark.parametrize(
    "method,path,data",
    OWNER_ROUTES + [("get", "company", {}), ("get", "brand", {}), ("get", "reports/profitability", {})],
)
def test_no_session(setup, method, path, data):
    # Falla si una ruta privada funciona sin sesión.
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=setup["org"].slug)
    call(client, method, path, data, 401)


def test_cross_organization_every_resource(setup):
    # Falla si un dueño consulta, emite, reintenta o cambia recursos de otra organización.
    s = configured(setup)
    o = paid(s)
    d = emit(s, o)
    org = organization("ajena")
    client = pos_client(account(org))
    rid = Resolution.objects.get(organization=s["org"]).pk
    routes = [
        ("get", f"billing/orders/{o['id']}/review", {}),
        ("post", f"billing/orders/{o['id']}/document", {"request_key": uuid4().hex}),
        ("get", f"documents/{d['id']}", {}),
        ("get", f"documents/{d['id']}/detail", {}),
        ("get", f"documents/{d['id']}/pdf", {}),
        ("post", f"documents/{d['id']}/retry", {}),
        ("patch", f"billing/resolutions/{rid}", {"active": False}),
        ("get", f"billing/orders?restaurant_id={s['r1'].pk}", {}),
        ("get", f"reports/profitability?restaurant_id={s['r1'].pk}", {}),
        ("get", f"billing/orders?method_id={o['payments'][0]['method_id']}", {}),
    ]
    for method, path, data in routes:
        call(client, method, path, data, 404)
    assert not call(client, "get", "documents")["documents"]
    assert not call(client, "get", "billing/orders")["orders"]
    assert call(client, "get", "reports/summary")["total"]["sales"] == 0
    assert call(client, "get", "company")["company"]["tax_id"] == ""
    assert call(client, "get", "brand")["brand"]["has_logo"] is False
    own_order = paid(s)
    foreign_customer = org.customer_set.first()
    call(s["client"], "get", f"billing/orders/{own_order['id']}/review?customer_id={foreign_customer.pk}", status=404)
    call(
        s["client"],
        "post",
        f"billing/orders/{own_order['id']}/document",
        {"request_key": uuid4().hex, "customer_id": foreign_customer.pk},
        404,
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("color", "red"),
        ("color", "#fff"),
        ("color", "#000000; color:red"),
        ("font", "Arial"),
        ("radius", 15),
        ("tagline", "x" * 61),
        ("greeting", "x" * 41),
        ("waiter_name", "x" * 41),
        ("welcome", "x" * 141),
        ("logo", base64.b64encode(b"<svg/>").decode()),
        ("logo", "xxx"),
        pytest.param("logo", "A" * 2666672, id="logo-excesivo"),
        ("unknown", "x"),
    ],
)
def test_brand_invalid(setup, field, value):
    # Falla si la marca admite valores fuera de lista, textos largos, SVG o imágenes inválidas.
    call(setup["client"], "patch", "brand", {field: value}, 400)


def test_brand_logo_and_version(setup):
    # Falla si la marca no normaliza valores, no invalida el logo o lo publica para una organización suspendida.
    s = setup
    output = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(output, format="PNG")
    initial = call(s["client"], "get", "brand")["brand"]
    brand = call(
        s["client"],
        "patch",
        "brand",
        {
            "color": " #aabbcc ",
            "radius": 24,
            "font": "Lora",
            "tagline": " Hola ",
            "logo": base64.b64encode(output.getvalue()).decode(),
        },
    )["brand"]
    assert brand["color"] == "#AABBCC" and brand["radius"] == "24" and brand["tagline"] == "Hola"
    assert brand["has_logo"] and brand["version"] != initial["version"]
    client = APIClient()
    response = client.get("/api/pos/v1/brand/logo?org=" + s["org"].slug)
    assert response.status_code == 200 and response.content == output.getvalue()
    assert response["Content-Type"] == "image/png"
    call(s["client"], "patch", "brand", {"logo": None})
    assert client.get("/api/pos/v1/brand/logo?org=" + s["org"].slug).status_code == 404
    s["org"].status = "suspended"
    s["org"].save()
    assert client.get("/api/pos/v1/brand/logo?org=" + s["org"].slug).status_code == 403


@pytest.mark.parametrize(
    "data",
    [
        {"tax_id_dv": "12"},
        {"tax_id_dv": "a"},
        {"fiscal_regime": "iva"},
        {"fiscal_responsibilities": "R-99-PN"},
        {"fiscal_responsibilities": [123]},
        {"email": "invalido"},
        {"name": None},
        {"status": "active"},
        {"name": ""},
    ],
)
def test_company_validation(setup, data):
    # Falla si los datos del emisor aceptan tipos o valores inválidos o campos reservados de plataforma.
    call(setup["client"], "patch", "company", data, 400)


def test_company_and_brand_session_reads(setup):
    # Falla si un operador no puede leer los datos de su empresa para el recibo o altera los de otra.
    s = setup
    call(s["client"], "patch", "company", {"fiscal_responsibilities": ["R-99-PN"], "email": "hola@ejemplo.co"})
    person = account(s["org"], "waiter", "mesero", restaurants=[s["r1"]])
    client = pos_client(person)
    assert call(client, "get", "company")["company"]["fiscal_responsibilities"] == ["R-99-PN"]
    assert call(client, "get", "brand")["brand"]["name"] == s["org"].name


@pytest.mark.parametrize(
    "data",
    [
        {"number_from": 0},
        {"number_to": 1},
        {"next_number": 995000002},
        {"valid_to": "2019-01-01"},
        {"prefix": "../FE"},
        {"kind": "credit_note"},
        {"active": "true"},
        {"valid_from": "no"},
        {"technical_key": 123},
    ],
)
def test_resolution_validation(setup, data):
    # Falla si la numeración permite rangos, tipos o fechas inválidos.
    rid = Resolution.objects.get(organization=setup["org"]).pk
    call(setup["client"], "patch", f"billing/resolutions/{rid}", data, 400)


@pytest.mark.parametrize(
    "data",
    [{"send_email": 1}, {"tip_label": ""}, {"tip_label": "x" * 101}, {"default_kind": "credit_note"}, {"unknown": 1}],
)
def test_billing_settings_validation(setup, data):
    # Falla si la configuración de facturación admite tipos o documentos no soportados.
    call(setup["client"], "patch", "billing/settings", data, 400)


@pytest.mark.parametrize("format", ["PNG", "JPEG", "GIF"])
def test_logo_raster_formats_and_two_mb(setup, format):
    # Falla si se rechaza un formato permitido o un logo de 2 MB porque el base64 supera el límite previo de Django.
    output = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(output, format=format)
    raw = output.getvalue()
    if format == "PNG":
        raw += b"\0" * (2000000 - len(raw))
    brand = call(setup["client"], "patch", "brand", {"logo": base64.b64encode(raw).decode()})["brand"]
    assert brand["has_logo"]


def test_huge_brand_body_still_returns_json(setup):
    # Falla si Django entrega HTML en vez del error JSON del contrato cuando se supera el límite de carga.
    response = setup["client"].patch("/api/pos/v1/brand", {"logo": "A" * 3100000}, format="json")
    assert response.status_code == 400 and response.json()["error"] == "invalid_data"
