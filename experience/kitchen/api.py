"""Lecturas y transiciones de cocina sobre los modelos de ventas."""

from django.db.models import Prefetch
from rest_framework.response import Response

from catalog.api import PosView
from catalog.services import restaurant_for
from sales.api import line_ids
from sales.models import Course, Order, OrderLine
from sales.policy import permit
from sales.reading import course_dict, fields, line_dict, person
from sales.services import writing
from tenancy.http import json_value, payload, require

from .services import transition


def kitchen_lines():
    return OrderLine.objects.select_related(
        "course", "order__restaurant", "order__organization", "order__table__floor", "order__shift"
    )


class TicketsView(PosView):
    def get(self, request):
        # El contrato permite leer cocina a cualquier sesión; las transiciones exigen kitchen.
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        qs = (
            # Como en Odoo (una sesión), cocina ve solo lo del turno abierto: los históricos y los migrados no reaparecen.
            Course.objects.filter(order__restaurant=restaurant, order__shift__state="open")
            .exclude(order__state="cancelled")
            .select_related("order__table", "order__created_by")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=OrderLine.objects.filter(cancelled=False)
                    .select_related("product")
                    .prefetch_related("product__categories"),
                )
            )
        )
        tickets = []
        for course in qs.filter(served_at__isnull=True).order_by("fired_at", "id"):
            order = course.order
            tickets.append(
                {
                    **fields(course, "id fired_at preparation_at ready_at"),
                    "order_id": order.pk,
                    "number": order.number,
                    "table_number": order.table.number if order.table else None,
                    "service": order.service,
                    "waiter": person(order.created_by),
                    "note": order.note,
                    "lines": [
                        {
                            **fields(line, "id name qty note ready_at served_at"),
                            "station": next((c.station for c in line.product.categories.all() if c.station), ""),
                            # Las opciones elegidas (tamaño, adiciones) van en la pantalla y en la comanda impresa.
                            "options": [option["name"] for option in line.options or []],
                        }
                        for line in course.lines.all()
                    ],
                }
            )
        # Los terminados del turno solo aportan sus dos horas (el tiempo medio de preparación): sin pedido, mesa,
        # mesero, líneas, productos ni categorías, que con el turno avanzado son miles de filas por lectura.
        finished = (
            Course.objects.filter(order__restaurant=restaurant, order__shift__state="open", ready_at__isnull=False)
            .exclude(order__state="cancelled")
            .values_list("fired_at", "ready_at")
        )
        completed = [{"fired_at": json_value(fired), "ready_at": json_value(ready)} for fired, ready in finished]
        return Response({"tickets": tickets, "completed": completed})


class CourseView(PosView):
    action = "start"

    def post(self, request, pk):
        permit(self.account, "serve_orders" if self.action == "serve" else "kitchen")
        payload(request.data, ())
        with writing(self.org):
            course = Course.objects.filter(pk=pk, order__organization=self.org).first()
            require(course, "No encontramos la comanda.", "not_found", 404)
            restaurant_for(self.account, course.order.restaurant_id)
            Order.objects.select_for_update().get(pk=course.order_id)
            lines = list(kitchen_lines().filter(course=course, cancelled=False))
            transition(lines, self.action, partial=self.action == "serve")
            course.refresh_from_db()
        return Response({"course": course_dict(course)})


class LinesView(PosView):
    action = "ready"

    def post(self, request):
        permit(self.account, "serve_orders" if self.action == "serve" else "kitchen")
        data = payload(request.data, ("line_ids",), ("line_ids",))
        ids = line_ids(data["line_ids"])
        with writing(self.org):
            lines = list(kitchen_lines().filter(pk__in=ids, order__organization=self.org).order_by("order_id", "id"))
            require(len(lines) == len(ids), "No encontramos las líneas.", "not_found", 404)
            for rid in {line.order.restaurant_id for line in lines}:
                restaurant_for(self.account, rid)
            list(Order.objects.select_for_update().filter(pk__in={line.order_id for line in lines}).order_by("pk"))
            transition(lines, self.action)
        return Response({"lines": [line_dict(line) for line in lines]})
