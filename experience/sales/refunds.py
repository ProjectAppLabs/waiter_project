"""Devoluciones atómicas y proporcionales a los importes históricos cobrados."""

from tenancy.audit import audited
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Prefetch
from rest_framework.response import Response

from accounts.models import Account
from accounts.services import restaurants_for
from billing.models import SalesDocument
from billing.services import sqlite_busy_retry
from catalog.api import PosView
from catalog.services import manager, number, restaurant_for, valid
from notifications.models import Notification
from tenancy.http import payload, require

from . import services as s
from .models import CashShift, Refund, RefundPayment
from .policy import permit
from .reading import fields, order_response, person

ZERO = Decimal(0)
POINT = Decimal("0.000001")


def decimal(value):
    return Decimal(str(value))


def proportional(value, qty, whole, precision=s.CENT):
    return (value * qty / whole).quantize(precision, rounding=ROUND_HALF_UP) if whole else ZERO


def refunds_for(order):
    return order.refunds.select_related("account", "order", "restaurant").prefetch_related("payments__method").order_by("id")


def refund_dict(refund):
    return {
        **fields(refund, "id order_id restaurant_id shift_id lines tip total reason restock request_key created_at"),
        # El número del pedido y el restaurante, para la lista de devoluciones del dueño.
        "order_number": refund.order.number,
        "restaurant_name": refund.restaurant.name,
        "account": person(refund.account),
        "payments": [
            {**fields(p, "method_id amount"), "name": p.method.name, "type": p.method.type}
            for p in refund.payments.all()
        ],
    }


def sale_values(lines):
    """Reparte el canje técnico entre platos y conserva cada centavo de la venta."""
    lines = sorted((line for line in lines if not line.cancelled and not line.parent_id), key=lambda line: line.pk)
    dishes = [line for line in lines if not line.points_cost and line.total >= 0]
    redemptions = [line for line in lines if line.points_cost and line.total < 0]
    gross = sum((line.total for line in dishes), ZERO)
    result = {}
    accumulated = ZERO
    for line in dishes:
        points = defaultdict(Decimal)
        discount = ZERO
        for redemption in redemptions:
            discount += proportional(-redemption.total, accumulated + line.total, gross) - proportional(
                -redemption.total, accumulated, gross
            )
            points[redemption.loyalty_card_id] += proportional(
                redemption.points_cost, accumulated + line.total, gross, POINT
            ) - proportional(redemption.points_cost, accumulated, gross, POINT)
        accumulated += line.total
        result[line.pk] = dict(
            line=line, amount=line.total - discount, subtotal=line.subtotal - discount, points=points
        )
    return result


def balances(order):
    result = sale_values(order.lines.all())
    history = list(refunds_for(order))
    returned = defaultdict(lambda: dict(qty=ZERO, amount=ZERO, subtotal=ZERO))
    for refund in history:
        for row in refund.lines:
            for key in ("qty", "amount", "subtotal"):
                returned[row["line_id"]][key] += decimal(row[key])
    for pk, row in result.items():
        row["returned"] = returned[pk]
    return result, history


def payment_balances(order):
    methods = {}
    for payment in order.payments.select_related("method").order_by("id"):
        row = methods.setdefault(
            payment.method_id,
            dict(
                method_id=payment.method_id,
                name=payment.method.name,
                type=payment.method.type,
                paid=ZERO,
                refundable=ZERO,
            ),
        )
        row["paid"] += payment.amount
        row["refundable"] += payment.amount
    for payment in RefundPayment.objects.filter(refund__order=order):
        methods[payment.method_id]["refundable"] -= payment.amount
    return methods


def original_for(order):
    return SalesDocument.objects.filter(order=order, kind__in=["invoice", "pos"], state="issued").first()


def refundable(order):
    require(order.state == "paid", "Solo se pueden devolver pedidos pagados.", "not_refundable", 409)
    rows, history = balances(order)
    tip = order.tip - sum((r.tip for r in history), ZERO)
    return {
        "lines": [
            dict(
                line_id=pk,
                name=row["line"].name,
                qty=float(row["line"].qty),
                refundable_qty=float(row["line"].qty - row["returned"]["qty"]),
                unit_amount=float(row["amount"] / row["line"].qty),
                refundable_amount=float(row["amount"] - row["returned"]["amount"]),
            )
            for pk, row in rows.items()
        ],
        "tip": float(tip),
        "payments": list(payment_balances(order).values()),
        "refunds": [refund_dict(refund) for refund in history],
        "credit_note": original_for(order) is not None,
    }


def request_data(raw):
    data = payload(
        raw,
        ("lines", "tip", "payments", "reason", "restock", "request_key"),
        ("lines", "tip", "payments", "reason", "restock", "request_key"),
    )
    key = s.text(data["request_key"], 80, True)
    valid(len(key) >= 16, "La clave de solicitud debe tener entre 16 y 80 caracteres.")
    reason = s.text(data["reason"], 500, True)
    valid(len(reason) >= 5, "Escribe un motivo de al menos cinco caracteres.")
    valid(type(data["restock"]) is bool)
    valid(isinstance(data["lines"], list) and len(data["lines"]) <= 500)
    valid(isinstance(data["payments"], list) and len(data["payments"]) <= 100)
    lines, payments = {}, {}
    for raw_line in data["lines"]:
        item = payload(raw_line, ("line_id", "qty"), ("line_id", "qty"))
        pk = s.integer(item["line_id"], high=2**63 - 1)
        valid(pk not in lines, "No repitas una línea en la devolución.")
        lines[pk] = number(item["qty"], positive=True)
    for raw_payment in data["payments"]:
        item = payload(raw_payment, ("method_id", "amount"), ("method_id", "amount"))
        pk = s.integer(item["method_id"], high=2**63 - 1)
        valid(pk not in payments, "No repitas un método en la devolución.")
        payments[pk] = s.money(item["amount"], True)
    return dict(
        lines=lines,
        payments=payments,
        tip=s.money(data["tip"]),
        reason=reason,
        restock=data["restock"],
        request_key=key,
    )


@sqlite_busy_retry
@audited
def create_refund(account, pk, raw):
    permit(account, "refund_orders")
    data = request_data(raw)
    with s.writing(account.organization):
        order = s.get_order(account, pk, True)
        previous = Refund.objects.filter(organization=account.organization, request_key=data["request_key"]).first()
        if previous:
            require(
                previous.order_id == order.pk
                and {row["line_id"]: decimal(row["qty"]) for row in previous.lines} == data["lines"]
                and {p.method_id: p.amount for p in previous.payments.all()} == data["payments"]
                and all(getattr(previous, key) == data[key] for key in ("tip", "reason", "restock")),
                "La clave de solicitud ya corresponde a otra devolución.",
                "request_key_conflict",
                409,
            )
            return previous, order
        require(order.state == "paid", "Solo se pueden devolver pedidos pagados.", "not_refundable", 409)
        rows, history = balances(order)
        remaining_tip = order.tip - sum((r.tip for r in history), ZERO)
        require(
            remaining_tip > 0 or any(row["line"].qty > row["returned"]["qty"] for row in rows.values()),
            "El pedido ya se devolvió por completo.",
            "not_refundable",
            409,
        )
        shift = CashShift.objects.select_for_update().filter(restaurant=order.restaurant, state="open").first()
        require(shift, "Abre la caja del restaurante antes de devolver.", "shift_closed", 409)
        valid(data["tip"] <= remaining_tip, "La propina supera lo que queda por devolver.")
        valid(data["lines"] or data["tip"] > 0, "Selecciona líneas o propina para devolver.")
        snapshots = []
        for line_id, qty in sorted(data["lines"].items()):
            valid(line_id in rows, "Selecciona una línea del pedido; los combos se devuelven completos.")
            row = rows[line_id]
            line, before = row["line"], row["returned"]
            valid(qty <= line.qty - before["qty"], "La cantidad supera lo que queda por devolver.")
            amount = proportional(row["amount"], before["qty"] + qty, line.qty) - before["amount"]
            subtotal = proportional(row["subtotal"], before["qty"] + qty, line.qty) - before["subtotal"]
            snapshots.append(
                dict(
                    line_id=line_id,
                    product_id=line.product_id,
                    name=line.name,
                    qty=float(qty),
                    amount=float(amount),
                    subtotal=float(subtotal),
                    tax=float(amount - subtotal),
                )
            )
        total = sum((decimal(row["amount"]) for row in snapshots), data["tip"])
        methods = payment_balances(order)
        valid(total <= order.paid - order.refunded, "La devolución supera el dinero cobrado.")
        valid(sum(data["payments"].values(), ZERO) == total, "Los métodos deben sumar el valor de la devolución.")
        for method_id, amount in data["payments"].items():
            valid(
                method_id in methods and amount <= methods[method_id]["refundable"],
                "El método supera lo pagado o lo que queda por devolver.",
            )
        refund = Refund.objects.create(
            organization=order.organization,
            restaurant=order.restaurant,
            order=order,
            shift=shift,
            lines=snapshots,
            tip=data["tip"],
            total=total,
            reason=data["reason"],
            restock=data["restock"],
            request_key=data["request_key"],
            account=account,
        )
        RefundPayment.objects.bulk_create(
            [
                RefundPayment(refund=refund, method_id=method_id, amount=amount)
                for method_id, amount in data["payments"].items()
            ]
        )
        from billing.services import credit_note
        from inventory.services import apply_return
        from loyalty.services import refund_points

        refund_points(refund, rows)
        if refund.restock:
            apply_return(refund, rows)
        credit_note(refund, original_for(order))
        order.refunded += total
        order.save(update_fields=["refunded"])
        Notification.objects.bulk_create(
            [
                Notification(
                    organization=order.organization,
                    restaurant=order.restaurant,
                    recipient=owner,
                    kind="cash",
                    title="Devolución de pedido",
                    body=f"{account.name} devolvió $ {total:,.2f} del pedido {order.number}: {refund.reason}",
                    res_model="sales.Refund",
                    res_id=refund.pk,
                )
                for owner in Account.objects.filter(organization=order.organization, role="owner", active=True)
            ]
        )
        s.event(order.restaurant, "orders", "cash", "notify")
        return refund, order


class RefundableView(PosView):
    def get(self, request, pk):
        permit(self.account, "refund_orders")
        return Response(refundable(s.get_order(self.account, pk)))


class RefundsView(PosView):
    def post(self, request, pk):
        from billing.api import document_dict

        refund, order = create_refund(self.account, pk, request.data)
        document = SalesDocument.objects.filter(refund=refund).first()
        return Response(
            {
                "refund": refund_dict(refund),
                **order_response(order),
                "credit_note": document_dict(document, True) if document else None,
            }
        )

    def get(self, request):
        manager(self.account)
        restaurants = restaurants_for(self.account)
        if request.query_params.get("restaurant_id"):
            restaurants = [restaurant_for(self.account, request.query_params["restaurant_id"])]
        start, end = s.period(self.org, request.query_params.get("from"), request.query_params.get("to"))
        refunds = Refund.objects.filter(
            organization=self.org, restaurant__in=restaurants, created_at__gte=start, created_at__lt=end
        )
        return Response(
            {
                "refunds": [
                    refund_dict(r)
                    for r in refunds.select_related("account", "order", "restaurant")
                    .prefetch_related(Prefetch("payments", queryset=RefundPayment.objects.select_related("method")))
                    .order_by("-created_at", "-id")
                ]
            }
        )
