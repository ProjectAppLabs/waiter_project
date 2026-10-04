"""Rutas T2 de pedidos y caja con permisos y alcance por restaurante."""

from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response

from accounts.services import restaurants_for
from catalog.api import PosView
from catalog.services import manager, owner, reference, restaurant_for, valid
from tenancy.http import payload, require

from . import services as s
from .cash import close, closing, shift_dict
from .models import CashMove, CashShift, Order, PaymentMethod
from .policy import permit
from .reading import fields, order_dict, order_response, orders, person


class OrdersView(PosView):
    def get(self, request, pk=None):
        if pk:
            return Response(order_response(s.get_order(self.account, pk)))
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        state = request.query_params.get("state", "open")
        valid(state in ("open", "paid"))
        qs = orders().filter(restaurant=restaurant)
        if state == "open":
            qs = qs.filter(state="draft", shift__state="open").exclude(reservation__state="confirmed")
        else:
            qs = qs.filter(state="paid")
            if request.query_params.get("from") or request.query_params.get("to"):
                start, end = s.period(self.org, request.query_params.get("from"), request.query_params.get("to"))
                qs = qs.filter(paid_at__gte=start, paid_at__lt=end)
        return Response({"orders": [order_dict(o) for o in qs.order_by("-id")[: limit(request, 200)]]})

    def post(self, request):
        permit(self.account, "create_orders")
        order, created = s.create_order(self.account, request.data)
        return Response(order_response(order), status=201 if created else 200)

    def patch(self, request, pk):
        data = payload(request.data, ("table_id", "note", "guests", "billing", "customer_name", "customer_id"))
        if 'customer_id' in data:
            permit(self.account, 'charge_orders')
        if set(data) - {'customer_id'}:
            permit(self.account, *(["create_orders", "serve_orders"] if set(data) <= {"billing"} else ["create_orders"]))
        with s.writing(self.org):
            order = s.get_order(self.account, pk, True)
            require(order.state == "draft", "El pedido ya terminó.", "not_editable", 409)
            for key, value in data.items():
                if key == "customer_id":
                    from loyalty.models import Customer
                    s.editable(order)
                    order.customer = reference(Customer, self.org, value, active=True) if value is not None else None
                elif key == "table_id":
                    from tenancy.modules import require_module
                    require_module(self.org, "salon", order.restaurant)
                    s.editable(order)
                    valid(order.service == "dine_in")
                    table = s.table_for(order, value)
                    require(
                        not Order.objects.filter(table=table, state="draft").exclude(pk=pk).exists(),
                        "La mesa ya tiene un pedido abierto.",
                        "table_busy",
                        409,
                    )
                    order.table = table
                elif key == "billing":
                    valid(type(value) is bool)
                    order.billing = value
                    order.billing_at = timezone.now() if value else None
                elif key == "guests":
                    order.guests = s.integer(value)
                else:
                    setattr(order, key, s.text(value, 120 if key == "customer_name" else 500))
            order.save()
            s.event(order.restaurant, "orders", "tables")
        return Response(order_response(order))


def limit(request, default):
    value = request.query_params.get("limit", str(default))
    valid(isinstance(value, str) and value.isdecimal())
    return s.integer(int(value), high=1000)


class OrderActionView(PosView):
    action = ""

    def post(self, request, pk):
        if self.action == "cancel":
            manager(self.account)
        else:
            permit(self.account, "charge_orders" if self.action in ("payments", "pay") else "create_orders")
        with s.writing(self.org):
            order = s.get_order(self.account, pk, True)
            if self.action == "lines":
                data = payload(request.data, ("lines", "fire"), ("lines", "fire"))
                valid(type(data["fire"]) is bool)
                s.add_lines(order, data["lines"])
                if data["fire"]:
                    s.fire(order, self.account)
                s.event(order.restaurant, "orders")
            elif self.action == "fire":
                payload(request.data, ())
                course = s.fire(order, self.account)
                s.event(order.restaurant, "orders")
            elif self.action == "payments":
                s.add_payment(order, self.account, request.data)
            elif self.action == "pay":
                data = payload(request.data, ("paid_at",))
                s.pay(order, self.account, data.get("paid_at"))
            elif self.action == "cancel":
                data = payload(request.data, ("reason",), ("reason",))
                reason = s.text(data["reason"], 500, True)
                s.editable(order, list(order.lines.select_related("course")))
                order.state = "cancelled"
                order.billing = False
                order.billing_at = None
                order.note = reason
                order.save()
                for line in order.lines.all():
                    line.cancelled = True
                    line.save(update_fields=["cancelled"])
                from loyalty.services import release_points
                release_points(order)
                s.event(order.restaurant, "orders", "kitchen", "tables")
        result = order_response(order)
        if self.action == "fire":
            result["course_id"] = course
        return Response(result)

    def delete(self, request, pk):
        require(self.action == "lines", "La ruta no existe.", "not_found", 404)
        permit(self.account, "create_orders")
        data = payload(request.data, ("line_ids",), ("line_ids",))
        ids = line_ids(data["line_ids"])
        with s.writing(self.org):
            order = s.get_order(self.account, pk, True)
            selected = list(order.lines.filter(pk__in=ids).select_related("course"))
            require(len(selected) == len(ids), "No encontramos las líneas.", "not_found", 404)
            # Cancelar el padre incluye sus componentes; un componente solo no cambia el combo vendido.
            valid(all(not line.parent_id or line.parent_id in ids for line in selected), "Cancela el combo completo.")
            selected = list(order.lines.filter(Q(pk__in=ids) | Q(parent_id__in=ids)).select_related("course"))
            s.editable(order, selected)
            require(not any(line.points_cost for line in selected), 'El canje se libera al cancelar el pedido.', 'not_editable', 409)
            order.lines.filter(pk__in=[line.pk for line in selected]).delete()
            order.courses.filter(lines__isnull=True).delete()
            if not order.lines.filter(cancelled=False, points_cost=0).exists():
                order.state = "cancelled"
                order.billing = False
                order.billing_at = None
                for line in order.lines.all():
                    line.cancelled = True
                    line.save(update_fields=["cancelled"])
                from loyalty.services import release_points
                release_points(order)
            s.recalculate(order)
            s.event(order.restaurant, "orders", "kitchen", "tables")
        return Response(order_response(order))

    def put(self, request, pk):
        require(self.action == "tip", "La ruta no existe.", "not_found", 404)
        permit(self.account, "charge_orders")
        data = payload(request.data, ("amount",), ("amount",))
        with s.writing(self.org):
            order = s.get_order(self.account, pk, True)
            require(order.state == "draft", "El pedido ya terminó.", "not_editable", 409)
            amount = s.money(data["amount"])
            require(order.total - order.tip + amount >= order.paid, "La propina dejaría un sobrepago.", "overpaid", 400)
            order.tip = amount
            s.recalculate(order)
            s.event(order.restaurant, "orders")
        return Response(order_response(order))


def line_ids(value):
    valid(isinstance(value, list) and 1 <= len(value) <= 500 and all(type(i) is int and i > 0 for i in value))
    valid(len(value) == len(set(value)))
    return value


def get_shift(account, pk, lock=False):
    qs = CashShift.objects.select_for_update(of=("self",)) if lock else CashShift.objects
    shift = (
        qs.filter(pk=pk, restaurant__organization=account.organization)
        .select_related("restaurant__organization", "opened_by", "closed_by")
        .first()
    )
    require(shift, "No encontramos el turno.", "not_found", 404)
    restaurant_for(account, shift.restaurant_id)
    return shift


class ShiftsView(PosView):
    mode = "list"

    def get(self, request, pk=None):
        if self.mode == "closing":
            permit(self.account, "sales")
            return Response(closing(get_shift(self.account, pk)))
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        qs = CashShift.objects.filter(restaurant=restaurant).select_related(
            "restaurant__organization", "opened_by", "closed_by"
        )
        if self.mode == "open":
            shift = qs.filter(state="open").first()
            return Response({"shift": shift_dict(shift) if shift else None})
        permit(self.account, "sales")
        result = []
        for shift in qs.order_by("-id")[: limit(request, 12)]:
            report = closing(shift)
            result.append(
                {
                    **fields(shift, "id state opened_at closed_at"),
                    "opened_by": person(shift.opened_by),
                    "closed_by": person(shift.closed_by),
                    "total": report["orders_total"],
                    "orders": report["orders_count"],
                }
            )
        return Response({"shifts": result})

    def post(self, request, pk=None):
        if self.mode == "moves":
            permit(self.account, "sales")
        else:
            require(self.account.role in ("owner", "admin", "cashier"))
        with s.writing(self.org):
            if pk is None:
                data = payload(
                    request.data, ("restaurant_id", "opening_cash", "notes"), ("restaurant_id", "opening_cash", "notes")
                )
                restaurant = restaurant_for(self.account, data["restaurant_id"])
                from tenancy.models import Restaurant

                Restaurant.objects.select_for_update().get(pk=restaurant.pk)
                require(
                    not CashShift.objects.filter(restaurant=restaurant, state="open").exists(),
                    "Ya hay una caja abierta.",
                    "shift_open",
                    409,
                )
                shift = CashShift.objects.create(
                    restaurant=restaurant,
                    opened_by=self.account,
                    opening_cash=s.money(data["opening_cash"]),
                    opening_notes=s.text(data["notes"], 2000),
                )
                s.event(restaurant, "cash")
            else:
                shift = get_shift(self.account, pk, True)
                require(shift.state == "open", "La caja ya está cerrada.", "shift_closed", 409)
                if self.mode == "close":
                    data = payload(request.data, ("counted_cash", "notes"), ("counted_cash",))
                    close(shift, self.account, data)
                elif self.mode == "moves":
                    data = payload(request.data, ("kind", "amount", "reason"), ("kind", "amount", "reason"))
                    valid(data["kind"] in ("in", "out"))
                    move = CashMove.objects.create(
                        shift=shift,
                        kind=data["kind"],
                        amount=s.money(data["amount"], True),
                        reason=s.text(data["reason"], 200, True),
                        account=self.account,
                    )
                    s.event(shift.restaurant, "cash")
                    return Response(
                        {
                            "move": fields(move, "id kind amount reason created_at"),
                            "expected_cash": closing(shift)["expected_cash"],
                        }
                    )
        return Response({"shift": shift_dict(shift)}, status=201 if pk is None else 200)


class ClosingsView(PosView):
    def get(self, request):
        manager(self.account)
        restaurants = restaurants_for(self.account)
        ids = request.query_params.get("restaurant_ids")
        if ids:
            valid(all(i.isdecimal() for i in ids.split(",")))
            wanted = [int(i) for i in ids.split(",")]
            for pk in wanted:
                restaurant_for(self.account, pk)
            restaurants = restaurants.filter(pk__in=wanted)
        start, end = s.period(self.org, request.query_params.get("from"), request.query_params.get("to"))
        qs = CashShift.objects.filter(
            restaurant__in=restaurants, state="closed", closed_at__gte=start, closed_at__lt=end
        ).select_related("restaurant", "closed_by")
        if request.query_params.get("only_differences") == "1":
            qs = qs.exclude(difference=0)
        return Response(
            {
                "closings": [
                    {
                        "shift_id": c.pk,
                        "restaurant_id": c.restaurant_id,
                        "restaurant_name": c.restaurant.name,
                        "closed_at": fields(c, "closed_at")["closed_at"],
                        "closed_by": person(c.closed_by),
                        "expected": float(c.expected_cash),
                        "counted": float(c.counted_cash),
                        "difference": float(c.difference),
                        "notes": c.closing_notes,
                        "over_tolerance": abs(c.difference) > self.org.cash_tolerance,
                    }
                    for c in qs.order_by("-closed_at", "-id")
                ],
                "tolerance": float(self.org.cash_tolerance),
            }
        )


class PaymentMethodsView(PosView):
    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        return Response(
            {"methods": [fields(m, "id name type") for m in s.methods_for(self.org, restaurant).order_by("id")]}
        )

    def save(self, request, pk=None):
        owner(self.account)
        data = payload(request.data, ("name", "type", "restaurant_ids"), ("name", "type") if pk is None else ())
        with s.writing(self.org):
            method = reference(PaymentMethod, self.org, pk) if pk else PaymentMethod(organization=self.org)
            if "name" in data:
                method.name = s.text(data["name"], 100, True)
            if "type" in data:
                valid(data["type"] in ("cash", "bank", "pay_later"))
                require(
                    not pk or method.type == data["type"] or not method.payments.exists(),
                    "No cambies el tipo de un método con pagos.",
                    "not_editable",
                    409,
                )
                method.type = data["type"]
            method.save()
            if "restaurant_ids" in data:
                ids = data["restaurant_ids"]
                valid(isinstance(ids, list) and all(type(i) is int for i in ids))
                require(
                    not method.payments.exists(), "No cambies las sedes de un método con pagos.", "not_editable", 409
                )
                method.restaurants.set([restaurant_for(self.account, i) for i in ids])
            for restaurant in restaurants_for(self.account):
                s.event(restaurant, "cash")
        return Response({"method": fields(method, "id name type")}, status=200 if pk else 201)

    def post(self, request):
        return self.save(request)

    def patch(self, request, pk):
        return self.save(request, pk)

    def delete(self, request, pk):
        owner(self.account)
        with s.writing(self.org):
            method = reference(PaymentMethod, self.org, pk)
            if method.payments.exists():
                method.active = False
                method.save()
                result = "archived"
            else:
                method.delete()
                result = "removed"
            for restaurant in restaurants_for(self.account):
                s.event(restaurant, "cash")
        return Response({"result": result})
