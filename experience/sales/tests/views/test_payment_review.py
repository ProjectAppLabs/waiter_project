"""Identidad de pagos consultados para conciliar cobros inciertos del POS."""

import pytest

from sales.models import Payment
from sales.tests.helpers import call, open_shift, order, payment
from tenancy.tests.helpers import account, organization, pos_client

pytestmark = pytest.mark.django_db


def test_payment_review_identity_is_exact_and_tenant_scoped(setup):
    """La consulta conserva la identidad exacta y respeta el acceso al pedido."""
    # Falla si la consulta pierde la identidad del pago aceptado o permite leerla desde otra organización/sede.
    s = setup
    open_shift(s)
    o = order(s)
    key = "offline-ReViSion-0001"
    payment(s, o, 5000, received=10000, reference="Comprobante 41", request_key=key)
    result = call(s["client"], "get", f"orders/{o['id']}")["order"]["payments"]
    assert len(result) == 1
    assert result[0]["request_key"] == key
    assert result[0]["amount"] == 5000
    assert result[0]["received"] == 10000
    assert result[0]["reference"] == "Comprobante 41"
    other = pos_client(account(organization("otra-organizacion")))
    assert call(other, "get", f"orders/{o['id']}", status=404)["error"] == "not_found"
    restricted = pos_client(account(s["org"], "cashier", "caja.norte", restaurants=[s["r2"]]))
    assert call(restricted, "get", f"orders/{o['id']}", status=404)["error"] == "not_found"
    unauthenticated = s["client"].__class__()
    unauthenticated.credentials(HTTP_X_WAITER_ORG=s["org"].slug)
    call(unauthenticated, "get", f"orders/{o['id']}", status=401)


def test_payment_review_missing_identity_is_null(setup):
    """Una identidad ausente se representa como null, sin generar una clave."""
    # Falla si un pago antiguo sin clave se presenta como una identidad verificable o se inventa una al consultarlo.
    s = setup
    open_shift(s)
    o = order(s)
    payment(s, o)
    Payment.objects.filter(order_id=o["id"]).update(request_key="")
    result = call(s["client"], "get", f"orders/{o['id']}")["order"]["payments"]
    assert len(result) == 1
    assert result[0]["request_key"] is None
