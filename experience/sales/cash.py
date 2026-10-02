"""Esperado, cierre y avisos de diferencia de caja."""

from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from accounts.models import Account
from notifications.models import Notification
from tenancy.http import require

from .models import Payment
from .reading import fields, person
from .services import event, money, text


def shift_dict(shift):
    return {
        **fields(
            shift,
            "id restaurant_id state opened_at opening_cash opening_notes closed_at expected_cash counted_cash difference closing_notes",
        ),
        "opened_by": person(shift.opened_by),
        "closed_by": person(shift.closed_by),
        "over_tolerance": abs(shift.difference) > shift.restaurant.organization.cash_tolerance,
    }


def closing(shift):
    payments = list(Payment.objects.filter(order__shift=shift).select_related("method"))
    # El cajón recibe lo entregado y devuelve el cambio; amount ya es el pago neto.
    cash = sum(
        (p.received if p.received is not None else p.amount for p in payments if p.method.type == "cash"), Decimal(0)
    )
    change = sum(
        (p.received - p.amount for p in payments if p.method.type == "cash" and p.received is not None), Decimal(0)
    )
    moves = list(shift.moves.all())
    expected = (
        shift.opening_cash + cash - change + sum((m.amount if m.kind == "in" else -m.amount for m in moves), Decimal(0))
    )
    methods = {}
    for p in payments:
        if p.method.type == "cash":
            continue
        row = methods.setdefault(
            p.method_id, {"id": p.method_id, "name": p.method.name, "amount": Decimal(0), "count": 0}
        )
        row["amount"] += p.amount
        row["count"] += 1
    paid = list(shift.orders.filter(state="paid"))
    return {
        "orders_count": len(paid),
        "orders_total": sum((o.total - o.tip for o in paid), Decimal(0)),
        "opening_cash": shift.opening_cash,
        "cash_payments": cash,
        "cash_moves": [fields(m, "kind amount reason") for m in moves],
        "expected_cash": expected,
        "other_methods": list(methods.values()),
        # Un pre-pedido confirmado queda programado; se asigna al turno abierto cuando llega el cliente.
        "draft_orders": shift.orders.filter(state="draft").exclude(
            Q(reservation__state="confirmed") & Q(payments__isnull=True)).distinct().count(),
        "opening_notes": shift.opening_notes,
    }


def close(shift, account, data):
    require(shift.state == "open", "La caja ya está cerrada.", "shift_closed", 409)
    summary = closing(shift)
    require(
        not summary["draft_orders"], "Completa o cancela los pedidos en borrador antes de cerrar.", "open_orders", 409
    )
    counted = money(data["counted_cash"])
    note = text(data.get("notes", ""), 2000)
    difference = counted - summary["expected_cash"]
    require(
        not difference or note,
        "Escribe el motivo para cerrar: el dueño lo verá en los cuadres de caja.",
        "note_required",
        400,
    )
    shift.state = "closed"
    shift.closed_at = timezone.now()
    shift.closed_by = account
    shift.expected_cash = summary["expected_cash"]
    shift.counted_cash = counted
    shift.difference = difference
    shift.closing_notes = note
    shift.save()
    if abs(difference) > account.organization.cash_tolerance:
        recipients = (
            Account.objects.filter(organization=account.organization, active=True)
            .filter(Q(role="owner") | Q(role="admin", restaurants=shift.restaurant))
            .distinct()
        )
        kind = "un faltante" if difference < 0 else "un sobrante"
        amount = format(abs(difference), ",.0f").replace(",", ".")
        body = f"Caja de {shift.restaurant.name} cerró con {kind} de $ {amount} ({account.name})"
        if note:
            body += f": «{note if len(note) <= 160 else note[:159] + '…'}»"
        Notification.objects.bulk_create(
            [
                Notification(
                    organization=account.organization,
                    restaurant=shift.restaurant,
                    recipient=p,
                    kind="cash",
                    title="Diferencia en el cierre de caja",
                    body=body,
                    res_model="sales.CashShift",
                    res_id=shift.pk,
                )
                for p in recipients
            ]
        )
        event(shift.restaurant, "notify")
    event(shift.restaurant, "cash")
