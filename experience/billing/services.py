"""Revisión sin escrituras y emisión serializada por pedido y resolución."""

from decimal import Decimal
from functools import wraps
from time import sleep
from zoneinfo import ZoneInfo

from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.db import OperationalError, connection, transaction
from django.db.models import F
from django.utils import timezone

from catalog.services import reference, valid, writing
from loyalty.models import Customer
from sales.models import Order
from sales.reading import orders
from sales.services import rounded
from tenancy.http import Problem, model_dict

from .company import company_dict
from .models import BillingSettings, Resolution, SalesDocument
from .providers.simulated import SimulatedProvider

RESOLUTION_FIELDS = (
    "id",
    "kind",
    "prefix",
    "number_from",
    "number_to",
    "next_number",
    "valid_from",
    "valid_to",
    "technical_key",
    "active",
)


def provider():
    return SimulatedProvider()


def settings_for(org):
    return BillingSettings.objects.filter(organization=org).first() or BillingSettings(organization=org)


def resolution_for(org, kind, lock=False):
    today = timezone.now().astimezone(ZoneInfo(org.timezone)).date()
    qs = Resolution.objects.filter(
        organization=org,
        kind=kind,
        active=True,
        valid_from__lte=today,
        valid_to__gte=today,
        next_number__lte=F("number_to"),
    )
    if lock:
        qs = qs.select_for_update()
    return qs.order_by("valid_to", "id").first()


def buyer_for(org, customer_id):
    if customer_id is not None:
        return reference(Customer, org, customer_id)
    return Customer.objects.filter(organization=org, vat="222222222222").order_by("id").first()


def snapshot_lines(order):
    lines, taxes = [], {}
    for line in order.lines.all():
        if line.cancelled or line.parent_id:
            continue
        details = []
        rates = [Decimal(str(t["amount"])) for t in line.taxes]
        remaining = line.total - line.subtotal
        for index, (tax, rate) in enumerate(zip(line.taxes, rates, strict=True)):
            amount = remaining if index == len(rates) - 1 else rounded(line.subtotal * rate / 100)
            remaining -= amount
            row = {"name": tax["name"], "rate": float(rate), "base": float(line.subtotal), "amount": float(amount)}
            details.append(row)
            aggregate = taxes.setdefault(
                (tax["name"], rate),
                {"name": tax["name"], "rate": float(rate), "base": Decimal(0), "amount": Decimal(0)},
            )
            aggregate["base"] += line.subtotal
            aggregate["amount"] += amount
        lines.append(
            {
                **model_dict(
                    line, ("id", "product_id", "name", "qty", "unit_price", "discount_pct", "subtotal", "total")
                ),
                "base": float(line.subtotal),
                "tax": float(line.total - line.subtotal),
                "taxes": details,
            }
        )
    return lines, [{**row, "base": float(row["base"]), "amount": float(row["amount"])} for row in taxes.values()]


def review(order, org, buyer, resolution):
    issues = []

    def check(condition, message):
        if not condition:
            issues.append(message)

    check(order.state == "paid", "La venta debe estar pagada antes de emitir el documento.")
    check(
        buyer and buyer.active and buyer.name.strip() and buyer.vat.strip(),
        "Selecciona un comprador activo con nombre y documento, o consumidor final.",
    )
    check(
        resolution is not None, "Configura una resolución vigente con números disponibles para este tipo de documento."
    )
    for value, label in [
        (org.legal_name or org.name, "nombre"),
        (org.tax_id, "NIT"),
        (org.tax_id_dv, "dígito de verificación"),
        (org.fiscal_regime, "régimen fiscal"),
        (org.address, "dirección"),
    ]:
        check(
            bool(value),
            f"Completa el {label} del emisor." if label != "dirección" else "Completa la dirección del emisor.",
        )
    lines = [line for line in order.lines.all() if not line.cancelled]
    check(bool(lines), "La venta no contiene líneas.")
    check(
        sum((line.total for line in lines), Decimal(0)) == order.total - order.tip,
        "El total de las líneas no coincide con la venta sin propina. Revisa los importes y el redondeo.",
    )
    check(
        sum((line.total - line.subtotal for line in lines), Decimal(0)) == order.tax,
        "Los impuestos de las líneas no coinciden con el total de impuestos de la venta.",
    )
    check(
        sum((p.amount for p in order.payments.all()), Decimal(0)) == order.total,
        "Los pagos netos no coinciden con la venta. Revisa el cambio y los pagos registrados.",
    )
    check(
        order.subtotal + order.tax + order.tip == order.total and order.tip >= 0,
        "La propina voluntaria debe quedar separada de la base y sin impuestos de venta.",
    )
    for line in lines:
        rate = sum((Decimal(str(t["amount"])) for t in line.taxes), Decimal(0))
        check(
            rounded(line.total / (1 + rate / 100)) == line.subtotal,
            f"La base y el impuesto de {line.name} no coinciden con las tasas guardadas.",
        )
    return {
        "company": org.legal_name or org.name,
        "journal": resolution.prefix if resolution else "",
        "currency": "COP",
        "tip": float(order.tip),
        "issues": list(dict.fromkeys(issues)),
        "ready": not issues,
    }


def transmit(document):
    document.attempts += 1
    try:
        result = provider().issue(document)
    except (ConnectionError, TimeoutError, OSError):
        document.state = "contingency"
        document.errors = ["No fue posible conectar con el proveedor. Reintenta con el mismo documento."]
    else:
        document.state, document.errors = result.state, result.errors
        document.provider_id, document.cufe, document.qr = result.provider_id, result.cufe, result.qr
        if result.xml:
            document.xml.save(f"{document.organization_id}/{document.pk}.xml", ContentFile(result.xml), save=False)
    document.save()
    if (
        document.state == "issued"
        and settings_for(document.organization).send_email
        and document.buyer_data.get("email")
    ):

        def deliver():
            message = EmailMessage(
                f"Documento de venta {document.number}",
                f"Adjuntamos el documento {document.number}. Proveedor simulado: sin validación DIAN.",
                to=[document.buyer_data["email"]],
            )
            with document.xml.open("rb") as source:
                message.attach(f"{document.number}.xml", source.read(), "application/xml")
            message.send(using="waiter")

        # Un fallo del correo no revierte ni vuelve a emitir un documento aceptado.
        transaction.on_commit(deliver, robust=True)
    return document


def sqlite_busy_retry(function):
    """SQLite compartido no espera por bloqueos de tabla; PostgreSQL usa los bloqueos de fila.

    Solo se reintenta una transacción íntegramente revertida, nunca un error del proveedor.
    """

    @wraps(function)
    def wrapped(*args, **kwargs):
        for attempt in range(40):
            try:
                return function(*args, **kwargs)
            except OperationalError as exc:
                if (
                    connection.vendor != "sqlite"
                    or "locked" not in str(exc).lower()
                    or connection.in_atomic_block
                    or attempt == 39
                ):
                    raise
                sleep(min(0.01 * (attempt + 1), 0.1))

    return wrapped


@sqlite_busy_retry
def emit(account, order_id, data):
    key = data["request_key"]
    valid(isinstance(key, str) and 16 <= len(key) <= 80, "La clave de solicitud debe tener entre 16 y 80 caracteres.")
    org = account.organization
    with writing(org, operational=True):
        reference(Order, org, order_id)
        order = Order.objects.select_for_update().get(pk=order_id, organization=org)
        existing = SalesDocument.objects.filter(order=order, organization=org).first()
        if existing:
            return existing, False
        if SalesDocument.objects.filter(organization=org, request_key=key).exists():
            raise Problem("request_key_conflict", "La clave de solicitud ya pertenece a otra venta.", 409)
        config = settings_for(org)
        kind = data.get("kind", config.default_kind)
        valid(kind in ("invoice", "pos"))
        resolution = resolution_for(org, kind, lock=True)
        buyer = buyer_for(org, data.get("customer_id"))
        order = orders().get(pk=order.pk)
        # Vuelve a leer el emisor después del bloqueo, también al reintentar desde otra sesión.
        org.refresh_from_db()
        result = review(order, org, buyer, resolution)
        if not result["ready"]:
            raise Problem(
                "not_ready", "Corrige los problemas de la revisión antes de emitir.", 409, issues=result["issues"]
            )
        lines, taxes = snapshot_lines(order)
        number = f"{resolution.prefix}-{resolution.next_number}"
        resolution.next_number += 1
        resolution.save(update_fields=["next_number"])
        document = SalesDocument.objects.create(
            organization=org,
            restaurant_id=order.restaurant_id,
            order=order,
            kind=kind,
            resolution=resolution,
            number=number,
            buyer=buyer,
            buyer_data=model_dict(buyer, ("id", "name", "vat", "id_type", "email", "street", "city")),
            company_data={**company_dict(org), "timezone": org.timezone},
            resolution_data=model_dict(resolution, RESOLUTION_FIELDS),
            tip_label=config.tip_label,
            issued_at=timezone.now(),
            subtotal=order.subtotal,
            tax_total=order.tax,
            tip=order.tip,
            total=order.total,
            taxes=taxes,
            lines=lines,
            request_key=key,
            created_by=account,
        )
        return transmit(document), True


@sqlite_busy_retry
def retry(account, pk):
    with writing(account.organization, operational=True):
        document = reference(SalesDocument, account.organization, pk)
        document = SalesDocument.objects.select_for_update().get(pk=document.pk)
        if document.state == "issued":
            return document
        if document.state not in ("contingency", "pending"):
            raise Problem(
                "not_retryable", "El documento rechazado requiere revisión; no puede reenviarse sin corrección.", 409
            )
        return transmit(document)
