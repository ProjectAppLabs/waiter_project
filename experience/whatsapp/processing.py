"""Bandeja durable de eventos; el cron y los hilos comparten los mismos bloqueos."""
import json
import logging
import threading
from datetime import datetime, timezone as datetime_timezone

from django.db import close_old_connections, connections, transaction
from django.db.models import F
from django.utils import timezone

from tenancy.http import Problem
from .client import WhatsAppError
from .models import WhatsAppAccount, WhatsAppConversation, WhatsAppMessage, WhatsAppWebhookEvent
from .services import available, client_for
from .webhook import IncomingMessage, parse_events

logger = logging.getLogger(__name__)
RANK = {'received': 0, 'sent': 1, 'failed': 2, 'delivered': 3, 'read': 4}
# Tras estos intentos un evento deja de reintentarse: un error permanente (por ejemplo, Meta no conoce el mensaje que se
# quiere marcar como leído, o el cuerpo no es JSON) no debe quedar dando vueltas en cada pasada del cron.
MAX_ATTEMPTS = 5


def on_incoming_message(message):
    """Un mensaje entrante persistido produce como máximo una respuesta del núcleo."""
    from assistant.engine import handle
    from .services import send_text, window_open
    conversation = message.conversation
    from datetime import timedelta
    if (message.received_at and message.received_at <= timezone.now() - timedelta(hours=24)) or not window_open(conversation):
        return
    account = conversation.account
    restaurant = account.restaurant
    if restaurant is None:
        # El domicilio cotiza entre todas las sedes; las demás conversaciones conservan su sede inequívoca.
        locations = list(account.organization.restaurants.filter(active=True).order_by('id')[:2])
        if len(locations) != 1:
            from assistant.service import wants_delivery
            interactive = message.raw.get('interactive') or {}
            option = interactive.get('button_reply') or interactive.get('list_reply') or {}
            delivery_message = message.type == 'location' or wants_delivery(message.text) or str(option.get('id', '')).startswith('delivery_')
            if not locations or not delivery_message:
                return
        restaurant = locations[0]
    action = None
    if message.type == 'interactive':
        interactive = message.raw.get('interactive', {})
        item = interactive.get('button_reply') or interactive.get('list_reply') or {}
        value = item.get('id')
        if isinstance(value, str):
            action = {'type': 'option', 'value': value}
    if message.type == 'location':
        from .webhook import location_action
        action = location_action(message.raw)
    if message.type not in ('text', 'interactive', 'location'):
        return
    reply = handle('whatsapp', restaurant, conversation.wa_id, text=message.text, action=action)
    send_reply(conversation, reply)


def send_reply(conversation, reply):
    from .services import send_text, send_location_request, send_buttons
    delivery = getattr(reply, 'delivery', None)
    if delivery:
        if delivery['request_location']:
            send_location_request(conversation, reply['text'])
            if delivery['options']:
                send_buttons(conversation, delivery['options'][0]['label'], delivery['options'])
        elif delivery['options']:
            send_buttons(conversation, reply['text'], delivery['options'])
        else:
            send_text(conversation, reply['text'])
        return
    if reply['text']:
        details = '\n'.join(f"{c['name']}: $ {c['price']}" for c in reply['cards'])
        send_text(conversation, reply['text'] + ('\n' + details if details else ''))


def event_time(value):
    try:
        return min(datetime.fromtimestamp(int(value), tz=datetime_timezone.utc), timezone.now())
    except (ValueError, TypeError, OverflowError, OSError):
        return timezone.now()


def _apply(event):
    account = WhatsAppAccount.objects.select_for_update().select_related('organization', 'restaurant').filter(
        phone_number_id=event.phone_number_id, status='connected').first()
    if not account:
        logger.info('Evento de WhatsApp ignorado: número sin cuenta conectada.')
        return
    try:
        available(account)
    except Problem:
        logger.info('Evento de WhatsApp ignorado: organización o módulo sin acceso.')
        return
    if not event.message_id or len(event.message_id) > 255:
        return
    at = event_time(event.timestamp)
    if isinstance(event, IncomingMessage):
        if not event.from_number or len(event.from_number) > 32:
            return
        conversation, _ = WhatsAppConversation.objects.get_or_create(account=account, wa_id=event.from_number)
        message, created = WhatsAppMessage.objects.get_or_create(wamid=event.message_id, defaults={
            'conversation': conversation, 'direction': 'in', 'type': event.type[:30], 'text': event.text or '',
            'status': 'received', 'received_at': at, 'raw': event.raw,
        })
        if message.conversation_id != conversation.pk:
            return
        if created:
            if not conversation.last_inbound_at or at > conversation.last_inbound_at:
                conversation.last_inbound_at = at
            conversation.profile_name = (event.profile_name or conversation.profile_name)[:200]
            conversation.updated_at = timezone.now()
            conversation.save()
            on_incoming_message(message)
        # Repetir la confirmación de lectura es inocuo y permite recuperarla tras un error de red.
        try:
            client_for(account).mark_as_read(event.message_id)
        except Problem:
            return False
    else:
        message = WhatsAppMessage.objects.select_for_update().filter(wamid=event.message_id, conversation__account=account, direction='out').first()
        if not message or event.status not in ('sent', 'delivered', 'read', 'failed'):
            return
        field = f'{event.status}_at'
        previous = getattr(message, field)
        setattr(message, field, min(previous, at) if previous else at)
        if RANK[event.status] > RANK[message.status]:
            message.status = event.status
        if event.status == 'failed':
            error = WhatsAppError(event.errors[0].get('code') if event.errors else None)
            message.error_code = str(error.code or '')
            message.error_message = error.message
        message.save()


def process_event(pk):
    with transaction.atomic():
        # La primera operación es una escritura condicional: también serializa trabajadores en SQLite.
        if not WhatsAppWebhookEvent.objects.filter(pk=pk, processed_at__isnull=True).update(attempts=F('attempts') + 1):
            return False
        event = WhatsAppWebhookEvent.objects.get(pk=pk)
        try:
            # Si falla un efecto, el mensaje y el evento quedan pendientes juntos, sin medias escrituras.
            with transaction.atomic():
                complete = True
                for item in parse_events(json.loads(bytes(event.raw_body))):
                    if _apply(item) is False:
                        complete = False
        except Exception:
            event.error = 'No se pudo procesar el evento de WhatsApp. Se reintentará.'
            logger.warning('No se pudo procesar el evento de WhatsApp %s; queda pendiente.', pk)
        else:
            if complete:
                event.processed_at = timezone.now()
                event.error = ''
            else:
                event.error = 'El mensaje se guardó; queda pendiente confirmar la lectura en WhatsApp.'
        if event.processed_at is None and event.attempts >= MAX_ATTEMPTS:
            event.processed_at = timezone.now()
            event.error = f'Descartado tras {MAX_ATTEMPTS} intentos. {event.error}'.strip()
            logger.warning('Evento de WhatsApp %s descartado tras %s intentos.', pk, MAX_ATTEMPTS)
            event.save(update_fields=['processed_at', 'error'])
            return False
        event.save(update_fields=['processed_at', 'error'])
        return event.processed_at is not None


def process_pending():
    ids = list(WhatsAppWebhookEvent.objects.filter(processed_at__isnull=True).order_by('id').values_list('id', flat=True)[:100])
    return sum(process_event(pk) for pk in ids)


def _worker(pk):
    try:
        close_old_connections()
        process_event(pk)
    except Exception:
        logger.warning('El procesamiento de WhatsApp quedó pendiente para el comando de recuperación.')
    finally:
        connections.close_all()


def launch_event(pk):
    try:
        threading.Thread(target=_worker, args=(pk,), daemon=True).start()
    except Exception:
        logger.warning('No se pudo iniciar el hilo de WhatsApp; el evento queda pendiente.')
