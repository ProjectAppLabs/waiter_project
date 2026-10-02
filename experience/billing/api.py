"""Rutas administrativas de documentos, aisladas por organización."""

from datetime import date
from decimal import Decimal
from pathlib import Path

from django.db.models import Q
from django.http import HttpResponse
from django.template import Context, Engine
from rest_framework.response import Response

from catalog.api import PosView
from catalog.services import owner, reference, restaurant_for, valid, writing
from sales.models import Order, PaymentMethod
from sales.reading import orders
from tenancy.http import model_dict, payload, save_valid

from . import services as s
from .models import BillingSettings, Resolution, SalesDocument
from .qr import image_data


class OwnerView(PosView):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        owner(self.account)


def integer(value, minimum=0):
    valid(isinstance(value, str) and len(value) <= 10 and value.isascii() and value.isdecimal())
    result = int(value)
    valid(result >= minimum and result <= 2147483647)
    return result


def page(request, qs):
    offset = integer(request.query_params.get("offset", "0"))
    limit = integer(request.query_params.get("limit", "60"), 1)
    valid(limit <= 200, "El límite máximo es 200.")
    return qs[offset : offset + limit]


def document_dict(doc, detail=False):
    row = {**model_dict(doc, ("id", "number", "issued_at", "total", "state", "kind")), "buyer": doc.buyer_data["name"]}
    if detail:
        row.update(
            model_dict(
                doc,
                (
                    "order_id",
                    "restaurant_id",
                    "resolution_id",
                    "buyer_id",
                    "subtotal",
                    "tax_total",
                    "tip",
                    "lines",
                    "taxes",
                    "provider_id",
                    "cufe",
                    "qr",
                    "errors",
                    "attempts",
                    "request_key",
                    "original_id",
                ),
            )
        )
        row.update(
            company=doc.company_data,
            buyer_data=doc.buyer_data,
            resolution=doc.resolution_data,
            tip_label=doc.tip_label,
            simulated=True,
        )
    return row


class BillingOrdersView(OwnerView):
    def get(self, request):
        qs = orders().filter(organization=self.org, state="paid").select_related("customer", "document")
        params = request.query_params
        if params.get("restaurant_id"):
            qs = qs.filter(restaurant=restaurant_for(self.account, params["restaurant_id"]))
        if params.get("method_id"):
            method = reference(PaymentMethod, self.org, integer(params["method_id"], 1))
            qs = qs.filter(payments__method=method).distinct()
        if params.get("pending") in ("1", "true"):
            qs = qs.filter(document__isnull=True)
        elif params.get("pending"):
            valid(params["pending"] in ("0", "false"))
        query = params.get("q", "").strip()
        if query:
            condition = (
                Q(number__icontains=query) | Q(customer_name__icontains=query) | Q(customer__name__icontains=query)
            )
            if query.isascii() and query.isdecimal() and len(query) < 19:
                condition |= Q(pk=int(query))
            qs = qs.filter(condition)
        result = []
        for order in page(request, qs.order_by("-paid_at", "-id")):
            payments = {}
            for p in order.payments.all():
                row = payments.setdefault(
                    p.method_id, dict(method_id=p.method_id, method=p.method.name, amount=Decimal(0))
                )
                row["amount"] += p.amount
            result.append(
                {
                    **model_dict(order, ("id", "number", "paid_at", "total", "tax", "tip", "table_id", "customer_id")),
                    "customer_name": order.customer.name if order.customer else order.customer_name,
                    "document_id": order.document.pk if hasattr(order, "document") else None,
                    "payments": list(payments.values()),
                }
            )
        return Response({"orders": result})


class ReviewView(OwnerView):
    def get(self, request, pk):
        reference(Order, self.org, pk)
        order = orders().get(pk=pk)
        customer = request.query_params.get("customer_id")
        buyer = s.buyer_for(self.org, integer(customer, 1) if customer else None)
        kind = request.query_params.get("kind", s.settings_for(self.org).default_kind)
        valid(kind in ("invoice", "pos"))
        return Response(s.review(order, self.org, buyer, s.resolution_for(self.org, kind)))


class EmitView(OwnerView):
    def post(self, request, pk):
        data = payload(request.data, ("customer_id", "kind", "request_key"), ("request_key",))
        document, created = s.emit(self.account, pk, data)
        return Response({"document": document_dict(document, True)}, status=201 if created else 200)


class DocumentsView(OwnerView):
    def get(self, request, pk=None):
        if pk is not None:
            return Response({"document": document_dict(reference(SalesDocument, self.org, pk), True)})
        qs = SalesDocument.objects.filter(organization=self.org)
        query = request.query_params.get("q", "").strip()
        if query:
            qs = qs.filter(Q(number__icontains=query) | Q(buyer_data__name__icontains=query))
        return Response({"documents": [document_dict(d) for d in page(request, qs.order_by("-issued_at", "-id"))]})


class RetryView(OwnerView):
    def post(self, request, pk):
        payload(request.data, ())
        return Response({"document": document_dict(s.retry(self.account, pk), True)})


class DetailView(OwnerView):
    def get(self, request, pk):
        doc = reference(SalesDocument, self.org, pk)
        lines = [
            dict(id=1, account="Caja", label="Cobro de la venta", debit=float(doc.total), credit=0),
            dict(id=2, account="Ingresos", label="Venta sin impuestos", debit=0, credit=float(doc.subtotal)),
            dict(id=3, account="Impuesto", label="Impuestos de la venta", debit=0, credit=float(doc.tax_total)),
            dict(id=4, account="Propina para terceros", label=doc.tip_label, debit=0, credit=float(doc.tip)),
        ]
        issues = doc.errors or ([] if doc.state == "issued" else ["El documento está pendiente de emisión."])
        return Response(
            {
                "ready": not issues,
                "issues": issues,
                "company": doc.company_data["legal_name"] or doc.company_data["name"],
                "journal": doc.resolution_data["prefix"],
                "date": doc.issued_at.date().isoformat(),
                "origin": doc.order.number,
                "currency": "COP",
                "company_currency": "COP",
                "untaxed": float(doc.subtotal),
                "tax": float(doc.tax_total),
                "total": float(doc.total),
                "residual": 0,
                "tip": float(doc.tip),
                "debit": float(doc.total),
                "credit": float(doc.total),
                "original": doc.original.number if doc.original_id else "",
                "lines": lines,
                "taxes": [{"id": i + 1, "name": t["name"], "amount": t["amount"]} for i, t in enumerate(doc.taxes)],
            }
        )


class PrintView(OwnerView):
    def get(self, request, pk):
        doc = reference(SalesDocument, self.org, pk)
        template = Engine(dirs=[Path(__file__).parent / "templates"]).get_template("billing/document.html")
        html = template.render(Context({"document": doc, "qr_image": image_data(doc.qr) if doc.qr else ""}))
        return HttpResponse(
            html,
            content_type="text/html; charset=utf-8",
            headers={
                "Cache-Control": "private, no-store",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
                "X-Content-Type-Options": "nosniff",
            },
        )


def billing_settings(org):
    config = s.settings_for(org)
    resolution = s.resolution_for(org, config.default_kind)
    return {
        "company": org.legal_name or org.name,
        "journal": resolution.prefix if resolution else "",
        "currency": "COP",
        **model_dict(config, ("tip_label", "send_email", "default_kind")),
        "resolutions": [
            model_dict(r, s.RESOLUTION_FIELDS) for r in Resolution.objects.filter(organization=org).order_by("id")
        ],
    }


class SettingsView(OwnerView):
    def get(self, request):
        return Response(billing_settings(self.org))

    def patch(self, request):
        data = payload(request.data, ("tip_label", "send_email", "default_kind"))
        if "send_email" in data:
            valid(type(data["send_email"]) is bool)
        if "tip_label" in data:
            valid(isinstance(data["tip_label"], str) and 0 < len(data["tip_label"].strip()) <= 100)
            data["tip_label"] = data["tip_label"].strip()
        if "default_kind" in data:
            valid(data["default_kind"] in ("invoice", "pos"))
        with writing(self.org, operational=True):
            config, _ = BillingSettings.objects.get_or_create(organization=self.org)
            for key, value in data.items():
                setattr(config, key, value)
            save_valid(config)
        return Response(billing_settings(self.org))


class ResolutionsView(OwnerView):
    def get(self, request):
        return Response({"resolutions": billing_settings(self.org)["resolutions"]})

    def save(self, request, pk=None):
        allowed = s.RESOLUTION_FIELDS[1:]
        data = payload(
            request.data,
            allowed,
            ("kind", "prefix", "number_from", "number_to", "valid_from", "valid_to") if pk is None else (),
        )
        with writing(self.org, operational=True):
            resolution = reference(Resolution, self.org, pk) if pk else Resolution(organization=self.org)
            used = pk and SalesDocument.objects.filter(resolution=resolution).exists()
            if used:
                valid(
                    not set(data) - {"active"},
                    "Una resolución utilizada solo se puede activar o desactivar; crea otra para cambiar la numeración.",
                )
            for key, value in data.items():
                if key in ("number_from", "number_to", "next_number"):
                    valid(type(value) is int and 0 < value < 10**15)
                elif key in ("valid_from", "valid_to"):
                    try:
                        value = date.fromisoformat(value)
                    except (ValueError, TypeError):
                        valid(False, "Indica fechas válidas YYYY-MM-DD.")
                elif key == "active":
                    valid(type(value) is bool)
                else:
                    valid(isinstance(value, str))
                    value = value.strip()
                setattr(resolution, key, value)
            if pk is None and "next_number" not in data:
                resolution.next_number = resolution.number_from
            valid(resolution.kind in ("invoice", "pos"))
            valid(
                bool(resolution.prefix) and resolution.prefix.isascii() and resolution.prefix.isalnum(),
                "El prefijo debe ser alfanumérico.",
            )
            save_valid(resolution)
        return Response({"resolutions": billing_settings(self.org)["resolutions"]}, status=200 if pk else 201)

    def post(self, request):
        return self.save(request)

    def patch(self, request, pk):
        return self.save(request, pk)
