"""Horario semanal, excepciones y reglas en la zona horaria de la organización."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from catalog.services import number, valid
from loyalty.promotions import iso_date
from sales.services import integer, text
from tenancy.http import payload

from .models import ReservationSchedule, rules, weekly

# Duración que toma una reserva creada sin hora de salida (services.create); mesas valida la misma.
DEFAULT_LENGTH = 1.5


def local_now(org):
    return timezone.now().astimezone(ZoneInfo(org.timezone))


def hour_label(hour):
    hours, minutes = divmod(round(hour * 60), 60)
    return f"{hours:02d}:{minutes:02d}"


def clean_ranges(raw):
    valid(isinstance(raw, list) and len(raw) <= 4, "Cada día admite hasta cuatro franjas.")
    clean, previous = [], -1
    for item in raw:
        valid(isinstance(item, list) and len(item) == 2)
        start, end = [float(number(v)) for v in item]
        valid(
            0 <= start < end <= 24 and start >= previous and start * 2 % 1 == 0 and end * 2 % 1 == 0,
            "Las franjas van en orden, sin solaparse, dentro del día y en medias horas.",
        )
        clean.append([start, end])
        previous = end
    return clean


def clean_schedule(raw):
    raw = payload(raw, ("weekly", "overrides", "rules"), ("weekly",))
    week = raw["weekly"]
    valid(isinstance(week, dict) and set(week) == {str(i) for i in range(7)}, "Completa los siete días de la semana.")
    overrides = raw.get("overrides", [])
    valid(isinstance(overrides, list) and len(overrides) <= 366)
    result, seen = [], set()
    for item in overrides:
        item = payload(item, ("date", "ranges", "note"), ("date",))
        day = iso_date(item["date"]).isoformat()
        valid(day not in seen, "No repitas fechas especiales.")
        seen.add(day)
        result.append(
            {"date": day, "ranges": clean_ranges(item.get("ranges", [])), "note": text(item.get("note", ""), 80)}
        )
    rule = {**rules(), **payload(raw.get("rules", {}), ("minNotice", "maxDays"))}
    integer(rule["minNotice"], low=0, high=10080)
    integer(rule["maxDays"], low=0, high=730)
    valid(rule["minNotice"] % 30 == 0, "La antelación se fija en medias horas.")
    return {
        "weekly": {day: clean_ranges(value) for day, value in week.items()},
        "overrides": sorted(result, key=lambda r: r["date"]),
        "rules": rule,
    }


def schedule(restaurant):
    row = ReservationSchedule.objects.filter(restaurant=restaurant).first()
    return (
        {"weekly": row.weekly, "overrides": row.overrides, "rules": row.rules}
        if row
        else {"weekly": weekly(), "overrides": [], "rules": rules()}
    )


def ranges_for(data, day):
    return next(
        (r["ranges"] for r in data["overrides"] if r["date"] == day.isoformat()), data["weekly"][str(day.weekday())]
    )


def validate_booking(reservation):
    data = schedule(reservation.restaurant)
    valid(
        any(a <= reservation.time_start < b for a, b in ranges_for(data, reservation.date)),
        "La hora de la reserva está fuera del horario del restaurante.",
    )
    now = local_now(reservation.organization)
    start = datetime.combine(reservation.date, time.min, now.tzinfo) + timedelta(hours=reservation.time_start)
    rule = data["rules"]
    valid(
        not rule["minNotice"] or start >= now + timedelta(minutes=rule["minNotice"]),
        "La reserva no cumple la antelación mínima del restaurante.",
    )
    valid(
        not rule["maxDays"] or reservation.date <= now.date() + timedelta(days=rule["maxDays"]),
        "La fecha supera la ventana máxima de reservas.",
    )


def slots(org, restaurant, day, span=None, data=None):
    data = data or schedule(restaurant)
    ranges = ranges_for(data, day)
    now = local_now(org)
    hour_now = now.hour + now.minute / 60 if now.date() == day else -1
    rule = data["rules"]
    earliest = now + timedelta(minutes=rule["minNotice"]) if rule["minNotice"] else None
    beyond = rule["maxDays"] and day > now.date() + timedelta(days=rule["maxDays"])
    if span:
        first, last = span
    elif ranges and not beyond:
        first, last = ranges[0][0], ranges[-1][1]
    else:
        return []
    result, hour = [], first
    while hour < last:
        opened = any(a <= hour < b for a, b in ranges)
        # Sin `span` se ofrecen franjas para reservar: solo las que, con la duración por omisión, terminan a más
        # tardar a medianoche. La línea de tiempo (`span`) sigue dibujando el día completo.
        if span or (opened and hour + DEFAULT_LENGTH <= 24):
            past = hour < hour_now
            result.append(
                {
                    "time": hour,
                    "label": hour_label(hour),
                    "past": past,
                    "closed": not opened,
                    "soon": bool(earliest)
                    and not past
                    and datetime.combine(day, time.min, now.tzinfo) + timedelta(hours=hour) < earliest,
                }
            )
        hour += 0.5
    return result
