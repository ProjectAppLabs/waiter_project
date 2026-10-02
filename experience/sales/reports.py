"""Informes por fecha de cobro en la zona horaria de la organización."""

from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework.response import Response

from catalog.api import PosView
from catalog.services import restaurant_for, valid

from .api import get_shift, limit
from .policy import permit
from .reading import order_dict, orders
from .services import period


def selection(account, params):
    restaurant = restaurant_for(account, params.get("restaurant_id"))
    qs = orders().filter(restaurant=restaurant, state="paid")
    if params.get("shift_id"):
        valid(params["shift_id"].isdecimal())
        shift = get_shift(account, int(params["shift_id"]))
        valid(shift.restaurant_id == restaurant.pk)
        return qs.filter(shift=shift)
    start, end = period(account.organization, params.get("from"), params.get("to"))
    return qs.filter(paid_at__gte=start, paid_at__lt=end)


def summary(qs):
    total = Decimal(0)
    count = autonomous = 0
    methods = {}
    waiters = {}
    products = {}
    for order in qs:
        amount = order.total - order.tip
        total += amount
        count += 1
        autonomous += int(order.origin != "waiter")
        row = waiters.setdefault(
            order.created_by_id, {"waiter": order.created_by.name, "amount": Decimal(0), "orders": 0}
        )
        row["amount"] += amount
        row["orders"] += 1
        for p in order.payments.all():
            row = methods.setdefault(p.method_id, {"method": p.method.name, "amount": Decimal(0)})
            row["amount"] += p.amount
        for line in order.lines.all():
            if line.cancelled or line.parent_id:
                continue
            row = products.setdefault(line.product_id, {"product": line.name, "qty": Decimal(0), "amount": Decimal(0)})
            row["qty"] += line.qty
            row["amount"] += line.total
    return {
        "total": total,
        "orders": count,
        "autonomous": autonomous,
        "by_method": list(methods.values()),
        "by_waiter": list(waiters.values()),
        "top_products": sorted(products.values(), key=lambda p: -p["qty"]),
    }


class SalesView(PosView):
    mode = "summary"

    def get(self, request):
        permit(self.account, *(["sales", "history"] if self.mode == "orders" else ["sales"]))
        qs = selection(self.account, request.query_params).order_by("-paid_at", "-id")
        if self.mode == "orders":
            return Response({"orders": [order_dict(o) for o in qs[: limit(request, 200)]]})
        return Response(summary(qs))


class InsightsView(PosView):
    def get(self, request):
        permit(self.account, "dashboard")
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        zone = ZoneInfo(self.org.timezone)
        today = timezone.now().astimezone(zone).date()
        start, end = period(self.org, (today - timedelta(days=83)).isoformat(), today.isoformat())
        recent = today - timedelta(days=27)
        previous = today - timedelta(days=55)
        daily = {}
        hourly = {}
        products = {}
        for order in orders().filter(restaurant=restaurant, state="paid", paid_at__gte=start, paid_at__lt=end):
            local = order.paid_at.astimezone(zone)
            day = local.date()
            amount = order.total - order.tip
            row = daily.setdefault(day.isoformat(), {"date": day.isoformat(), "total": Decimal(0), "orders": 0})
            row["total"] += amount
            row["orders"] += 1
            if day >= recent:
                row = hourly.setdefault(local.hour, {"hour": local.hour, "total": Decimal(0), "orders": 0})
                row["total"] += amount
                row["orders"] += 1
            if day >= previous:
                for line in order.lines.all():
                    if line.cancelled or line.parent_id:
                        continue
                    row = products.setdefault(
                        line.product_id,
                        {
                            "product_id": line.product_id,
                            "name": line.name,
                            "qty": Decimal(0),
                            "amount": Decimal(0),
                            "prev_qty": Decimal(0),
                        },
                    )
                    if day >= recent:
                        row["qty"] += line.qty
                        row["amount"] += line.total
                    else:
                        row["prev_qty"] += line.qty
        return Response(
            {
                "today": today.isoformat(),
                "window_days": 28,
                "history_days": 84,
                "daily": sorted(daily.values(), key=lambda r: r["date"]),
                "hourly": sorted(hourly.values(), key=lambda r: r["hour"]),
                "products": sorted(products.values(), key=lambda r: -r["qty"]),
            }
        )
