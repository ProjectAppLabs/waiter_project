"""Cocina a dos manos: preparar, sacar al pase y entregar."""

from django.db.models import Q
from django.utils import timezone

from accounts.models import Account
from notifications.models import Notification
from sales.models import Course
from sales.services import event
from tenancy.http import require


def notify_ready(line):
    order = line.order
    people = Account.objects.filter(organization=order.organization, active=True, restaurants=order.restaurant)
    waiters = people.filter(role="waiter")
    if order.table_id:
        floor = order.table.floor
        assignments = order.shift.zone_staff.get(str(floor.pk), floor.zone_staff)
        if assignments:
            waiters = waiters.filter(pk__in=assignments.get(order.table.zone_id, []))
    recipients = people.filter(Q(role="admin") | Q(pk__in=waiters.values("pk"))).distinct()
    where = f"Mesa {order.table.number}" if order.table_id else order.number
    Notification.objects.bulk_create(
        [
            Notification(
                organization=order.organization,
                restaurant=order.restaurant,
                recipient=p,
                kind="kitchen",
                title="Plato listo para servir",
                body=f"{line.name} · {where}",
                res_model="sales.Order",
                res_id=order.pk,
                action="serve",
            )
            for p in recipients
        ]
    )
    event(order.restaurant, "notify")


def transition(lines, action, partial=False):
    now = timezone.now()
    require(
        lines and all(line.course_id and not line.cancelled and line.order.state != "cancelled" for line in lines),
        "La comanda ya no está disponible.",
        "not_editable",
        409,
    )
    if action == "serve":
        if partial:
            lines = [line for line in lines if line.ready_at and not line.served_at]
            require(lines, "Cocina todavía no ha marcado ningún plato como listo.", "not_ready", 400)
        else:
            require(
                all(line.ready_at for line in lines),
                "Cocina todavía no ha marcado estos platos como listos.",
                "not_ready",
                400,
            )
    courses = {line.course_id for line in lines}
    if action in ("start", "ready"):
        Course.objects.filter(pk__in=courses, preparation_at__isnull=True).update(preparation_at=now)
    for line in lines:
        if action == "ready" and not line.ready_at:
            line.ready_at = now
            line.save(update_fields=["ready_at"])
            notify_ready(line)
        elif action == "serve" and not line.served_at:
            line.served_at = now
            line.save(update_fields=["served_at"])
    for course in Course.objects.filter(pk__in=courses):
        active = course.lines.filter(cancelled=False)
        if active.exists():
            if not active.filter(ready_at__isnull=True).exists() and not course.ready_at:
                course.ready_at = now
            if not active.filter(served_at__isnull=True).exists() and not course.served_at:
                course.served_at = now
            course.save()
    restaurants = {line.order.restaurant_id: line.order.restaurant for line in lines}
    for restaurant in restaurants.values():
        event(restaurant, "orders", "kitchen")
    return lines
