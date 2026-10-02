"""Reservas y anticipos serializados por organización, sede y fila."""

from uuid import uuid4

from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from catalog.services import number, reference, restaurant_for, valid, writing
from loyalty.models import Customer
from loyalty.promotions import iso_date
from sales import services as sales
from sales.models import CashShift
from tenancy.http import payload, require, save_valid

from .models import Reservation, ReservationLine
from .reading import ACTIVE, clashes, pay_url, table_list
from .schedule import hour_label, validate_booking


def prep_value(value):
    # El traductor heredado manda texto; se aceptan también los enteros del contrato.
    if isinstance(value, str) and value in ("0", "15", "30", "60", "120"):
        value = int(value)
    valid(type(value) is int and value in (0, 15, 30, 60, 120))
    return value


def time_value(value):
    result = float(number(value))
    valid(0 <= result <= 24 and result * 2 % 1 == 0, "Las horas se indican en medias horas, dentro del día.")
    return result


def selected_tables(row, ids):
    from tables.models import Table

    valid(
        isinstance(ids, list) and ids and all(type(i) is int and i > 0 for i in ids) and len(set(ids)) == len(ids),
        "Selecciona al menos una mesa, sin repetir.",
    )
    rows = {
        t.pk: t
        for t in Table.objects.select_for_update().filter(
            pk__in=ids, floor__restaurant=row.restaurant, floor__active=True, active=True
        )
    }
    valid(len(rows) == len(ids), "Todas las mesas deben pertenecer al restaurante de la reserva.")
    valid(sum(t.seats for t in rows.values()) >= row.people, "Las mesas no tienen capacidad para todas las personas.")
    for clash in clashes(row.restaurant, row.date, row.time_start, row.time_end, row.prep_minutes, row.pk):
        require(
            not set(rows) & {t.pk for t in clash.tables.all()},
            f"Una mesa ya está apartada por la reserva {clash.code}.",
            "reservation_overlap",
            409,
        )
    return [rows[i] for i in ids]


def preorder(row, account, lines):
    raw = []
    for item in lines:
        item = payload(item, ("product_id", "qty", "note"), ("product_id", "qty"))
        raw.append({**item, "uuid": str(uuid4())})
    # Los combos también pasan por el validador de ventas y sus componentes quedan materializados.
    from catalog.reading import CatalogData

    data = CatalogData(row.organization, [row.restaurant])
    for item in raw:
        product = data.products.get(item["product_id"]) if type(item["product_id"]) is int else None
        qty = number(item["qty"], positive=True)
        if product and product.diner_attributes.get("combo"):
            item["children"] = [
                {"uuid": str(uuid4()), "product_id": c["producto"], "qty": number(c["cantidad"]) * qty}
                for c in product.diner_attributes["combo"]
            ]
    order, _ = sales.create_order(
        account,
        {
            "restaurant_id": row.restaurant_id,
            "uuid": str(uuid4()),
            "service": "dine_in",
            "table_id": row.main_table_id,
            "guests": row.people,
            "baby_chair": row.baby_chair,
            "customer_name": row.customer_name,
            "note": row.notes[:500],
            "lines": raw,
            "fire": False,
        },
        allow_empty=True,
    )
    order.customer = row.customer
    order.save(update_fields=["customer"])
    row.preorder = order
    row.save(update_fields=["preorder"])
    ReservationLine.objects.bulk_create(
        [
            ReservationLine(
                reservation=row, product_id=line.product_id, qty=line.qty, note=line.note, price=line.unit_price
            )
            for line in order.lines.filter(parent__isnull=True)
        ]
    )
    return order


def create(account, raw):
    data = payload(
        raw,
        (
            "restaurant_id",
            "customer_id",
            "customer_name",
            "customer_email",
            "customer_phone",
            "people",
            "baby_chair",
            "notes",
            "date",
            "time_start",
            "time_end",
            "table_ids",
            "prep_minutes",
            "deposit_amount",
            "lines",
        ),
        ("restaurant_id", "customer_name", "people", "date", "time_start", "table_ids"),
    )
    restaurant = restaurant_for(account, data["restaurant_id"])
    with sales.writing(account.organization, restaurant):
        previous = Reservation.objects.filter(organization=account.organization).order_by("-id").first()
        sequence = int(previous.code[2:]) + 1 if previous else 1
        row = Reservation(
            organization=account.organization, restaurant=restaurant, code=f"RV{sequence:03d}", created_by=account
        )
        row.customer_name = sales.text(data["customer_name"], 120, True)
        row.customer_email = sales.text(data.get("customer_email", ""), 254)
        row.customer_phone = sales.text(data.get("customer_phone", ""), 40)
        row.notes = sales.text(data.get("notes", ""), 5000)
        row.people = sales.integer(data["people"])
        row.baby_chair = data.get("baby_chair", False)
        valid(type(row.baby_chair) is bool)
        row.date = iso_date(data["date"])
        row.time_start = time_value(data["time_start"])
        row.time_end = time_value(data.get("time_end", row.time_start + 1.5))
        valid(row.time_start < row.time_end <= 24)
        row.prep_minutes = prep_value(data.get("prep_minutes", 30))
        row.deposit_amount = sales.money(data.get("deposit_amount", 0))
        valid(row.deposit_amount <= 50000000)
        row.deposit_state = "pending" if row.deposit_amount else "none"
        if data.get("customer_id") is not None:
            row.customer = reference(Customer, account.organization, data["customer_id"], active=True)
        validate_booking(row)
        tables = selected_tables(row, data["table_ids"])
        row.main_table = tables[0]
        save_valid(row)
        row.tables.set(tables)
        lines = data.get("lines", [])
        valid(isinstance(lines, list) and len(lines) <= 500)
        if lines:
            preorder(row, account, lines)
        if row.customer_email:
            message = (
                f"Hola {row.customer_name}, tu reserva {row.code} en {restaurant.name} para {row.people} personas "
                f"el {row.date.isoformat()} a las {hour_label(row.time_start)} está confirmada."
            )
            if row.deposit_amount:
                message += f"\nAnticipo: $ {row.deposit_amount:g}. {pay_url(row)}"
            # Se envía tras confirmar la transacción: nunca anuncia una reserva revertida.
            transaction.on_commit(
                lambda: send_mail(
                    f"Confirmación de reserva {row.code}", message, None, [row.customer_email], using="waiter"
                ),
                robust=True,
            )
        sales.event(restaurant, "tables")
        return row


def set_tables(row, ids):
    require(row.state == "confirmed", "Solo puedes cambiar mesas de una reserva confirmada.", "not_editable", 409)
    tables = selected_tables(row, ids)
    row.tables.set(tables)
    row.main_table = tables[0]
    row.save(update_fields=["main_table"])
    if row.preorder_id and row.preorder.state == "draft":
        row.preorder.table = row.main_table
        row.preorder.save(update_fields=["table"])
    sales.event(row.restaurant, "tables", "orders")


def change_state(row, account, action):
    require(row.state in ACTIVE, "La reserva ya no está activa.", "not_editable", 409)
    if action == "seat":
        require(row.state == "confirmed", "Solo se puede sentar una reserva confirmada.", "not_editable", 409)
        shift = CashShift.objects.select_for_update().filter(restaurant=row.restaurant, state="open").first()
        require(shift, "Abre la caja antes de sentar la reserva.", "shift_closed", 409)
        if not row.preorder_id:
            preorder(row, account, [])
        elif row.preorder.state == "draft":
            row.preorder.shift, row.preorder.table = shift, row.main_table
            row.preorder.save(update_fields=["shift", "table"])
        row.state = "seated"
    else:
        row.state = {"cancel": "cancelled", "no-show": "no_show"}[action]
        if row.preorder_id and row.preorder.state == "draft":
            from loyalty.services import release_points

            row.preorder.state = "cancelled"
            row.preorder.billing, row.preorder.billing_at = False, None
            row.preorder.save()
            row.preorder.lines.update(cancelled=True)
            release_points(row.preorder)
    row.save(update_fields=["state"])
    sales.event(row.restaurant, "tables", "orders", "kitchen")


def set_deposit(row, amount):
    require(
        row.deposit_state != "paid" and row.state in ACTIVE,
        "El anticipo ya se pagó o la reserva no está activa.",
        "not_editable",
        409,
    )
    row.deposit_amount = sales.money(amount)
    valid(row.deposit_amount <= 50000000, "El anticipo admite hasta 50.000.000.")
    row.deposit_state = "pending" if row.deposit_amount else "none"
    row.save(update_fields=["deposit_amount", "deposit_state"])
    sales.event(row.restaurant, "tables")


def mark_paid(row, reference):
    require(row.deposit_state == "pending", "La reserva no tiene un anticipo pendiente.", "deposit_not_pending", 409)
    row.deposit_reference = sales.text(reference, 120, True)
    row.deposit_state, row.deposit_paid_at = "paid", timezone.now()
    row.save(update_fields=["deposit_reference", "deposit_state", "deposit_paid_at"])
    sales.event(row.restaurant, "tables")


def public_deposit(org, token):
    from .reading import reservations

    row = reservations().filter(organization=org, pay_token=token).first()
    if not row:
        return False
    return {
        "code": row.code,
        "customer": row.customer_name.split(" ")[0],
        "date": row.date.isoformat(),
        "time_label": hour_label(row.time_start),
        "people": row.people,
        "table_number": row.main_table.number,
        "table_numbers": [t.number for t in table_list(row)],
        "state": row.state,
        "deposit_state": row.deposit_state,
        "amount_in_cents": int(row.deposit_amount * 100),
    }


def deposit_paid(org, token, reference, amount):
    """El servicio recibe COP, como el contrato HTTP; la vista pública conserva amount_in_cents."""
    with writing(org, operational=True):
        row = Reservation.objects.select_for_update().filter(organization=org, pay_token=token).first()
        if not row or not isinstance(reference, str) or not reference or len(reference) > 120:
            return {"paid": False, "reason": "unknown"}
        amount = sales.money(amount)
        if row.deposit_state == "paid":
            return {
                "paid": row.deposit_reference == reference and row.deposit_amount == amount,
                "reason": "already_paid",
            }
        if row.deposit_state != "pending" or row.deposit_amount != amount:
            return {"paid": False, "reason": "amount_changed"}
        mark_paid(row, reference)
        return {"paid": True, "reason": "paid"}
