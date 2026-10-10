"""Plan D: horario de atención de cada sede; dice si está abierta y cuándo abre o cierra.

Lo usan el menú (no se confirman pedidos con la sede cerrada), los domicilios (solo sedes abiertas) y el asistente
(«¿a qué hora cierran?»). Una sede sin horario configurado se trata como siempre abierta, como antes.
"""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']


def hours_of(restaurant):
    from .models import OpeningHours
    row = OpeningHours.objects.filter(restaurant=restaurant).first()
    return {'weekly': row.weekly, 'overrides': row.overrides} if row else None


def ranges_on(data, day):
    return next((r['ranges'] for r in data['overrides'] if r['date'] == day.isoformat()), data['weekly'].get(str(day.weekday()), []))


def spoken(hour):
    """«11 a. m.», «7:30 p. m.», «12 m.» (como se dice en voz alta)."""
    minutes = round(hour * 60) % (24 * 60)
    h, m = divmod(minutes, 60)
    if h == 12 and not m:
        return '12 m.'
    return f"{h % 12 or 12}{f':{m:02d}' if m else ''} {'a. m.' if h < 12 else 'p. m.'}"


def status(restaurant, at=None):
    """{configurado, abierto, cierra, abre: {cuando, hora}, hoy: [[desde, hasta]]} para el menú y el asistente."""
    data = hours_of(restaurant)
    if not data:
        return {'configurado': False, 'abierto': True}
    now = (at or timezone.now()).astimezone(ZoneInfo(restaurant.organization.timezone))
    today = now.date()
    hour = now.hour + now.minute / 60
    ranges = ranges_on(data, today)
    current = next(([a, b] for a, b in ranges if a <= hour < b), None)
    result = {'configurado': True, 'abierto': current is not None, 'hoy': ranges}
    if current:
        result['cierra'] = spoken(current[1])
        return result
    # La próxima apertura: más tarde hoy o en los siguientes siete días.
    for offset in range(8):
        day = today + timedelta(days=offset)
        for start, _ in ranges_on(data, day):
            if offset == 0 and start <= hour:
                continue
            when = 'hoy' if offset == 0 else 'mañana' if offset == 1 else f'el {DAYS[day.weekday()]}'
            result['abre'] = {'cuando': when, 'hora': spoken(start), 'fecha': day.isoformat()}
            return result
    return result


def closed_message(name, info):
    abre = info.get('abre')
    return f'La sede {name} está cerrada en este momento.' + (f" Abre {abre['cuando']} a las {abre['hora']}." if abre else '')


def clean_hours(raw):
    """Valida el horario con las mismas reglas del horario de reservas (sin las reglas de antelación)."""
    from loyalty.promotions import iso_date
    from reservations.schedule import clean_ranges
    from catalog.services import valid
    from sales.services import text
    from .http import payload
    raw = payload(raw, ('weekly', 'overrides'), ('weekly',))
    week = raw['weekly']
    valid(isinstance(week, dict) and set(week) == {str(i) for i in range(7)}, 'Completa los siete días de la semana.')
    overrides = raw.get('overrides', [])
    valid(isinstance(overrides, list) and len(overrides) <= 366)
    result, seen = [], set()
    for item in overrides:
        item = payload(item, ('date', 'ranges', 'note'), ('date',))
        day = iso_date(item['date']).isoformat()
        valid(day not in seen, 'No repitas fechas especiales.')
        seen.add(day)
        result.append({'date': day, 'ranges': clean_ranges(item.get('ranges', [])), 'note': text(item.get('note', ''), 80)})
    return {'weekly': {day: clean_ranges(value) for day, value in week.items()}, 'overrides': sorted(result, key=lambda r: r['date'])}
