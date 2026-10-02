"""Serializadores compatibles con Odoo; las colecciones se precargan por lotes."""

import math

from django.conf import settings
from django.db.models import Prefetch

from tables.models import Floor, Table
from tenancy.http import model_dict

from .models import Reservation
from .schedule import hour_label, local_now, ranges_for, schedule, slots

ACTIVE = ("confirmed", "seated")


def reservations():
    return (
        Reservation.objects.select_related("organization", "restaurant", "main_table__floor", "preorder")
        .prefetch_related(
            Prefetch(
                "tables",
                queryset=Table.objects.select_related("floor").order_by("floor__sequence", "floor_id", "number", "id"),
            ),
            "preorder__lines",
        )
        .order_by("date", "time_start", "id")
    )


def table_dict(table):
    return {
        "id": table.pk,
        "table_number": table.number,
        "name": str(table.number),
        "seats": table.seats,
        "floor_id": table.floor_id,
        "floor_name": table.floor.name,
        "shape": table.shape,
    }


def table_list(row):
    return [row.main_table, *[t for t in row.tables.all() if t.pk != row.main_table_id]]


def card(row):
    tables = table_list(row)
    return {
        **model_dict(
            row,
            ("id", "customer_name", "people", "baby_chair", "state", "date", "time_start", "time_end", "deposit_state"),
        ),
        "name": row.code,
        "label": hour_label(row.time_start),
        "prep_minutes": str(row.prep_minutes),
        "hold_start": row.hold_start,
        "hold_label": hour_label(row.hold_start),
        "time_label": f"{hour_label(row.time_start)} – {hour_label(row.time_end)}",
        "table_id": row.main_table_id,
        "table_number": row.main_table.number,
        "table_ids": [t.pk for t in tables],
        "table_numbers": [t.number for t in tables],
        "seats": sum(t.seats for t in tables),
        "config_id": row.restaurant_id,
        "floor_id": row.main_table.floor_id,
        "floor_name": row.main_table.floor.name,
    }


def pay_url(row):
    base = settings.DINER_PUBLIC_URL.rstrip("/")
    return f"{base}/{row.organization.slug}/{row.restaurant.slug}/reserva/{row.pay_token}" if base else ""


def detail(row):
    order = row.preorder
    return {
        **card(row),
        **model_dict(
            row,
            (
                "customer_email",
                "customer_phone",
                "notes",
                "deposit_amount",
                "deposit_state",
                "deposit_reference",
                "pay_token",
            ),
        ),
        "deposit_paid_at": model_dict(row, ("deposit_paid_at",))["deposit_paid_at"] or "",
        "table": table_dict(row.main_table),
        "tables": [table_dict(t) for t in table_list(row)],
        "preorder_id": row.preorder_id or False,
        "preorder_state": ("cancel" if order.state == "cancelled" else order.state) if order else False,
        "amount_total": float(order.total) if order else 0,
        "currency_id": False,
        "pay_url": pay_url(row),
        "restaurant_name": row.organization.name,
        "lines": [
            {
                "id": line.pk,
                "product_id": line.product_id,
                "product_tmpl_id": line.product_id,
                "name": line.name,
                "qty": float(line.qty),
                "price_unit": float(line.unit_price),
                "price_subtotal": float(line.subtotal),
                "price_subtotal_incl": float(line.total),
                "note": line.note,
            }
            for line in order.lines.all()
        ]
        if order
        else [],
    }


def tables_for(restaurant):
    return (
        Table.objects.filter(floor__restaurant=restaurant, floor__active=True, active=True)
        .select_related("floor")
        .order_by("floor__sequence", "floor_id", "number", "id")
    )


def clashes(restaurant, day, start, end, prep, exclude=None):
    hold = max(0, start - prep / 60)
    return [
        r
        for r in reservations()
        .filter(restaurant=restaurant, date=day, state__in=ACTIVE, time_end__gt=hold)
        .exclude(pk=exclude)
        if r.hold_start < end
    ]


def available_tables(restaurant, day, start, people, prep=30, exclude=None, include_unavailable=False):
    by_table = {}
    for r in clashes(restaurant, day, start, start + 1.5, prep, exclude):
        for table in r.tables.all():
            by_table.setdefault(table.pk, r)
    result = []
    for table in tables_for(restaurant):
        clash = by_table.get(table.pk)
        status = "reserved" if clash else "unavailable" if table.seats < people else "available"
        if status == "available" or include_unavailable:
            result.append(
                {
                    **table_dict(table),
                    "status": status,
                    "available": status == "available",
                    "reserved_at": hour_label(clash.time_start) if clash else False,
                    "reservation": card(clash) if clash else False,
                }
            )
    return result


def timeline(org, restaurant, day, floor_id=None):
    floors = list(Floor.objects.filter(restaurant=restaurant, active=True).order_by("sequence", "id"))
    tables = list(tables_for(restaurant).filter(floor_id=floor_id) if floor_id else tables_for(restaurant))
    rows = list(reservations().filter(restaurant=restaurant, date=day, state__in=ACTIVE, tables__in=tables).distinct())
    by_table = {}
    for row in rows:
        value = card(row)
        for table in row.tables.all():
            by_table.setdefault(table.pk, []).append(value)
    data = schedule(restaurant)
    ranges = ranges_for(data, day) or [r for v in data["weekly"].values() for r in v] or [[10, 22]]
    first, last = min(r[0] for r in ranges), max(r[1] for r in ranges)
    if rows:
        first = min(first, math.floor(min(r.time_start for r in rows) * 2) / 2)
        last = max(last, math.ceil(max(r.time_end for r in rows) * 2) / 2)
    return {
        "date": day.isoformat(),
        "slots": slots(org, restaurant, day, (first, last), data),
        "floors": [model_dict(f, ("id", "name")) for f in floors],
        "tables": [{**table_dict(t), "reservations": by_table.get(t.pk, [])} for t in tables],
    }


def reserved_at(org, tables):
    ids = [t.pk for t in tables]
    now = local_now(org)
    hour = now.hour + now.minute / 60 + now.second / 3600
    result = {}
    for row in (
        reservations()
        .filter(organization=org, tables__in=ids, state="confirmed", date=now.date(), time_end__gt=hour)
        .distinct()
    ):
        if row.hold_start <= hour:
            value = card(row)
            for table in row.tables.all():
                if table.pk in ids:
                    result.setdefault(table.pk, value)
    return result
