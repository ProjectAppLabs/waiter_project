"""Shared conversation core; transports supply authenticated identity and catalog."""
import re
import unicodedata
from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import APIException

from experience_app.models import AgentConversation, AgentDailyUsage
from experience_app.services import waiter_agent


class ChatBusy(APIException):
    status_code = 429
    default_detail = 'Espera un momento antes de enviar otro mensaje.'


def conversation(restaurant, venue, channel, participant):
    return AgentConversation.objects.get_or_create(
        restaurant=restaurant, venue=venue, channel=channel, participant=participant)[0]


def available():
    return bool(settings.OPENAI_API_KEY and settings.WA_AGENT_MODEL)


def reply_for(plan):
    if plan.get('respuesta'):
        return plan['respuesta']
    if plan['accion'] == 'preguntar':
        return waiter_agent.QUESTIONS[plan['pregunta']]
    return {
        'recomendar': 'Estas opciones del menú pueden gustarte. ¿Cuál te provoca?',
        'cotizar': 'Estos son los platos que entendí. Revisa sus opciones antes de agregarlos a tu pedido.',
        'agregar': 'Voy a revisar tu selección para añadirla al pedido.',
        'humano': 'Para ayudarte con esto necesitamos al equipo del restaurante. Puedes pedir atención desde el menú.',
    }[plan['accion']]


def send(chat, message_id, message, load_products):
    """No cart writes, confirmations, payments or messaging side effects."""
    now, token = timezone.now(), uuid4()
    if not AgentConversation.objects.filter(pk=chat.pk).filter(
        Q(lease_until__isnull=True) | Q(lease_until__lt=now)
    ).update(lease_until=now + timedelta(seconds=90), lease_token=token):
        raise ChatBusy()
    try:
        chat.refresh_from_db()
        for turn in chat.history:
            if turn['id'] == str(message_id):
                if turn['mensaje'] != message:
                    raise ChatBusy('Esta referencia ya corresponde a otro mensaje.')
                return turn
        if not available():
            raise waiter_agent.AgentUnavailable('El mesero virtual aún no está disponible. Puedes explorar el menú.')
        if chat.history and now.timestamp() - chat.history[-1]['time'] < 3:
            raise ChatBusy()
        usage, _ = AgentDailyUsage.objects.get_or_create(restaurant=chat.restaurant, day=now.date())
        if not AgentDailyUsage.objects.filter(pk=usage.pk, attempts__lt=settings.AGENT_DAILY_LIMIT).update(attempts=F('attempts') + 1):
            raise ChatBusy('El mesero virtual alcanzó su límite de atención por hoy. Puedes continuar en el menú.')
        products = load_products()
        plan = waiter_agent.propose(message, products, history=[
            {'cliente': t['mensaje'], 'asistente': t['respuesta'], 'seleccion': t['lineas'], 'opciones': t.get('opciones', [])} for t in chat.history[-6:]])
        if chat.channel == 'menu':
            from tenancy.usage import record_location_usage
            from django.db import transaction
            tokens = getattr(plan, 'usage', None) or {}
            detail = {'input_tokens': tokens.get('input_tokens', 0), 'output_tokens': tokens.get('output_tokens', 0)}
            with transaction.atomic():
                record_location_usage(chat.restaurant, chat.venue, 'asistente_menu', 'mensaje_ia',
                                      key=f'asistente_menu:{message_id}:mensaje', detail=detail)
                record_location_usage(chat.restaurant, chat.venue, 'asistente_menu', 'tokens_ia',
                                      sum(detail.values()), key=f'asistente_menu:{message_id}:tokens', detail=detail)
        if plan['accion'] == 'agregar' and not explicit_add(message):
            plan = {**plan, 'accion': 'cotizar', 'respuesta': 'Puedes añadir estos platos con sus botones o pedirme explícitamente que los añada.'}
        # Render names from catalog; do not turn model output into HTML or claims of payment/order creation.
        by_id = {p['id']: p for p in products}
        turn = {'id': str(message_id), 'mensaje': message, 'respuesta': reply_for(plan),
                'accion': plan['accion'], 'opciones': plan.get('opciones', []), 'lineas': [
                    {**line, 'nombre': by_id[line['producto']]['nombre']} for line in plan['lineas']],
                'time': now.timestamp()}
        if not AgentConversation.objects.filter(pk=chat.pk, lease_token=token).update(
            history=(chat.history + [turn])[-30:], updated_at=timezone.now()):
            raise ChatBusy('La conversación cambió. Vuelve a intentarlo.')
        return turn
    finally:
        AgentConversation.objects.filter(pk=chat.pk, lease_token=token).update(lease_until=None, lease_token=None)


def explicit_add(message):
    text = ''.join(c for c in unicodedata.normalize('NFD', message.lower()) if not unicodedata.combining(c))
    # A model classification alone is insufficient for a write. Conservative negatives require a card click.
    if re.search(r'\b(no|nunca|tampoco|evita)\b', text):
        return False
    return bool(re.search(r'\b(anad(?:e|elo|ela|elos|elas|eme|eme|ir)|agreg(?:a|alo|ala|alos|alas|ame|ar)|pon(?:me|lo|la|los|las))\b', text))


def restart(chat):
    """Start afresh without touching cart selections or usage limits; don't race an active reply."""
    now = timezone.now()
    if not AgentConversation.objects.filter(pk=chat.pk).filter(
        Q(lease_until__isnull=True) | Q(lease_until__lt=now)
    ).update(history=[], updated_at=now):
        raise ChatBusy('Espera a que termine la respuesta antes de iniciar otra conversación.')
