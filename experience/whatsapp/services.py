"""Conexión y envíos con credenciales cifradas y ventana de atención."""
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from experience_app.payments import crypto
from tenancy.http import Problem, require
from tenancy.models import Organization
from tenancy.modules import require_module
from .client import WhatsAppClient, WhatsAppError, graph_request
from .models import WhatsAppAccount, WhatsAppConversation, WhatsAppMessage


def configured(*names):
    require(all(getattr(settings, name, '') for name in names),
            'Falta configurar WhatsApp en el servidor: ' + ', '.join(names) + '.', 'whatsapp_not_configured', 503)


def encrypted(value):
    try:
        return crypto.encrypt(value)
    except crypto.PaymentUnavailable:
        raise Problem('whatsapp_not_configured', 'Falta configurar el cifrado de credenciales de WhatsApp.', 503) from None


def decrypted(value):
    try:
        return crypto.decrypt(value)
    except crypto.PaymentUnavailable:
        raise Problem('whatsapp_not_configured', 'No se pudieron abrir las credenciales de WhatsApp.', 503) from None


def client_for(account):
    token = decrypted(account.token_encrypted) if account.token_encrypted else settings.WA_ACCESS_TOKEN
    require(bool(token), 'Falta configurar el token de WhatsApp.', 'whatsapp_not_configured', 503)
    return WhatsAppClient(token, account.phone_number_id, settings.WA_GRAPH_VERSION)


def available(account):
    require(account.status == 'connected', 'Conecta una cuenta de WhatsApp para continuar.', 'whatsapp_disconnected', 409)
    require(account.organization.status != 'suspended', 'La organización está suspendida.', 'organization_suspended', 403)
    require_module(account.organization, 'asistente_whatsapp', account.restaurant)


def number(value):
    require(isinstance(value, str) and len(value) <= 80 and re.fullmatch(r'[+0-9 ()-]+', value),
            'Indica un número de teléfono válido.', 'invalid_data', 400)
    result = WhatsAppClient.normalize_number(value)
    require(7 <= len(result) <= 15, 'Indica un número con su indicativo de país.', 'invalid_data', 400)
    return result


def window_open(conversation):
    return bool(conversation.last_inbound_at and conversation.last_inbound_at > timezone.now() - timedelta(hours=24))


def _send(account, to, *, text='', template='', language='', location=False, options=None):
    to = number(to)
    error = None
    with transaction.atomic():
        account = WhatsAppAccount.objects.select_for_update().select_related('organization', 'restaurant').get(pk=account.pk)
        available(account)
        if not account.token_encrypted:
            allowed = [WhatsAppClient.normalize_number(n) for n in settings.WA_TEST_RECIPIENTS]
            require(to in allowed, 'El destinatario no está permitido para el número de prueba. Configura WA_TEST_RECIPIENTS.', 'recipient_not_allowed', 400)
        client = client_for(account)
        conversation, _ = WhatsAppConversation.objects.get_or_create(account=account, wa_id=to)
        if not template:
            require(window_open(conversation), 'La ventana de 24 horas terminó. Envía una plantilla.', 'window_closed', 409)
        message = WhatsAppMessage.objects.create(conversation=conversation, direction='out', type='template' if template else 'interactive' if location or options else 'text',
                                                text=text, template=template, language=language, status='sent')
        try:
            response = (client.send_template(to, template, language) if template else
                        client.send_location_request(to, text) if location else
                        client.send_buttons(to, text, options) if options else client.send_text(to, text))
            wamid = client.message_id(response)
            if not isinstance(wamid, str) or not wamid or len(wamid) > 255:
                raise WhatsAppError()
            message.wamid = wamid
            message.sent_at = timezone.now()
            # Solo la confirmación necesaria; Meta puede incluir datos sensibles en otros campos.
            message.raw = {'messages': [{'id': wamid}]}
        except WhatsAppError as exc:
            error = exc
            message.status = 'failed'
            message.failed_at = timezone.now()
            message.error_code = str(exc.code or '')
            message.error_message = exc.message
        message.save()
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=['updated_at'])
    if error:
        raise error
    return message


def send_template(account, to, template_name='hello_world', language='en_US'):
    return _send(account, to, template=template_name, language=language)


def send_text(conversation, text):
    require(isinstance(text, str) and 0 < len(text.strip()) <= 4096, 'Escribe un mensaje de hasta 4096 caracteres.', 'invalid_data', 400)
    return _send(conversation.account, conversation.wa_id, text=text.strip())


def send_order_confirmation(order):
    account = WhatsAppAccount.objects.filter(organization=order.organization, status='connected').first()
    require(account and account.restaurant_id in (None, order.restaurant_id), 'No hay una cuenta de WhatsApp conectada para este local.', 'whatsapp_disconnected', 409)
    to = order.delivery_phone or (order.customer.phone if order.customer_id else '')
    return send_template(account, to)


def connect(actor, code, waba_id, phone_number_id='', business_app=False):
    account, error = _connect(actor, code, waba_id, phone_number_id, business_app)
    if error:
        raise error
    return account


@transaction.atomic
def _connect(actor, code, waba_id, phone_number_id, business_app):
    configured('META_APP_ID', 'META_APP_SECRET', 'WA_SIGNUP_CONFIG_ID')
    require(isinstance(code, str) and 0 < len(code) <= 4096, 'Indica el código del registro integrado.', 'invalid_data', 400)
    require(isinstance(business_app, bool), 'Indica si el número viene de la app WhatsApp Business.', 'invalid_data', 400)
    phone_number_id = phone_number_id or ''
    for identifier in (waba_id, phone_number_id or '0'):
        require(isinstance(identifier, str) and re.fullmatch(r'[0-9]{1,80}', identifier), 'Indica identificadores válidos de WhatsApp.', 'invalid_data', 400)
    token = None
    if not phone_number_id:
        # Coexistencia (la app WhatsApp Business del celular): Meta puede no devolver el número en la ventana. El código
        # sirve una sola vez, así que se cambia aquí por el token y se busca el número en la cuenta del restaurante.
        try:
            token = _exchange_code(code)
            numbers = graph_request('get', f'{waba_id}/phone_numbers', token=token, params={'fields': 'id'}).get('data') or []
        except Problem as error:
            return None, error
        if len(numbers) != 1 or not re.fullmatch(r'[0-9]{1,80}', str(numbers[0].get('id', ''))):
            return None, Problem('whatsapp_error', 'No pudimos identificar el número de tu cuenta de WhatsApp. Vuelve a intentarlo.', 502)
        phone_number_id = str(numbers[0]['id'])
    Organization.objects.select_for_update().get(pk=actor.organization_id)
    current = WhatsAppAccount.objects.select_for_update().filter(organization=actor.organization, status='connected').first()
    require(not current or current.phone_number_id == phone_number_id, 'Desconecta el número actual antes de conectar otro.', 'whatsapp_already_connected', 409)
    account = WhatsAppAccount.objects.select_for_update().filter(phone_number_id=phone_number_id).first()
    require(not account or account.organization_id == actor.organization_id, 'Este número ya está vinculado a otra organización.', 'conflict', 409)
    # Reservar el número antes de contactar a Meta evita dos altas concurrentes de organizaciones distintas.
    if not account:
        account = WhatsAppAccount.objects.create(organization=actor.organization, phone_number_id=phone_number_id, waba_id=waba_id, status='disconnected')
    pin = decrypted(account.pin_encrypted) if account.pin_encrypted else f'{secrets.randbelow(1000000):06d}'
    pin_encrypted = encrypted(pin)
    account.pin_encrypted = pin_encrypted
    account.save(update_fields=['pin_encrypted'])
    # Conservar PIN y token aunque Meta falle después del registro permite reintentar con el mismo PIN.
    try:
        token = token or _exchange_code(code)
        token_encrypted = encrypted(token)
        require(len(token_encrypted) <= 4096, 'Las credenciales recibidas no son válidas.', 'whatsapp_error', 502)
        account.token_encrypted = token_encrypted
        account.save(update_fields=['token_encrypted'])
        # En coexistencia el número ya está registrado en la app del celular: Meta pide no volver a registrarlo.
        steps = [(f'{waba_id}/subscribed_apps', {})] + ([] if business_app else [(f'{phone_number_id}/register', {'messaging_product': 'whatsapp', 'pin': pin})])
        for path, body in steps:
            result = graph_request('post', path, token=token, body=body)
            require(result.get('success') is True, 'Meta no confirmó la conexión del número.', 'whatsapp_error', 502)
        info = graph_request('get', phone_number_id, token=token, params={'fields': 'display_phone_number,verified_name,quality_rating'})
        account.waba_id = waba_id
        account.token_encrypted = token_encrypted
        account.phone = str(info.get('display_phone_number', ''))[:80]
        account.name = str(info.get('verified_name', ''))[:200]
        account.quality = str(info.get('quality_rating', ''))[:30]
        account.status = 'connected'
        account.connected_by = actor
        account.connected_at = timezone.now()
        account.save()
        return account, None
    except Problem as error:
        return account, error


def _exchange_code(code):
    response = graph_request('get', 'oauth/access_token', params={'client_id': settings.META_APP_ID, 'client_secret': settings.META_APP_SECRET, 'code': code})
    token = response.get('access_token')
    require(isinstance(token, str) and bool(token), 'Meta no entregó las credenciales de la cuenta.', 'whatsapp_error', 502)
    return token


@transaction.atomic
def disconnect(account):
    Organization.objects.select_for_update().get(pk=account.organization_id)
    account = WhatsAppAccount.objects.select_for_update().get(pk=account.pk)
    if account.status == 'connected':
        client = client_for(account)
        result = graph_request('delete', f'{account.waba_id}/subscribed_apps', token=client.access_token)
        require(result.get('success') is True, 'Meta no confirmó la desconexión.', 'whatsapp_error', 502)
        account.status = 'disconnected'
        account.save(update_fields=['status'])
    return account


@transaction.atomic
def connect_test(org, restaurant=None):
    configured('WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_WABA_ID')
    require(restaurant is None or restaurant.organization_id == org.pk, 'El local no pertenece a la organización.', 'not_found', 404)
    require_module(org, 'asistente_whatsapp', restaurant)
    Organization.objects.select_for_update().get(pk=org.pk)
    existing = WhatsAppAccount.objects.select_for_update().filter(phone_number_id=settings.WA_PHONE_NUMBER_ID).first()
    require(not existing or (existing.organization_id == org.pk and not existing.token_encrypted), 'El número ya tiene otra vinculación.', 'conflict', 409)
    require(not WhatsAppAccount.objects.filter(organization=org, status='connected').exclude(phone_number_id=settings.WA_PHONE_NUMBER_ID).exists(), 'Desconecta el número actual antes de vincular otro.', 'conflict', 409)
    account, _ = WhatsAppAccount.objects.update_or_create(phone_number_id=settings.WA_PHONE_NUMBER_ID, defaults={
        'organization': org, 'restaurant': restaurant, 'waba_id': settings.WA_WABA_ID, 'status': 'connected', 'connected_at': timezone.now(),
    })
    return account


def send_location_request(conversation, body):
    return _send(conversation.account, conversation.wa_id, text=body, location=True)


def send_buttons(conversation, body, options):
    return _send(conversation.account, conversation.wa_id, text=body, options=options)
