"""Exportes completos, aislados y compatibles con Excel en Colombia."""

import csv
import io
import json
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Count, Exists, F, Max, OuterRef, Q, Sum
from django.http import HttpResponse

from catalog.api import PosView
from catalog.services import valid
from experience_app.models import DinerAccount
from inventory.models import Stock, StockMove
from loyalty.models import Customer
from sales.models import Order, Payment, Refund
from tenancy.audit_api import entries, entry_dict

from .team import selection, team_report

HEADERS = {
    "ventas": [
        "Fecha y hora",
        "Local",
        "Pedido",
        "Servicio",
        "Mesa",
        "Mesero",
        "Cliente",
        "Plato",
        "Cantidad",
        "Precio unitario",
        "Descuento",
        "Impuesto",
        "Valor impuesto",
        "Total de la línea",
        "Métodos de pago",
        "Propina del pedido",
        "Devuelto",
    ],
    "pagos": ["Fecha", "Local", "Pedido", "Método", "Valor", "Recibido", "Cambio", "Referencia", "Cajero"],
    "inventario": [
        "Local",
        "Ingrediente",
        "Categoría",
        "Unidad",
        "Cantidad",
        "Costo unitario",
        "Valor",
        "Mínimo",
        "Estado",
    ],
    "movimientos": ["Fecha", "Local", "Ingrediente", "Tipo", "Cantidad", "Unidad", "Motivo", "Persona"],
    "clientes": [
        "Nombre",
        "Tipo de documento",
        "Número de documento",
        "Correo",
        "Teléfono",
        "Puntos",
        "Visitas",
        "Total gastado",
        "Última visita",
        "Acepta novedades",
    ],
    "equipo": [
        "Persona",
        "Rol",
        "Horas",
        "Turnos",
        "Pedidos",
        "Ventas",
        "Propinas",
        "Valor de la hora",
        "Pago estimado",
    ],
    "historial": [
        "Id",
        "Fecha",
        "Local",
        "Tipo de actor",
        "Id de actor",
        "Persona",
        "Acción",
        "Nombre de acción",
        "Entidad",
        "Id de entidad",
        "Resumen",
        "Antes",
        "Después",
    ],
}
SERVICES = {"dine_in": "En mesa", "takeout": "Para llevar", "delivery": "Domicilio"}
KINDS = {
    "receipt": "Entrada",
    "waste": "Merma",
    "count": "Conteo",
    "sale": "Venta",
    "adjust": "Ajuste",
    "return": "Devolución",
}
ROLES = {"owner": "Dueño", "admin": "Encargado", "cashier": "Cajero", "waiter": "Mesero"}
CATEGORIES = {
    "produce": "Frutas y verduras",
    "meat": "Carnes",
    "seafood": "Pescados y mariscos",
    "dairy": "Lácteos",
    "dry": "Despensa",
}


def cell(value, zone):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Sí" if value else "No"
    if isinstance(value, Decimal):
        return format(value, "f").replace(".", ",")
    if isinstance(value, datetime):
        return value.astimezone(zone).isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    # Excel interpreta como fórmulas los nombres y referencias que comienzan con estos signos.
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return "'" + value
    return value


def sale_rows(account, start, end, locals_):
    orders = (
        Order.objects.filter(
            organization=account.organization, restaurant__in=locals_, state="paid", paid_at__gte=start, paid_at__lt=end
        )
        .select_related("restaurant", "table", "created_by", "customer")
        .prefetch_related("lines", "payments__method")
        .order_by("paid_at", "id")
    )
    for order in orders:
        for line in order.lines.all():
            if line.cancelled:
                continue
            yield [
                order.paid_at,
                order.restaurant.name,
                order.number,
                SERVICES[order.service],
                order.table.number if order.table else "",
                order.created_by.name if order.created_by else "",
                order.customer.name if order.customer else order.customer_name,
                line.name,
                line.qty,
                line.unit_price,
                line.discount_pct,
                ", ".join(t.get("name", "") for t in line.taxes),
                line.total - line.subtotal,
                line.total,
                ", ".join(p.method.name for p in order.payments.all()),
                order.tip,
                False,
            ]
    refunds = (
        Refund.objects.filter(
            organization=account.organization, restaurant__in=locals_, created_at__gte=start, created_at__lt=end
        )
        .select_related("order__created_by", "order__table", "order__customer", "restaurant")
        .prefetch_related("payments__method", "order__lines")
        .order_by("created_at", "id")
    )
    for refund in refunds:
        order = refund.order
        originals = {line.pk: line for line in order.lines.all()}
        for row in refund.lines:
            original = originals.get(row["line_id"])
            amount, subtotal = Decimal(str(row["amount"])), Decimal(str(row["subtotal"]))
            yield [
                refund.created_at,
                refund.restaurant.name,
                order.number,
                SERVICES[order.service],
                order.table.number if order.table else "",
                order.created_by.name if order.created_by else "",
                order.customer.name if order.customer else order.customer_name,
                row["name"],
                -Decimal(str(row["qty"])),
                original.unit_price if original else None,
                original.discount_pct if original else None,
                ", ".join(t.get("name", "") for t in original.taxes) if original else "",
                -(amount - subtotal),
                -amount,
                ", ".join(p.method.name for p in refund.payments.all()),
                -refund.tip,
                True,
            ]


def rows(kind, account, params, start, end, locals_):
    org = account.organization
    if kind == "ventas":
        yield from sale_rows(account, start, end, locals_)
    elif kind == "pagos":
        qs = (
            Payment.objects.filter(
                organization=org, order__restaurant__in=locals_, created_at__gte=start, created_at__lt=end
            )
            .select_related("order__restaurant", "method", "account")
            .order_by("created_at", "id")
        )
        for p in qs.iterator():
            yield [
                p.created_at,
                p.order.restaurant.name,
                p.order.number,
                p.method.name,
                p.amount,
                p.received,
                max(Decimal(0), p.received - p.amount) if p.received is not None else Decimal(0),
                p.reference,
                p.account.name if p.account else "",
            ]
    elif kind == "inventario":
        for stock in (
            Stock.objects.filter(restaurant__in=locals_, ingredient__organization=org)
            .select_related("restaurant", "ingredient__unit")
            .order_by("restaurant_id", "ingredient_id")
            .iterator()
        ):
            p = stock.ingredient
            yield [
                stock.restaurant.name,
                p.name,
                CATEGORIES.get(p.pantry_category, p.pantry_category),
                p.unit.name,
                stock.qty,
                p.cost,
                stock.qty * p.cost,
                stock.min,
                "Bajo" if stock.qty <= 0 or stock.qty < stock.min else "Normal",
            ]
    elif kind == "movimientos":
        qs = (
            StockMove.objects.filter(
                organization=org, restaurant__in=locals_, created_at__gte=start, created_at__lt=end
            )
            .select_related("restaurant", "ingredient__unit", "unit", "account")
            .order_by("created_at", "id")
        )
        for move in qs.iterator():
            yield [
                move.created_at,
                move.restaurant.name,
                move.ingredient.name,
                KINDS[move.kind],
                move.qty,
                (move.unit or move.ingredient.unit).name,
                move.reason,
                move.account.name if move.account else "",
            ]
    elif kind == "clientes":
        customers = Customer.objects.filter(organization=org).select_related("card").order_by("name", "id")
        if account.role != "owner" or params.get("restaurant_id"):
            # La pertenencia a la sede admite cualquier pedido; no debe multiplicar los agregados de visitas.
            orders_in_scope = Order.objects.filter(customer_id=OuterRef("pk"), restaurant__in=locals_)
            customers = customers.filter(Exists(orders_in_scope))
        paid_visits = Q(orders__state="paid", orders__restaurant__in=locals_)
        customers = list(
            customers.annotate(
                export_visits=Count("orders", filter=paid_visits),
                export_spend=Sum(F("orders__total") - F("orders__refunded"), filter=paid_visits),
                export_last_visit=Max("orders__paid_at", filter=paid_visits),
            )
        )
        consenting = set(
            DinerAccount.objects.filter(
                pk__in=[customer.diner_key for customer in customers if customer.diner_key],
                organization_slug=org.slug,
                marketing=True,
            ).values_list("pk", flat=True)
        )
        for customer in customers:
            # SQL conserva los centavos; el CSV mantiene dos decimales con visitas y «0» cuando no hay ninguna.
            spend = customer.export_spend.quantize(Decimal("0.01")) if customer.export_visits else Decimal(0)
            yield [
                customer.name,
                customer.id_type,
                customer.vat,
                customer.email,
                customer.phone,
                customer.card.points if hasattr(customer, "card") else 0,
                customer.export_visits,
                spend,
                customer.export_last_visit,
                customer.diner_key in consenting,
            ]
    elif kind == "equipo":
        for row in team_report(account, params)["rows"]:
            yield [
                row["account"]["name"],
                ROLES[row["account"]["role"]],
                *[row[key] for key in ("hours", "shifts", "orders", "sales", "tips", "hourly_rate", "estimated_pay")],
            ]
    elif kind == "historial":
        for entry in entries(account, params).iterator():
            e = entry_dict(entry)
            yield [
                e["id"],
                e["at"],
                e["restaurant"]["name"] if e["restaurant"] else "",
                e["actor"]["kind"],
                e["actor"]["id"],
                e["actor"]["name"],
                e["action"],
                e["action_name"],
                e["entity"],
                e["entity_id"],
                e["summary"],
                e["before"],
                e["after"],
            ]


class ExportsView(PosView):
    def get(self, request, kind):
        valid(kind in HEADERS, "El tipo de exporte no existe.")
        module = (
            "inventario"
            if kind in ("inventario", "movimientos")
            else "fidelizacion"
            if kind == "clientes"
            else "nucleo"
        )
        start, end, locals_ = selection(self.account, request.query_params, module)
        output = io.StringIO(newline="")
        output.write("\ufeff")
        writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
        writer.writerow(HEADERS[kind])
        zone = ZoneInfo(self.org.timezone)
        for row in rows(kind, self.account, request.query_params, start, end, locals_):
            writer.writerow([cell(value, zone) for value in row])
        response = HttpResponse(output.getvalue().encode("utf-8"), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="{kind}-{start.date()}-a-{end.date() - timedelta(days=1)}.csv"'
        )
        return response
