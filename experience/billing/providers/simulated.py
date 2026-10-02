"""Proveedor determinista de desarrollo, sin transmisión ni firma fiscal."""

import hashlib
from decimal import Decimal
from xml.etree.ElementTree import Element, SubElement, tostring
from zoneinfo import ZoneInfo

from .base import BillingProvider, ProviderResult


def tax_code(tax):
    # El sistema propio usa IVA 19 % e INC 8 %; conserva ICA si se incorpora en una copia histórica.
    name = tax["name"].upper()
    return "04" if "INC" in name else "03" if "ICA" in name else "01"


def fiscal_fields(document):
    """Orden de campos CUFE del anexo DIAN, siempre en ambiente de pruebas (2).

    Referencia: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf
    No implementa firma, habilitación ni el CUDE real del equivalente POS.
    """
    issued = document.issued_at.astimezone(ZoneInfo(document.company_data["timezone"]))
    amounts = {code: Decimal(0) for code in ("01", "04", "03")}
    for tax in document.taxes:
        amounts[tax_code(tax)] += Decimal(str(tax["amount"]))
    return [
        document.number,
        issued.date().isoformat(),
        issued.isoformat(timespec="seconds").split("T")[1],
        f"{document.subtotal:.2f}",
        "01",
        f"{amounts['01']:.2f}",
        "04",
        f"{amounts['04']:.2f}",
        "03",
        f"{amounts['03']:.2f}",
        f"{document.total:.2f}",
        document.company_data["tax_id"],
        document.buyer_data["vat"],
        document.resolution_data["technical_key"],
        "2",
    ]


def xml_document(document, cufe):
    root = Element(
        "Invoice",
        xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        attrib={
            "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
            "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        },
    )

    def basic(parent, key, value, **attrs):
        node = SubElement(parent, "cbc:" + key, attrs)
        node.text = str(value)
        return node

    def amount(parent, key, value):
        return basic(parent, key, f"{Decimal(str(value)):.2f}", currencyID="COP")

    fields = fiscal_fields(document)
    for key, value in [
        ("UBLVersionID", "2.1"),
        ("ProfileID", "SIMULADO"),
        ("ProfileExecutionID", "2"),
        ("ID", document.number),
        ("UUID", cufe),
        ("IssueDate", fields[1]),
        ("IssueTime", fields[2]),
        ("Note", "SIMULADO: sin transmisión ni validación DIAN."),
        ("DocumentCurrencyCode", "COP"),
    ]:
        basic(root, key, value)
    basic(root, "Note", f"{document.tip_label}: {document.tip:.2f} COP. Fuera de la base gravable.")
    for role, data in [
        ("AccountingSupplierParty", document.company_data),
        ("AccountingCustomerParty", document.buyer_data),
    ]:
        party = SubElement(SubElement(root, "cac:" + role), "cac:Party")
        legal = SubElement(party, "cac:PartyLegalEntity")
        basic(legal, "RegistrationName", data.get("legal_name") or data["name"])
        basic(legal, "CompanyID", data.get("tax_id") or data["vat"])
    total_tax = SubElement(root, "cac:TaxTotal")
    amount(total_tax, "TaxAmount", document.tax_total)
    for tax in document.taxes:
        subtotal = SubElement(total_tax, "cac:TaxSubtotal")
        amount(subtotal, "TaxableAmount", tax["base"])
        amount(subtotal, "TaxAmount", tax["amount"])
        category = SubElement(subtotal, "cac:TaxCategory")
        basic(category, "Percent", tax["rate"])
        scheme = SubElement(category, "cac:TaxScheme")
        basic(scheme, "ID", tax_code(tax))
        basic(scheme, "Name", tax["name"])
    monetary = SubElement(root, "cac:LegalMonetaryTotal")
    for key, value in [
        ("LineExtensionAmount", document.subtotal),
        ("TaxExclusiveAmount", document.subtotal),
        ("TaxInclusiveAmount", document.subtotal + document.tax_total),
        ("ChargeTotalAmount", document.tip),
        ("PayableAmount", document.total),
    ]:
        amount(monetary, key, value)
    for line in document.lines:
        node = SubElement(root, "cac:InvoiceLine")
        basic(node, "ID", line["id"])
        basic(node, "InvoicedQuantity", line["qty"])
        amount(node, "LineExtensionAmount", line["base"])
        item = SubElement(node, "cac:Item")
        basic(item, "Description", line["name"])
        price = SubElement(node, "cac:Price")
        amount(price, "PriceAmount", Decimal(str(line["base"])) / Decimal(str(line["qty"])))
    return tostring(root, encoding="utf-8", xml_declaration=True)


class SimulatedProvider(BillingProvider):
    def issue(self, document):
        if document.buyer_data.get("id_type") == "NIT" and document.buyer_data["vat"].endswith("000"):
            return ProviderResult(
                state="rejected", errors=["El proveedor simulado rechazó el NIT del comprador terminado en 000."]
            )
        cufe = hashlib.sha384("".join(fiscal_fields(document)).encode()).hexdigest()
        qr = f"urn:waiter:simulated:{document.kind}:{cufe}"
        return ProviderResult("issued", "simulated:" + str(document.pk), cufe, qr, xml_document(document, cufe))
