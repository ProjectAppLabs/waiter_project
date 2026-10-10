"""Adaptador del chat del menú: conserva su contrato, bloqueo e idempotencia."""
import re
import unicodedata
from datetime import timedelta
from uuid import uuid4

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import APIException

from experience_app.models import AgentConversation
from experience_app.services import waiter_agent


class ChatBusy(APIException):
    status_code = 429
    default_detail = 'Espera un momento antes de enviar otro mensaje.'


def conversation(restaurant, venue, channel, participant):
    return AgentConversation.objects.get_or_create(
        restaurant=restaurant, venue=venue, channel=channel, participant=participant)[0]


def available():
    return True


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
    """El núcleo decide; el adaptador de carrito conserva las escrituras autorizadas."""
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
        from assistant.engine import handle
        from tenancy.models import Restaurant
        from experience_app.models import Diner
        local = Restaurant.objects.select_related('organization').get(organization__slug=chat.restaurant, slug=chat.venue)
        participant = Diner.objects.select_related('session', 'account').filter(pk=chat.participant).first() if re.fullmatch(r'[0-9a-f-]{36}', chat.participant) else None
        reply = handle(chat.channel, local, participant or chat.participant, text=message, products=load_products())
        turn = {'id': str(message_id), 'mensaje': message, 'respuesta': reply['text'],
                'accion': 'agregar' if reply.add else 'recomendar' if reply['cards'] else 'preguntar',
                'opciones': [o['label'] for o in reply['options']], 'lineas': reply.lines,
                'time': now.timestamp()}
        if reply['notice']:
            # Plan AS: la escalera de avisos llega al menú como un mensaje marcado del asistente.
            turn['aviso'] = {'tipo': NOTICE.get(reply['notice']['kind'], 'advertencia'), 'hasta': reply['notice']['until']}
        if not AgentConversation.objects.filter(pk=chat.pk, lease_token=token).update(
            history=(chat.history + [turn])[-30:], updated_at=timezone.now()):
            raise ChatBusy('La conversación cambió. Vuelve a intentarlo.')
        return turn
    finally:
        AgentConversation.objects.filter(pk=chat.pk, lease_token=token).update(lease_until=None, lease_token=None)


NOTICE = {'reminder': 'recordatorio', 'warning': 'advertencia', 'restricted': 'restringido', 'paused': 'pausado', 'quota': 'cupo'}


def explicit_add(message):
    text = ''.join(c for c in unicodedata.normalize('NFD', message.lower()) if not unicodedata.combining(c))
    # Una clasificación del modelo no autoriza escrituras; las negaciones requieren tocar la tarjeta.
    if re.search(r'\b(no|nunca|tampoco|evita)\b', text):
        return False
    return bool(re.search(r'\b(anad(?:e|elo|ela|elos|elas|eme|eme|ir)|agreg(?:a|alo|ala|alos|alas|ame|ar)|pon(?:me|lo|la|los|las))\b', text))


def restart(chat):
    """Reinicia la conversación sin borrar el carrito ni los cupos, respetando el bloqueo."""
    now = timezone.now()
    if not AgentConversation.objects.filter(pk=chat.pk).filter(
        Q(lease_until__isnull=True) | Q(lease_until__lt=now)
    ).update(history=[], updated_at=now):
        raise ChatBusy('Espera a que termine la respuesta antes de iniciar otra conversación.')

    from assistant.models import AssistantConversationState
    from assistant.profiles import identity
    from tenancy.models import Restaurant
    from experience_app.models import Diner
    local = Restaurant.objects.select_related('organization').filter(organization__slug=chat.restaurant, slug=chat.venue).first()
    if local:
        participant = Diner.objects.select_related('session', 'account').filter(pk=chat.participant).first() if re.fullmatch(r'[0-9a-f-]{36}', chat.participant) else None
        key, _ = identity(chat.channel, participant or chat.participant, local.organization)
        AssistantConversationState.objects.filter(restaurant=local, channel=chat.channel, participant=key).delete()
