"""Validación del plano, imágenes y reparto de meseros por zona."""

import math
import re

from django.db.models import Q
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from accounts.models import Account
from catalog.images import convert, encoded
from catalog.services import valid
from sales.models import CashShift, Order
from sales.reading import fields
from sales.services import event, text
from tenancy.http import Problem, payload, require

from .models import Floor, Table

RECT = ("x", "y", "width", "height")
DECOR = (
    "stove",
    "range",
    "fridge",
    "sink",
    "counter",
    "island",
    "bar",
    "stool",
    "register",
    "sofa",
    "plant",
    "toilet",
    "washbasin",
    "door",
    "window",
    "stairs",
    "spiral",
    "column",
)


def table_dict(table, reserved=None):
    return {
        **fields(table, "id number seats x y width height shape color zone_id active call call_at token"),
        "reserved_at": reserved,
    }


def floor_dict(floor, reserved=None):
    if reserved is None:
        from reservations.reading import reserved_at
        reserved = reserved_at(floor.restaurant.organization, list(floor.tables.all()))
    tables = [table_dict(t, reserved.get(t.pk)) for t in floor.tables.all() if t.active]
    return {
        **fields(floor, "id name sequence active revision"),
        "has_background": bool(floor.background),
        "table_count": len(tables),
        "tables": tables,
    }


def document(floor):
    from reservations.reading import reserved_at
    tables = list(floor.tables.filter(active=True).order_by('id'))
    reserved = reserved_at(floor.restaurant.organization, tables)
    return {
        **fields(floor, "id name revision"),
        **{k: floor.plan.get(k, []) for k in ("walls", "zones", "decor")},
        "images": [{k: v for k, v in item.items() if k != "file"} for item in floor.plan.get("images", [])],
        "background": bool(floor.background),
        "background_size": floor.plan.get("background_size"),
        "tables": [
            {**fields(t, "id number seats x y width height"), "key": str(t.pk), "zone": t.zone_id, "reserved_at": reserved.get(t.pk)}
            for t in tables
        ],
    }


def closed(restaurant):
    require(
        not CashShift.objects.filter(restaurant=restaurant, state="open").exists(),
        "Cierra la caja antes de modificar el plano.",
        "shift_open",
        409,
    )


def another_floor(floor):
    require(
        Floor.objects.filter(restaurant=floor.restaurant, active=True).exclude(pk=floor.pk).exists(),
        "Deja al menos un piso activo.",
        "last_floor",
        409,
    )


def no_drafts(tables):
    from reservations.models import Reservation
    from reservations.schedule import local_now
    tables = list(tables)
    if tables:
        org = tables[0].floor.restaurant.organization
        now = local_now(org)
        require(not Reservation.objects.filter(tables__in=tables, state='confirmed').filter(
            Q(date__gt=now.date()) | Q(date=now.date(), time_end__gt=now.hour + now.minute / 60)).exists(),
            'Hay mesas con reservas confirmadas pendientes.', 'table_reserved', 409)
    require(
        not Order.objects.filter(table__in=tables, state="draft").exists(),
        "Hay mesas con pedidos pendientes.",
        "table_in_use",
        409,
    )


def rectangle(item, grid=False):
    valid(isinstance(item, dict))
    for key in RECT:
        value = item.get(key)
        valid(
            type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 20000,
            "Las dimensiones del plano no son válidas.",
        )
        if grid:
            valid(value % 20 == 0, "Las mesas deben ajustarse a la cuadrícula de 20 px.")
    valid(
        item["width"] >= 20
        and item["height"] >= 20
        and item["x"] + item["width"] <= 20000
        and item["y"] + item["height"] <= 20000
    )


def overlap(a, b):
    return (
        a["x"] < b["x"] + b["width"] + 16
        and a["x"] + a["width"] + 16 > b["x"]
        and a["y"] < b["y"] + b["height"] + 16
        and a["y"] + a["height"] + 16 > b["y"]
    )


def store(floor, data):
    import uuid

    result = encoded(convert(data))
    # La conversión de catálogo devuelve bytes WebP; no se aceptan rutas del cliente.
    return default_storage.save(
        f"floors/{floor.restaurant.organization_id}/{floor.pk}/{uuid.uuid4().hex}.webp", ContentFile(result)
    )


def save_plan(floor, raw):
    closed(floor.restaurant)
    require(isinstance(raw, dict), "El plano no es válido.", "invalid_plan", 400)
    require(
        type(raw.get("revision")) is int and raw["revision"] == floor.revision,
        "Otra persona cambió el plano.",
        "stale_plan",
        409,
    )
    try:
        data = payload(
            raw,
            ("id", "name", "revision", "tables", "walls", "zones", "decor", "images", "background", "background_size"),
            ("name", "revision", "tables", "walls", "zones"),
        )
        valid(data.get("id", floor.pk) == floor.pk)
        name = text(data["name"], 100, True)
        lists = {key: data.get(key, floor.plan.get(key, [])) for key in ("tables", "walls", "zones", "decor", "images")}
        valid(all(isinstance(v, list) for v in lists.values()) and sum(map(len, lists.values())) <= 500)
        valid(len(lists["images"]) <= 8)
        for key, items in lists.items():
            seen = set()
            for item in items:
                rectangle(item, grid=key == "tables")
                if key != "tables":
                    uid = text(item.get("id"), 80, True)
                    valid(uid not in seen)
                    seen.add(uid)
                if key == "zones":
                    text(item.get("name"), 80, True)
                    valid(bool(re.fullmatch(r"#[0-9a-fA-F]{6}", str(item.get("color", "")))))
                if key == "walls" and "color" in item:
                    valid(bool(re.fullmatch(r"#[0-9a-fA-F]{6}", str(item["color"]))))
                if key == "decor":
                    valid(
                        item.get("asset") in DECOR
                        and type(item.get("rotation", 0)) is int
                        and item.get("rotation", 0) in (0, 90, 180, 270)
                    )
        zones = {z["id"] for z in lists["zones"]}
        old = {t.pk: t for t in floor.tables.all()}
        seen = set()
        numbers = set()
        keys = set()
        for i, item in enumerate(lists["tables"]):
            valid(type(item.get("number")) is int and 1 <= item["number"] <= 9999 and item["number"] not in numbers)
            valid(type(item.get("seats")) is int and 1 <= item["seats"] <= 100)
            valid(isinstance(item.get("key"), str) and item["key"] and item["key"] not in keys)
            keys.add(item["key"])
            numbers.add(item["number"])
            pk = item.get("id")
            valid(pk is None or type(pk) is int and pk in old and pk not in seen)
            if pk:
                seen.add(pk)
            valid(item.get("zone", "") == "" or item.get("zone") in zones)
            valid(
                not any(overlap(item, other) for other in lists["tables"][:i] + lists["walls"]),
                "Separa las mesas entre sí y de las paredes al menos 16 px.",
            )
        removed = [t for pk, t in old.items() if pk not in seen and t.active]
        no_drafts(removed)
        background_size = data.get("background_size", floor.plan.get("background_size"))
        if background_size is not None:
            valid(isinstance(background_size, dict))
            background_size = {"x": 0, "y": 0, **background_size}
            rectangle(background_size)
        previous = {i["id"]: i for i in floor.plan.get("images", [])}
        images = []
        for item in lists["images"]:
            entry = {k: item[k] for k in ("id", *RECT)}
            if "data" in item:
                entry["file"] = store(floor, item["data"])
            else:
                valid(item["id"] in previous, "La imagen no pertenece a este piso.")
                entry["file"] = previous[item["id"]]["file"]
            images.append(entry)
        background = data.get("background", bool(floor.background))
        if isinstance(background, str):
            floor.background = store(floor, background)
        elif background is False or background is None:
            floor.background = ""
        else:
            valid(background is True and bool(floor.background))
        # Los números también son únicos entre mesas archivadas con historial.
        preserved = [table for pk, table in old.items() if pk not in seen and (table.orders.exists() or table.reservations.exists())]
        valid(
            not numbers & {table.number for table in preserved},
            "Un número pertenece a una mesa archivada; reutiliza su id o elige otro número.",
        )
        for table in old.values():
            if table.pk not in seen and not table.orders.exists() and not table.reservations.exists():
                table.delete()
        floor.tables.filter(pk__in=[table.pk for table in preserved]).update(active=False)
        # Números temporales libres permiten intercambiar dos mesas sin violar la unicidad.
        occupied = numbers | {table.number for table in old.values()}
        temporary = iter(number for number in range(1, 10000) if number not in occupied)
        for pk in seen:
            Table.objects.filter(pk=pk).update(number=next(temporary))
        for item in lists["tables"]:
            table = old[item["id"]] if item.get("id") else Table(floor=floor)
            for key in ("number", "seats", *RECT):
                setattr(table, key, item[key])
            table.zone_id = item.get("zone", "")
            table.active = True
            table.save()
        floor.name = name
        floor.revision += 1
        floor.plan = {
            **{k: lists[k] for k in ("walls", "zones", "decor")},
            "images": images,
            "background_size": background_size,
        }
        floor.zone_staff = {k: v for k, v in floor.zone_staff.items() if k in zones}
        floor.save()
        event(floor.restaurant, "tables")
        return document(floor)
    except Problem as exc:
        if exc.status == 400:
            raise Problem("invalid_plan", exc.body["message"]) from exc
        raise


def assignments(floor, value):
    valid(isinstance(value, dict) and set(value) <= {z["id"] for z in floor.plan.get("zones", [])})
    for ids in value.values():
        valid(isinstance(ids, list) and all(type(i) is int for i in ids) and len(ids) == len(set(ids)))
        valid(
            Account.objects.filter(
                pk__in=ids,
                organization=floor.restaurant.organization,
                restaurants=floor.restaurant,
                active=True,
                role="waiter",
            )
            .distinct()
            .count()
            == len(ids),
            "Selecciona meseros activos de este restaurante.",
        )
    return {k: v for k, v in value.items() if v}


def zone_staff(floor, shift=None):
    own = shift.zone_staff if shift else {}
    key = str(floor.pk)
    people = Account.objects.filter(
        organization=floor.restaurant.organization, restaurants=floor.restaurant, active=True, role="waiter"
    ).distinct()
    return {
        "assignments": own.get(key, floor.zone_staff),
        "source": "shift" if key in own else "plan",
        "people": [fields(p, "id name role") for p in people],
    }
