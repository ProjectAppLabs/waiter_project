"""Anticipo de una reserva pagado por enlace. Misma maquinaria que la cuenta de una visita (intento durable, verificación
remota, conciliación idempotente), pero sin sesión de comensal: quien tiene el enlace tiene un token secreto de la reserva,
y la reserva —con su monto— vive en el sistema propio. El navegador nunca decide cuánto se cobra."""
from experience_app.adapters.core.pos import Client
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import NotFound, ValidationError

from experience_app.adapters.core.pos import resolve
from experience_app.models import PaymentAttempt
from experience_app.payments import PROVIDERS
from experience_app.payments.crypto import decrypt, encrypt, gateway_context
from experience_app.services.online_payments import (
    ACTIVE,
    PaymentConflict,
    checkout_context,
    gateway_for,
    serialize,
    submit,
)

TOKEN = re.compile(r'^[A-Za-z0-9_-]{20,64}$')
PAYABLE_STATES = ('confirmed', 'seated')


def reservation(restaurant, venue, token):
    """Lo que el sistema propio deja ver de la reserva a quien tiene el enlace, o 404. Sin correo, teléfono ni notas."""
    if not TOKEN.match(token or ''):
        raise NotFound('No encontramos esta reserva.')
    found = Client(resolve(restaurant, venue)).call_kw('waiter.reservation', 'waiter_deposit_public', [token])
    if not found:
        raise NotFound('No encontramos esta reserva.')
    return found


def payable(found):
    return found['deposit_state'] == 'pending' and found['state'] in PAYABLE_STATES and found['amount_in_cents'] > 0


def attempts(restaurant, venue, token):
    return PaymentAttempt.objects.filter(reservation_token=token, gateway__restaurant_slug=restaurant, gateway__venue_slug=venue)


def context(restaurant, venue, token):
    found = reservation(restaurant, venue, token)
    pending = attempts(restaurant, venue, token).filter(status__in=ACTIVE).order_by('-created_at').first()
    result = {'reservation': found, 'available': False, 'attempt': serialize(pending) if pending else None, 'other_payment_pending': False,
        'amount_in_cents': found['amount_in_cents'] if payable(found) else None}
    config = gateway_for(restaurant, venue)
    if config and payable(found):
        result.update(checkout_context(config))
    return result


def create(restaurant, venue, token, data):
    existing = PaymentAttempt.objects.filter(id=data['id']).first()
    if existing:
        if existing.reservation_token != token or existing.method != data['method']:
            raise PaymentConflict()
        return existing
    config = gateway_for(restaurant, venue)
    if not config:
        raise PaymentConflict('Los pagos en línea todavía no están habilitados para este restaurante.')
    credentials = decrypt(config.secrets_cipher, gateway_context(config))
    if data['method'] == 'CARD' and not data['token'].startswith(f'tok_{config.environment}_'):
        raise ValidationError({'detail': 'La tarjeta no corresponde al ambiente de pago.'})
    provider = PROVIDERS[config.provider]
    if data['method'] not in provider.merchant(config.environment, config.public_key).get('accepted_payment_methods', []):
        raise ValidationError({'detail': 'Este medio no está habilitado en la cuenta del restaurante.'})
    found = reservation(restaurant, venue, token)
    if not payable(found):
        raise PaymentConflict('Esta reserva ya no tiene un anticipo pendiente.')
    if found['amount_in_cents'] != data['expected_amount_in_cents']:
        raise PaymentConflict('El valor del anticipo cambió. Actualiza la página antes de pagar.')
    busy = 'Ya hay un pago en curso para esta reserva. Espera su resultado antes de volver a pagar.'
    if attempts(restaurant, venue, token).filter(status__in=ACTIVE).exists():
        raise PaymentConflict(busy)
    try:
        # La comprobación anterior cubre el caso normal (doble clic, otra pestaña). La restricción única por reserva es la
        # red para dos peticiones simultáneas; el savepoint evita que ese choque deje inservible la transacción de quien llama.
        with transaction.atomic():
            attempt = PaymentAttempt.objects.create(id=data['id'], gateway=config, reservation_token=token, reservation_code=found['code'][:40],
                amount_in_cents=found['amount_in_cents'], method=data['method'], credentials_cipher=encrypt(credentials), payment_method_id=config.payment_method_id)
    except IntegrityError:
        raise PaymentConflict(busy) from None
    return submit(provider, config, credentials, attempt, data, f'{settings.DINER_PUBLIC_URL}/{restaurant}/{venue}/reserva/{token}')
