"""Respuestas frecuentes con datos públicos aprobados de la sede."""
from zoneinfo import ZoneInfo

from django.utils import timezone
from reservations.models import ReservationSchedule
from .selection import normalize
from .tones import DEFAULT, phrases


def data_for(restaurant):
    # Plan D: el horario de atención manda; sin él, el de reservas (como antes).
    from tenancy.hours import hours_of
    schedule = hours_of(restaurant)
    if schedule is None:
        row = ReservationSchedule.objects.filter(restaurant=restaurant).first()
        schedule = {'weekly': row.weekly, 'overrides': row.overrides} if row else None
    return {'name': restaurant.name, 'street': restaurant.street, 'city': restaurant.city, 'phone': restaurant.phone,
            'weekly': schedule['weekly'] if schedule else {}, 'overrides': schedule['overrides'] if schedule else [],
            'greeting': restaurant.organization.greeting, 'waiter_name': restaurant.organization.waiter_name}


def answer(text, data, restaurant, participant, tone=DEFAULT):
    text = normalize(text)
    say = lambda key, **fields: phrases(tone, key)[0].format(**fields)
    if any(w in text.split() for w in ('direccion', 'ubicacion', 'ubicados')):
        return say('address', address=', '.join(filter(None, (data['street'], data['city'])))) if data['street'] else say('address_none')
    if any(w in text.split() for w in ('horario', 'abren', 'cierran')):
        today = timezone.now().astimezone(ZoneInfo(restaurant.organization.timezone))
        periods = data['weekly'].get(str(today.weekday()), [])
        for override in data['overrides']:
            if isinstance(override, dict) and override.get('date') == today.date().isoformat():
                periods = override.get('ranges', [])
        def hour(value):
            # Como se dice en voz alta: «10 a. m.», «7:30 p. m.».
            minutes = int(float(value) * 60) % (24 * 60)
            h, m = divmod(minutes, 60)
            return f"{h % 12 or 12}{f':{m:02d}' if m else ''} {'a. m.' if h < 12 else 'p. m.'}"
        # Si en este momento está cerrada, se dice cuándo abre (horario de atención del dueño).
        from tenancy.hours import status
        info = status(restaurant)
        later = ''
        if info['configurado'] and not info['abierto'] and info.get('abre'):
            later = f" En este momento estamos cerrados; abrimos {info['abre']['cuando']} a las {info['abre']['hora']}."
        if periods and all(isinstance(p, list) and len(p) == 2 for p in periods):
            return say('hours', hours=', '.join(f'{hour(a)} a {hour(b)}' for a, b in periods)) + later
        return (say('hours_none') + later) if not later else later.strip()
    if 'domicilio' in text or 'delivery' in text:
        return say('delivery', phone=f" al {data['phone']}" if data['phone'] else '')
    if 'mi pedido' in text:
        from experience_app.models import Diner, Order
        if isinstance(participant, Diner):
            order = Order.objects.filter(session=participant.session).order_by('-created_at').first()
            states = {'pending': 'pendiente', 'sent': 'enviado al restaurante', 'checkout': 'pendiente de pago', 'failed': 'pendiente de revisión'}
            if order:
                return say('order_state', state=states.get(order.state, 'en revisión'))
        return say('order_unknown')
    return None
