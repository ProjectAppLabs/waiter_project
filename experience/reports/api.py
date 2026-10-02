"""Informes del dueño, con periodos locales y lecturas por lotes."""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from rest_framework.response import Response

from catalog.api import PosView
from catalog.reading import CatalogData
from catalog.services import manager, owner, price_before_taxes, restaurant_for, valid
from sales.models import Order, OrderLine
from sales.services import period
from tenancy.models import Restaurant


def metrics():
    return dict(sales=Decimal(0), orders=0, ticket=Decimal(0), guests=0, tips=Decimal(0))


def finish(row):
    row["ticket"] = row["sales"] / row["orders"] if row["orders"] else 0
    return row


class SummaryView(PosView):
    def get(self, request):
        owner(self.account)
        start, end = period(self.org, request.query_params.get("from"), request.query_params.get("to"))
        try:
            previous = start - timedelta(days=(end.date() - start.date()).days)
        except OverflowError:
            valid(False, "El periodo anterior queda fuera del rango de fechas admitido.")
        restaurants = list(Restaurant.objects.filter(organization=self.org).order_by("name", "id"))
        current, before = defaultdict(metrics), defaultdict(metrics)
        for order in Order.objects.filter(organization=self.org, state="paid", paid_at__gte=previous, paid_at__lt=end):
            row = (current if order.paid_at >= start else before)[order.restaurant_id]
            row["sales"] += order.total - order.tip
            row["tips"] += order.tip
            row["orders"] += 1
            row["guests"] += order.guests

        def total(rows):
            row = metrics()
            for value in rows.values():
                for key in ("sales", "tips", "orders", "guests"):
                    row[key] += value[key]
            return finish(row)

        return Response(
            {
                "currency": "COP",
                "date_from": start.date().isoformat(),
                "date_to": (end.date() - timedelta(days=1)).isoformat(),
                "previous_from": previous.date().isoformat(),
                "previous_to": (start.date() - timedelta(days=1)).isoformat(),
                "restaurants": [
                    {"config_id": r.pk, "name": r.name, **finish(current[r.pk]), "previous": finish(before[r.pk])}
                    for r in restaurants
                ],
                "total": {**total(current), "previous": total(before)},
            }
        )


class ProfitabilityView(PosView):
    def get(self, request):
        manager(self.account)
        rid = request.query_params.get("restaurant_id")
        restaurant = restaurant_for(self.account, rid) if rid or self.account.role != "owner" else None
        restaurants = [restaurant] if restaurant else list(Restaurant.objects.filter(organization=self.org))
        start, end = period(self.org, request.query_params.get("from"), request.query_params.get("to"))
        data = CatalogData(self.org, restaurants)
        sales = defaultdict(lambda: dict(units=Decimal(0), revenue=Decimal(0)))
        for line in OrderLine.objects.filter(
            order__organization=self.org,
            order__restaurant__in=restaurants,
            order__state="paid",
            order__paid_at__gte=start,
            order__paid_at__lt=end,
            cancelled=False,
            parent__isnull=True,
        ):
            sales[line.product_id]["units"] += line.qty
            sales[line.product_id]["revenue"] += line.subtotal
        rows = []
        for p in sorted(data.products.values(), key=lambda p: (p.name, p.pk)):
            if not p.active or p.kind != "dish" or not p.available_in_pos:
                continue
            price = data.prices.get((restaurant.pk, p.pk), p.price) if restaurant else p.price
            net = price_before_taxes(price, p.taxes.all())
            cost, _ = data.cost(p.pk)
            cost = Decimal(str(cost)) if cost is not None else None
            units, revenue = sales[p.pk]["units"], sales[p.pk]["revenue"]
            rows.append(
                {
                    "template_id": p.pk,
                    "name": p.name,
                    "category": ", ".join(c.name for c in p.categories.all()),
                    "price": price,
                    "cost": cost,
                    "margin": net - cost if cost is not None else None,
                    "food_cost_pct": cost / net * 100 if cost is not None and net > 0 else None,
                    "units": units,
                    "revenue": revenue,
                    "gross_profit": revenue - cost * units if cost is not None else None,
                    "class": None,
                }
            )
        eligible = [r for r in rows if r["units"] > 0 and r["cost"] is not None]
        units = sum(r["units"] for r in eligible)
        popularity = Decimal("0.7") * units / len(eligible) if eligible else 0
        margin = sum(r["margin"] * r["units"] for r in eligible) / units if units else 0
        for row in eligible:
            row["class"] = (
                ("star" if row["margin"] >= margin else "plowhorse")
                if row["units"] >= popularity
                else ("puzzle" if row["margin"] >= margin else "dog")
            )
        return Response(
            {
                "currency": "COP",
                "config_id": restaurant.pk if restaurant else None,
                "date_from": start.date().isoformat(),
                "date_to": (end.date() - timedelta(days=1)).isoformat(),
                "thresholds": {"popularity_units": popularity, "margin": margin},
                "rows": rows,
            }
        )
