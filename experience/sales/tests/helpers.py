"""Solicitudes breves del contrato T2 compartidas por las pruebas."""

from uuid import uuid4

BASE = "/api/pos/v1/"


def call(client, method, path, data=None, status=200):
    response = getattr(client, method)(BASE + path, data or {}, format="json")
    assert response.status_code == status, getattr(response, "data", response.content)
    return response.data


def open_shift(s, client=None, restaurant=None, amount=1000):
    return call(
        client or s["client"],
        "post",
        "shifts",
        {"restaurant_id": (restaurant or s["r1"]).pk, "opening_cash": amount, "notes": "Inicio"},
        201,
    )["shift"]


def line(s, **kwargs):
    return {"uuid": str(uuid4()), "product_id": s["dish"].pk, "qty": 1, **kwargs}


def order(s, client=None, restaurant=None, **kwargs):
    return call(
        client or s["client"],
        "post",
        "orders",
        {
            "restaurant_id": (restaurant or s["r1"]).pk,
            "uuid": str(uuid4()),
            "service": "takeout",
            "lines": [line(s)],
            "fire": False,
            **kwargs,
        },
        201,
    )["order"]


def cash_method(s, restaurant=None):
    from sales.models import PaymentMethod

    return PaymentMethod.objects.get(type="cash", restaurants=restaurant or s["r1"])


def payment(s, o, amount=None, **kwargs):
    return call(
        s["client"],
        "post",
        f"orders/{o['id']}/payments",
        {
            "method_id": cash_method(s).pk,
            "amount": o["total"] if amount is None else amount,
            "request_key": uuid4().hex,
            **kwargs,
        },
    )["order"]


def pay(s, o):
    return call(s["client"], "post", f"orders/{o['id']}/pay")["order"]
