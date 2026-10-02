import base64
from io import BytesIO

import pytest
from django.core.management import call_command
from PIL import Image

from catalog.models import Category
from inventory.models import PurchaseRequest, Stock
from loyalty.models import Banner
from loyalty.services import banners
from notifications.models import Notification
from sales.tests.helpers import call
from tenancy.tests.helpers import account, organization, pos_client

pytestmark = pytest.mark.django_db


def picture(size=(5, 5), fmt="PNG"):
    buffer = BytesIO()
    Image.new("RGB", size, "red").save(buffer, format=fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buffer.getvalue()).decode()


def banner(**kwargs):
    return {
        "layout": "notice",
        "title": "Te esperamos",
        "subtitle": "",
        "button": "",
        "target": "none",
        "targetId": None,
        "theme": "violet",
        "active": True,
        "image": "",
        "configs": [],
        **kwargs,
    }


def test_banner_roundtrip_webp_and_public_isolation(setup):
    # Falla si la imagen no es WebP, la edición pierde imágenes o una organización lee las de otra.
    s = setup
    rows = [
        banner(layout="image", image=picture()),
        banner(layout="product", target="product", targetId=s["dish"].pk, configs=[s["r1"].pk]),
    ]
    result = call(s["client"], "put", "banners", rows)
    assert result["configured"] and result["banners"][0]["title"] == "Te esperamos"
    assert banners(s["org"], s["r1"])["banners"] == result["banners"]
    url = result["banners"][0]["image"]
    response = s["client"].get(url)
    assert response.status_code == 200 and response["Content-Type"] == "image/webp"
    with Image.open(BytesIO(b"".join(response.streaming_content))) as image:
        assert image.format == "WEBP"
    result = call(s["client"], "put", "banners", result["banners"])
    assert s["client"].get(result["banners"][0]["image"]).status_code == 200
    other = organization("ajena")
    from rest_framework.test import APIClient

    outsider = APIClient()
    assert outsider.get(result["banners"][0]["image"].replace(s["org"].slug, other.slug)).status_code == 404


@pytest.mark.parametrize(
    "change",
    [
        {"title": ""},
        {"title": "x" * 81},
        {"subtitle": "x" * 161},
        {"button": "x" * 36},
        {"layout": "html"},
        {"theme": "rojo"},
        {"target": "product", "targetId": 0},
        {"active": 1},
        {"layout": "image"},
        {"image": "https://ejemplo.co/imagen.png"},
        {"image": "data:image/png;base64,!!!"},
        {"image": picture((4097, 1))},
        {"image": picture(fmt="GIF")},
    ],
)
def test_banner_validation_is_atomic(setup, change):
    # Falla si se aceptan diseños/textos/imágenes inválidos o una lista mala borra los banners anteriores.
    s = setup
    call(s["client"], "put", "banners", [banner()])
    call(s["client"], "put", "banners", [banner(), banner(**change)], 400)
    assert Banner.objects.filter(organization=s["org"]).count() == 1


def test_banner_count_targets_and_file_limit(setup):
    # Falla si supera ocho banners, permite destinos de otra organización o imágenes mayores de 500 KB.
    s = setup
    call(s["client"], "put", "banners", [banner() for _ in range(9)], 400)
    other = organization("ajena")
    cat = Category.objects.create(organization=other, name="Ajena")
    call(s["client"], "put", "banners", [banner(target="category", targetId=cat.pk)], 404)
    huge = "data:image/png;base64," + base64.b64encode(b"a" * 512001).decode()
    call(s["client"], "put", "banners", [banner(image=huge)], 400)
    response = s["client"].put("/api/pos/v1/banners", [], format="json")
    assert response.status_code == 200 and response.data == {"configured": True, "banners": []}


def test_notify_preferences_are_personal_partial_and_boolean(setup):
    # Falla si guardar preferencias afecta otra cuenta, borra claves omitidas o acepta valores no booleanos.
    s = setup
    peer = account(s["org"], "waiter", "mesero", [s["r1"]])
    client = pos_client(peer)
    defaults = call(client, "get", "me/notify-prefs")["prefs"]
    assert len(defaults) == 6 and all(defaults.values())
    saved = call(client, "put", "me/notify-prefs", {"prefs": {"kitchen_sound": False}})["prefs"]
    assert saved == {**defaults, "kitchen_sound": False}
    assert call(s["client"], "get", "me/notify-prefs")["prefs"] == defaults
    call(client, "put", "me/notify-prefs", {"prefs": {"kitchen_sound": 0}}, 400)
    call(client, "put", "me/notify-prefs", {"prefs": {"unknown": True}}, 400)
    call(client, "put", "me/notify-prefs", {"prefs": {}, "account_id": s["person"].pk}, 400)


def test_low_stock_episode_recovery_and_request_supplier(setup):
    # Falla si el cron duplica avisos, solicitar recrea el episodio o recuperarse no permite avisar otra caída.
    s = setup
    call_command("notify_low_stock")
    call_command("notify_low_stock")
    assert Notification.objects.filter(kind="inventory").count() == 2
    row = Notification.objects.get(restaurant=s["r1"], kind="inventory")
    result = call(s["client"], "post", f"notifications/{row.pk}/request-ingredient")
    assert result["request"]["lines"][0]["qty"] == 17
    assert PurchaseRequest.objects.get(pk=result["request"]["id"]).supplier_id == s["supplier"].pk
    call(s["client"], "post", f"notifications/{row.pk}/request-ingredient", status=409)
    call_command("notify_low_stock")
    assert Notification.objects.filter(kind="inventory").count() == 2
    Stock.objects.filter(restaurant=s["r1"]).update(qty=5)
    call_command("notify_low_stock")
    row.refresh_from_db()
    assert row.action_done and not row.low_stock_open
    Stock.objects.filter(restaurant=s["r1"]).update(qty=1)
    call_command("notify_low_stock")
    row = Notification.objects.get(restaurant=s["r1"], low_stock_open=True)
    result2 = call(s["client"], "post", f"notifications/{row.pk}/request-ingredient")
    assert result2["request"]["id"] == result["request"]["id"]
    assert result2["request"]["lines"][0]["qty"] == 36
