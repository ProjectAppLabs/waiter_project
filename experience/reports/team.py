"""Horas recortadas al periodo y ventas atribuidas al creador del pedido."""

from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response

from accounts.models import Account, Attendance
from accounts.services import restaurants_for
from catalog.api import PosView
from catalog.services import manager, restaurant_for, valid
from sales.models import Order
from sales.services import period
from tenancy.http import require
from tenancy.modules import is_active, require_module

ZERO = Decimal(0)
CENT = Decimal("0.01")


def selection(account, params, module="nucleo"):
    manager(account)
    start, end = period(account.organization, params.get("from"), params.get("to"))
    valid((end.date() - start.date()).days <= 366, "El periodo no puede superar 366 días.")
    if params.get("restaurant_id"):
        local = restaurant_for(account, params["restaurant_id"])
        require_module(account.organization, module, local)
        locals_ = [local]
    else:
        require_module(account.organization, module)
        locals_ = [r for r in restaurants_for(account) if is_active(account.organization, module, r)]
    return start, end, locals_


def team_report(account, params):
    require(account.role == "owner")
    start, end, locals_ = selection(account, params)
    local_ids = [r.pk for r in locals_]
    people = Account.objects.filter(organization=account.organization).order_by("name", "id")
    if params.get("restaurant_id"):
        people = people.filter(
            Q(restaurants__in=locals_)
            | Q(attendances__restaurant__in=locals_)
            | Q(pk__in=Order.objects.filter(restaurant__in=locals_).values("created_by_id"))
        ).distinct()
    rows = {
        p.pk: {
            "account": {"id": p.pk, "name": p.name, "role": p.role},
            "hours": ZERO,
            "shifts": 0,
            "orders": 0,
            "sales": ZERO,
            "tips": ZERO,
            "hourly_rate": p.hourly_rate,
            "estimated_pay": None,
        }
        for p in people
    }
    attendances = Attendance.objects.filter(account__organization=account.organization, check_in__lt=end).filter(
        Q(check_out__isnull=True) | Q(check_out__gt=start)
    )
    attendances = attendances.filter(
        Q(restaurant_id__in=local_ids)
        | (Q(restaurant__isnull=True) if not params.get("restaurant_id") else Q(pk__in=[]))
    )
    now = timezone.now()
    for attendance in attendances:
        row = rows.get(attendance.account_id)
        if row is None:
            continue
        delta = min(attendance.check_out or now, end, now) - max(attendance.check_in, start)
        seconds = Decimal(delta.days * 86400 + delta.seconds) + Decimal(delta.microseconds) / 1000000
        if seconds <= 0:
            continue
        row["hours"] += seconds / 3600
        row["shifts"] += 1
    orders = Order.objects.filter(
        organization=account.organization,
        restaurant_id__in=local_ids,
        state="paid",
        paid_at__gte=start,
        paid_at__lt=end,
    )
    for order in orders:
        row = rows.get(order.created_by_id)
        if row:
            row["orders"] += 1
            row["sales"] += order.total - order.tip
            row["tips"] += order.tip
    for row in rows.values():
        row["hours"] = row["hours"].quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if row["hourly_rate"] is not None:
            row["estimated_pay"] = (row["hours"] * row["hourly_rate"] + row["tips"]).quantize(
                CENT, rounding=ROUND_HALF_UP
            )
    totals = {
        key: sum((row[key] or ZERO for row in rows.values()), ZERO)
        for key in ("hours", "shifts", "orders", "sales", "tips", "estimated_pay")
    }
    return {"rows": list(rows.values()), "totals": totals}


class TeamReportView(PosView):
    def get(self, request):
        return Response(team_report(self.account, request.query_params))
