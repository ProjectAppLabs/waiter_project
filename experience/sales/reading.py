"""Serialización por lotes y cifras monetarias redondeadas al centavo."""

from decimal import Decimal

from django.db.models import Prefetch

from tenancy.http import model_dict

from .models import Course, Order, OrderLine, Payment
from .services import rounded


def fields(obj, names):
    result = model_dict(obj, names.split())
    for key in result:
        value = getattr(obj, key)
        if isinstance(value, Decimal) and key != "qty":
            result[key] = float(rounded(value))
    return result


def person(obj):
    return fields(obj, "id name") if obj else None


def orders():
    return Order.objects.select_related("table", "created_by").prefetch_related(
        Prefetch("lines", queryset=OrderLine.objects.order_by("id")),
        Prefetch("courses", queryset=Course.objects.order_by("index")),
        Prefetch("payments", queryset=Payment.objects.select_related("method").order_by("id")),
    )


def line_dict(line):
    return fields(
        line,
        "id uuid product_id name qty unit_price subtotal total note options parent_id discount_pct course_id ready_at served_at cancelled",
    )


def course_dict(course):
    return fields(course, "id index fired_at preparation_at ready_at served_at")


def order_dict(order):
    return {
        **fields(
            order,
            "id uuid number tracking service state origin channel table_id guests baby_chair customer_name delivery_address delivery_phone note billing created_at paid_at subtotal tax tip total paid change",
        ),
        "table_number": order.table.number if order.table else None,
        "waiter": person(order.created_by),
        "lines": [line_dict(line) for line in order.lines.all()],
        "courses": [course_dict(c) for c in order.courses.all()],
        "payments": [
            {**fields(p, "id method_id amount received reference created_at"), "method": p.method.name}
            for p in order.payments.all()
        ],
    }


def order_response(order):
    return {"order": order_dict(orders().get(pk=order.pk))}
