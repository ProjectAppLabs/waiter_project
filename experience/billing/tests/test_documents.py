from datetime import date
from unittest.mock import patch
from uuid import uuid4
from xml.etree import ElementTree

import pytest
from django.core import mail
from django.db import connection
from django.test.utils import CaptureQueriesContext

from billing.models import BillingSettings, Resolution, SalesDocument
from billing.providers.simulated import SimulatedProvider
from billing.tests.helpers import configured, emit, paid
from loyalty.models import Customer
from sales.models import Order, OrderLine, Payment
from sales.tests.helpers import call
from tenancy.tests.helpers import organization

pytestmark = pytest.mark.django_db


def test_seed_and_read_only_review(setup):
    # Falla si falta la numeración de prueba o revisar escribe clientes, numeración o documentos.
    s = configured(setup)
    o = paid(s, 1200)
    with CaptureQueriesContext(connection) as queries:
        result = call(s["client"], "get", f"billing/orders/{o['id']}/review")
    assert result == {
        "company": "Restaurante SAS",
        "journal": "SETP",
        "currency": "COP",
        "tip": 1200,
        "ready": True,
        "issues": [],
    }
    assert not any(q["sql"].lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")) for q in queries)
    assert Customer.objects.filter(organization=s["org"], vat="222222222222").count() == 1
    assert Resolution.objects.get(organization=s["org"]).next_number == 990000000
    assert not SalesDocument.objects.exists()
    other = organization("otra")
    assert Resolution.objects.filter(organization=other).count() == 1
    assert BillingSettings.objects.filter(organization=other).count() == 1


def test_emit_idempotent_and_immutable(setup):
    # Falla si reemitir cambia comprador, número, CUFE o los datos históricos del documento.
    s = configured(setup)
    o = paid(s, 1000)
    d = emit(s, o)
    assert d["state"] == "issued" and d["buyer"] == "Consumidor final"
    assert d["number"] == "SETP-990000000" and d["attempts"] == 1
    assert d["subtotal"] == 10000 and d["tax_total"] == 800 and d["total"] == 11800
    assert d["taxes"] == [{"name": "INC 8 %", "rate": 8, "base": 10000, "amount": 800}]
    assert d["lines"][0]["base"] == 10000
    again = call(
        s["client"],
        "post",
        f"billing/orders/{o['id']}/document",
        {"customer_id": 999999, "kind": "invoice", "request_key": uuid4().hex},
    )["document"]
    assert again == d
    record = SalesDocument.objects.get(pk=d["id"])
    assert SimulatedProvider().issue(record).cufe == d["cufe"] and len(d["cufe"]) == 96
    with record.xml.open() as source:
        assert ElementTree.parse(source).getroot().tag.endswith("Invoice")
    call(s["client"], "patch", "company", {"tax_id": "99999", "name": "<script>alert(1)</script>"})
    detail = call(s["client"], "get", f"documents/{d['id']}/detail")
    assert detail["debit"] == detail["credit"] == 11800 and detail["company_currency"] == "COP"
    assert detail["lines"][-1]["credit"] == 1000 and detail["ready"]
    response = s["client"].get(f"/api/pos/v1/documents/{d['id']}/pdf?org={s['org'].slug}")
    assert response.status_code == 200
    assert (
        b"900123456" in response.content
        and d["cufe"].encode() in response.content
        and b"data:image/png;base64" in response.content
    )
    assert b"99999" not in response.content
    assert call(s["client"], "get", f"documents/{d['id']}")["document"] == d
    assert call(s["client"], "get", "documents")["documents"][0]["buyer"] == "Consumidor final"
    assert call(s["client"], "post", f"documents/{d['id']}/retry")["document"] == d


@pytest.mark.parametrize(
    "fault, expected",
    [
        ("unpaid", "pagada"),
        ("buyer", "comprador"),
        ("lines", "total de las líneas"),
        ("tax", "impuestos de las líneas"),
        ("payment", "pagos netos"),
        ("resolution", "resolución"),
        ("expired", "resolución"),
        ("exhausted", "resolución"),
        ("nit", "NIT"),
        ("dv", "verificación"),
        ("regime", "régimen"),
        ("address", "dirección"),
        ("tip", "propina"),
        ("base", "tasas guardadas"),
    ],
)
def test_each_review_issue(setup, fault, expected):
    # Falla si la revisión permite emitir una venta con una inconsistencia fiscal o monetaria.
    s = configured(setup)
    o = paid(s)
    query = ""
    if fault == "unpaid":
        Order.objects.filter(pk=o["id"]).update(state="draft")
    elif fault == "buyer":
        buyer = Customer.objects.create(organization=s["org"], name="Sin documento")
        query = f"?customer_id={buyer.pk}"
    elif fault == "lines":
        OrderLine.objects.filter(order_id=o["id"]).update(total=10900)
    elif fault == "tax":
        Order.objects.filter(pk=o["id"]).update(tax=900)
    elif fault == "payment":
        Payment.objects.filter(order_id=o["id"]).update(amount=100)
    elif fault == "resolution":
        Resolution.objects.filter(organization=s["org"]).update(active=False)
    elif fault == "expired":
        Resolution.objects.filter(organization=s["org"]).update(valid_to=date(2021, 1, 1))
    elif fault == "exhausted":
        Resolution.objects.filter(organization=s["org"]).update(next_number=995000001)
    elif fault in ("nit", "dv", "regime", "address"):
        key = {"nit": "tax_id", "dv": "tax_id_dv", "regime": "fiscal_regime", "address": "address"}[fault]
        type(s["org"]).objects.filter(pk=s["org"].pk).update(**{key: ""})
    elif fault == "tip":
        Order.objects.filter(pk=o["id"]).update(subtotal=9000)
    elif fault == "base":
        OrderLine.objects.filter(order_id=o["id"]).update(taxes=[])
    review = call(s["client"], "get", f"billing/orders/{o['id']}/review{query}")
    assert not review["ready"] and any(expected in i for i in review["issues"])
    data = {"request_key": uuid4().hex}
    if fault == "buyer":
        data["customer_id"] = buyer.pk
    result = call(s["client"], "post", f"billing/orders/{o['id']}/document", data, 409)
    assert result["error"] == "not_ready" and result["issues"] == review["issues"]
    assert not SalesDocument.objects.exists()


def test_rejection_and_contingency_retry(setup):
    # Falla si el rechazo pierde sus errores o una caída consume otro número al reintentar.
    s = configured(setup)
    buyer = Customer.objects.create(organization=s["org"], name="Rechazo", id_type="NIT", vat="900000")
    d = emit(s, paid(s), customer_id=buyer.pk)
    assert d["state"] == "rejected" and d["errors"] and not d["cufe"]
    assert call(s["client"], "post", f"documents/{d['id']}/retry", status=409)["error"] == "not_retryable"
    with patch("billing.services.provider") as provider:
        provider.return_value.issue.side_effect = TimeoutError()
        d = emit(s, paid(s))
    assert d["state"] == "contingency" and d["attempts"] == 1
    before = Resolution.objects.get(organization=s["org"]).next_number
    restored = call(s["client"], "post", f"documents/{d['id']}/retry")["document"]
    assert restored["state"] == "issued" and restored["attempts"] == 2
    assert restored["number"] == d["number"] and restored["errors"] == []
    assert Resolution.objects.get(organization=s["org"]).next_number == before


def test_iva_and_request_key_conflict(setup):
    # Falla si el IVA se presenta como INC o una clave se reutiliza para otro pedido.
    s = configured(setup)
    call(s["client"], "put", "taxes/regime", {"regime": "iva"})
    s["dish"].price = 11900
    s["dish"].save()
    d = emit(s, paid(s, 2000))
    assert d["taxes"] == [{"name": "IVA 19 %", "rate": 19, "base": 10000, "amount": 1900}]
    assert d["total"] == 13900 and d["subtotal"] == 10000
    o = paid(s)
    result = call(s["client"], "post", f"billing/orders/{o['id']}/document", {"request_key": d["request_key"]}, 409)
    assert result["error"] == "request_key_conflict"


def test_resolution_exhaustion_and_new_invoice_resolution(setup):
    # Falla si se sobrepasa el rango o se modifica una resolución que ya numeró documentos.
    s = configured(setup)
    resolution = Resolution.objects.get(organization=s["org"])
    resolution.number_to = resolution.next_number
    resolution.save()
    emit(s, paid(s))
    o = paid(s)
    assert not call(s["client"], "get", f"billing/orders/{o['id']}/review")["ready"]
    call(s["client"], "patch", f"billing/resolutions/{resolution.pk}", {"next_number": 990000000}, 400)
    call(
        s["client"],
        "post",
        "billing/resolutions",
        {
            "kind": "invoice",
            "prefix": "FE",
            "number_from": 1,
            "number_to": 2,
            "valid_from": "2020-01-01",
            "valid_to": "2099-12-31",
        },
        201,
    )
    d = emit(s, o, kind="invoice")
    assert d["number"] == "FE-1" and d["kind"] == "invoice"


def test_list_filters_before_paging_and_all_payments(setup):
    # Falla si filtrar pendientes pagina antes de tiempo o recorta los medios de un pago combinado.
    s = configured(setup)
    first = paid(s)
    second = paid(s)
    emit(s, second)
    rows = call(s["client"], "get", f"billing/orders?pending=1&limit=1&restaurant_id={s['r1'].pk}")["orders"]
    assert [r["id"] for r in rows] == [first["id"]]
    assert rows[0]["payments"][0]["amount"] == 10800
    assert call(s["client"], "get", "billing/orders?q=inexistente")["orders"] == []
    assert call(s["client"], "get", "billing/orders?offset=1&limit=1")["orders"][0]["id"] == first["id"]
    call(s["client"], "get", "billing/orders?offset=-1", status=400)


def test_send_email_after_commit_once(setup, django_capture_on_commit_callbacks):
    # Falla si el correo sale antes del commit o reemitir vuelve a enviarlo.
    s = configured(setup)
    buyer = Customer.objects.create(organization=s["org"], name="Cliente", vat="123", email="cliente@ejemplo.co")
    call(s["client"], "patch", "billing/settings", {"send_email": True})
    with django_capture_on_commit_callbacks(execute=True):
        o = paid(s)
        d = emit(s, o, customer_id=buyer.pk)
        assert not getattr(mail, "outbox", [])
    assert len(mail.outbox) == 1 and mail.outbox[0].attachments[0].filename == d["number"] + ".xml"
    with django_capture_on_commit_callbacks(execute=True):
        call(s["client"], "post", f"billing/orders/{o['id']}/document", {"request_key": uuid4().hex})
    assert len(mail.outbox) == 1


def test_cufe_fixed_vector_and_xml_amounts(setup):
    # Falla si cambian el orden de campos, la zona, los ceros de impuestos ausentes o el XML pierde los importes.
    from freezegun import freeze_time

    s = configured(setup)
    o = paid(s, 1000)
    with freeze_time("2026-10-01T15:30:00Z"):
        d = emit(s, o)
    assert (
        d["cufe"] == "9dab7f1477f1bc1f89035c35d2be9b1c2841837fdb7ceffbe0c0e3c6540f3e372b9b2e26b6fe1aa6082aab718d814b0b"
    )
    doc = SalesDocument.objects.get(pk=d["id"])
    ns = {
        "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    }
    with doc.xml.open() as source:
        root = ElementTree.parse(source).getroot()
    assert root.find("cac:LegalMonetaryTotal/cbc:PayableAmount", ns).text == "11800.00"
    assert root.find("cac:TaxTotal/cbc:TaxAmount", ns).text == "800.00"
    assert root.find("cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount", ns).text == "10000.00"
    assert (
        root.find("cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:CompanyID", ns).text == "222222222222"
    )
    assert root.find("cac:InvoiceLine/cac:Item/cbc:Description", ns).text == "Papas"


def test_rounding_per_line_not_order(setup):
    # Falla si la emisión recalcula la base sobre el total y altera un centavo respecto de las líneas cobradas.
    from sales.tests.helpers import line, order, pay, payment

    s = configured(setup)
    s["dish"].price = 100
    s["dish"].save()
    o = order(s, lines=[line(s) for _ in range(3)])
    payment(s, o)
    o = pay(s, o)
    d = emit(s, o)
    assert d["subtotal"] == 277.77 and d["tax_total"] == 22.23
    assert d["taxes"][0]["amount"] == 22.23
    assert all(row["base"] == 92.59 for row in d["lines"])


def test_without_tax_and_tax_snapshot_survives_catalog_changes(setup):
    # Falla si cambiar el régimen de catálogo reescribe impuestos ya cobrados o impide una venta sin impuesto.
    s = configured(setup)
    old = paid(s)
    call(s["client"], "put", "taxes/regime", {"regime": "none"})
    d = emit(s, old)
    assert d["taxes"][0]["name"] == "INC 8 %"
    no_tax = emit(s, paid(s))
    assert no_tax["tax_total"] == 0 and no_tax["taxes"] == [] and no_tax["subtotal"] == no_tax["total"]


def test_billing_list_queries_batched(setup):
    # Falla si cada venta de la lista provoca nuevas consultas de clientes, documentos o pagos.
    s = configured(setup)
    paid(s)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            call(s["client"], "get", "billing/orders")
        return len(captured)

    before = queries()
    for _ in range(4):
        emit(s, paid(s))
    assert queries() == before


def test_customer_invoiced_uses_issued_documents_and_fiscal_buyer(setup):
    # Falla si facturado suma ventas sin emitir, rechazos, contingencias o duplica importes al combinar pedidos.
    from sales.tests.helpers import order, pay, payment

    s = configured(setup)
    buyer = Customer.objects.create(organization=s["org"], name="Compradora", vat="1234")
    for _ in range(2):
        o = order(s)
        call(s["client"], "patch", f"orders/{o['id']}", {"customer_id": buyer.pk})
        payment(s, o)
        pay(s, o)
    row = call(s["client"], "get", "customers?q=Compradora")["customers"][0]
    assert row["orders"] == 2 and row["invoiced"] == 0
    for _ in range(2):
        emit(s, paid(s), customer_id=buyer.pk)
    with patch("billing.services.provider") as provider:
        provider.return_value.issue.side_effect = TimeoutError()
        emit(s, paid(s), customer_id=buyer.pk)
    row = call(s["client"], "get", "customers?q=Compradora")["customers"][0]
    assert row["orders"] == 2 and row["invoiced"] == 21600
