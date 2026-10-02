"""Durable payments: reserve once, verify remotely, reconcile idempotently with POS."""
from experience_app.adapters.backend import backend_for, client_for
import uuid
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from tenancy.http import Problem
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import resolve
from experience_app.models import CartLine, Order, PaymentAttempt, PaymentGateway, TableSession
from experience_app.payments import PROVIDERS
from experience_app.payments.crypto import PaymentUnavailable, decrypt, encrypt
from experience_app.services.sessions import PAID_STATES, close_paid

ACTIVE = ['CREATING', 'UNKNOWN', 'PENDING', 'APPROVED']
FINAL = ['APPROVED', 'DECLINED', 'ERROR', 'VOIDED']
TERMINAL = [*FINAL, 'TEST_COMPLETED']


class PaymentConflict(APIException):
    status_code = 409
    default_detail = 'Ya hay un pago en curso para esta mesa. Espera su resultado antes de volver a pagar.'


def cents(value):
    return int((Decimal(str(value)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def gateway_for(restaurant, venue):
    config = PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, enabled=True).first()
    if config and config.environment == 'prod' and not settings.PAYMENTS_LIVE_ENABLED:
        return None
    return config


def gateway(session):
    return gateway_for(session.restaurant_slug, session.venue_slug)


def checkout_context(config):
    """Lo que el navegador necesita para pagar: medios del comercio y los dos contratos de Wompi. Nunca secretos."""
    merchant = PROVIDERS[config.provider].merchant(config.environment, config.public_key)
    consent = merchant.get('presigned_acceptance', {})
    personal = merchant.get('presigned_personal_data_auth', {})
    return {'available': True, 'provider': config.provider, 'environment': config.environment, 'public_key': config.public_key,
        'methods': [m for m in PROVIDERS[config.provider].METHODS if m in merchant.get('accepted_payment_methods', [])],
        'acceptance': {'token': consent.get('acceptance_token'), 'url': consent.get('permalink')},
        'personal_data': {'token': personal.get('acceptance_token'), 'url': personal.get('permalink')}}


def serialize(attempt):
    return {'id': str(attempt.id), 'reference': attempt.reference, 'status': attempt.status, 'method': attempt.method,
        'amount_in_cents': attempt.amount_in_cents, 'environment': attempt.gateway.environment,
        'order_id': str(attempt.order_id) if attempt.order_id else None,
        'reconciled': attempt.reconciled, 'needs_review': attempt.needs_review,
        'challenge_html': attempt.challenge_html or None, 'card_brand': attempt.card_brand,
        'qr_image': attempt.qr_image or None, 'redirect_url': attempt.redirect_url or None}


def context(session, diner):
    pending = session.payments.filter(status__in=ACTIVE).order_by('-created_at').first()
    result = {'available': False, 'attempt': serialize(pending) if pending and pending.diner_id == diner.id else None,
        'other_payment_pending': bool(pending and pending.diner_id != diner.id)}
    config = gateway(session)
    if not config:
        return result
    # Only expose contracts/tokens, never all merchant data or private credentials.
    amount = None
    order = session.orders.filter(state__in=(Order.SENT, Order.CHECKOUT)).exclude(odoo_order_id=None).first()
    if order and not session.lines.filter(status=CartLine.OPEN).exists() and session.state in TableSession.OPEN_STATES:
        tenant = resolve(session.restaurant_slug, session.venue_slug, session.table_token)
        payable = backend_for(tenant.restaurant_slug).read_order(client_for(tenant, OdooClient), order.odoo_order_id)
        amount = max(0, cents(Decimal(str(payable.total)) - Decimal(str(payable.paid))))
    result.update(checkout_context(config), amount_in_cents=amount)
    return result


def create(session, diner, data):
    existing = PaymentAttempt.objects.filter(id=data['id']).first()
    if existing:
        if existing.session_id != session.id or existing.diner_id != diner.id or existing.method != data['method']:
            raise PaymentConflict()
        return existing
    config = gateway(session)
    if not config:
        raise PaymentConflict('Los pagos en línea todavía no están habilitados para este restaurante.')
    credentials = decrypt(config.secrets_cipher)
    if data['method'] == 'CARD' and not data['token'].startswith(f'tok_{config.environment}_'):
        raise ValidationError({'detail': 'La tarjeta no corresponde al ambiente de pago.'})
    provider = PROVIDERS[config.provider]
    merchant = provider.merchant(config.environment, config.public_key)
    if data['method'] not in merchant.get('accepted_payment_methods', []):
        raise ValidationError({'detail': 'Este medio no está habilitado en la cuenta del restaurante.'})
    if not TableSession.objects.filter(id=session.id, confirming=False, state__in=TableSession.OPEN_STATES).update(confirming=True):
        raise PaymentConflict('La cuenta se está actualizando o ya se pagó.')
    try:
        if session.payments.filter(status__in=ACTIVE).exists():
            raise PaymentConflict()
        if session.lines.filter(status=CartLine.OPEN).exists():
            raise PaymentConflict('Confirma los platos pendientes antes de pagar.')
        order = session.orders.filter(state__in=(Order.SENT, Order.CHECKOUT)).exclude(odoo_order_id=None).first()
        if not order:
            raise PaymentConflict('Confirma el pedido antes de pagar.')
        tenant = resolve(session.restaurant_slug, session.venue_slug, session.table_token)
        client = client_for(tenant, OdooClient)
        payable = backend_for(tenant.restaurant_slug).read_order(client, order.odoo_order_id)
        amount = cents(Decimal(str(payable.total)) - Decimal(str(payable.paid)))
        if payable.state in PAID_STATES or amount <= 0:
            raise PaymentConflict('Esta cuenta ya no tiene saldo pendiente.')
        if amount != data['expected_amount_in_cents']:
            raise PaymentConflict('El saldo cambió. Actualiza la cuenta antes de pagar.')
        if config.environment == 'prod':
            client.call_kw('pos.order', 'waiter_gateway_check', [[order.odoo_order_id], config.payment_method_id, amount])
        try:
            attempt = PaymentAttempt.objects.create(id=data['id'], gateway=config, session=session, diner=diner, order=order,
                amount_in_cents=amount, method=data['method'], credentials_cipher=encrypt(credentials), payment_method_id=config.payment_method_id)
        except IntegrityError:
            raise PaymentConflict() from None
    finally:
        TableSession.objects.filter(id=session.id).update(confirming=False)
    return_url = f'{settings.DINER_PUBLIC_URL}/{session.restaurant_slug}/{session.venue_slug}'
    if session.table_token:
        return_url += f'/t/{session.table_token}'
    return_url += '/pago/'
    return submit(provider, config, credentials, attempt, data, return_url)


def submit(provider, config, credentials, attempt, data, return_url):
    """Envía al proveedor un intento ya reservado en la base. Lo comparten la cuenta de una visita y el anticipo de una reserva."""
    try:
        remote = provider.create(config.environment, credentials, attempt, data, return_url)
    except PaymentUnavailable:
        # A timeout/HTTP error doesn't prove no charge happened. Never POST again for this attempt.
        PaymentAttempt.objects.filter(id=attempt.id, status='CREATING').update(status='UNKNOWN')
        attempt.refresh_from_db()
        return attempt
    # Only the authenticated transaction resource can confirm payment, never browser redirect data.
    remote_id = remote.get('id', '')
    if not isinstance(remote_id, str) or not remote_id:
        PaymentAttempt.objects.filter(id=attempt.id, status='CREATING').update(status='UNKNOWN')
        attempt.refresh_from_db()
        return attempt
    PaymentAttempt.objects.filter(id=attempt.id, provider_id='').update(provider_id=remote_id)
    attempt.refresh_from_db()
    return refresh(attempt, force=True)


def reconcile_reservation(attempt):
    """Anticipo aprobado en producción: se marca pagado en la reserva de Odoo. Idempotente por referencia."""
    try:
        tenant = resolve(attempt.gateway.restaurant_slug, attempt.gateway.venue_slug)
        result = client_for(tenant, OdooClient).call_kw('waiter.reservation', 'waiter_deposit_paid',
            [attempt.reservation_token, attempt.amount_in_cents, attempt.reference])
        PaymentAttempt.objects.filter(id=attempt.id).update(reconciled=bool(result.get('paid')), needs_review=not result.get('paid'))
    except (OdooError, Problem):
        PaymentAttempt.objects.filter(id=attempt.id).update(needs_review=True)
    attempt.refresh_from_db()
    return attempt


def reconcile(attempt):
    if attempt.status != 'APPROVED' or attempt.reconciled or attempt.gateway.environment == 'test':
        return attempt
    if attempt.reservation_token:
        return reconcile_reservation(attempt)
    try:
        tenant = resolve(attempt.session.restaurant_slug, attempt.session.venue_slug, attempt.session.table_token)
        result = client_for(tenant, OdooClient).call_kw('pos.order', 'waiter_gateway_paid', [[attempt.order.odoo_order_id],
            attempt.payment_method_id, attempt.amount_in_cents, attempt.reference])
        if result.get('paid'):
            PaymentAttempt.objects.filter(id=attempt.id).update(reconciled=True, needs_review=False)
            if attempt.order.requires_payment:
                from experience_app.models import DinerAccount
                Order.objects.filter(id=attempt.order_id).update(state=Order.SENT, sent_at=timezone.now())
                DinerAccount.objects.filter(discount_order=attempt.order, discount_used_at=None).update(discount_used_at=timezone.now())
                from experience_app.services import rewards
                rewards.use_reserved(attempt.order)
            else:
                close_paid(attempt.session)
        else:
            PaymentAttempt.objects.filter(id=attempt.id).update(needs_review=True)
    except (OdooError, Problem):
        PaymentAttempt.objects.filter(id=attempt.id).update(needs_review=True)
    attempt.refresh_from_db()
    return attempt


def apply_remote(attempt, remote):
    if (remote.get('reference') != attempt.reference or remote.get('currency') != 'COP'
            or type(remote.get('amount_in_cents')) is not int or remote['amount_in_cents'] != attempt.amount_in_cents
            or remote.get('id') != attempt.provider_id or remote.get('payment_method_type') != attempt.method):
        raise PaymentConflict('La transacción no coincide con la cuenta. Solicita revisión al restaurante.')
    status = remote.get('status')
    if status not in ['PENDING', *FINAL]:
        raise PaymentUnavailable()
    qr, redirect = PROVIDERS[attempt.gateway.provider].safe_extras(remote)
    challenge, brand = PROVIDERS[attempt.gateway.provider].challenge(remote)
    with transaction.atomic():
        locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
        # Late PENDING/replayed events must not undo approval or a terminal response.
        if locked.status not in TERMINAL or (locked.status == 'APPROVED' and status == 'VOIDED'):
            locked.status = status
            locked.qr_image, locked.redirect_url = qr, redirect
            locked.challenge_html, locked.card_brand = challenge, brand
            if status == 'VOIDED':
                locked.needs_review = True
            locked.save()
    locked.gateway = attempt.gateway
    if locked.status == 'APPROVED' and locked.diner_id:
        from experience_app.services import rewards
        rewards.sync_for_diner(locked.diner)
    return reconcile(locked)


def refresh(attempt, force=False):
    if not attempt.provider_id:
        return attempt
    now = timezone.now()
    # DB compare-and-swap avoids a provider request per browser poll/tab.
    query = PaymentAttempt.objects.filter(id=attempt.id)
    if not force:
        from django.db.models import Q
        query = query.filter(Q(checked_at=None) | Q(checked_at__lt=now - timedelta(seconds=4)))
    if not query.update(checked_at=now):
        attempt.refresh_from_db()
        return attempt
    remote = PROVIDERS[attempt.gateway.provider].read(attempt.gateway.environment, decrypt(attempt.credentials_cipher), attempt.provider_id)
    return apply_remote(attempt, remote)


def webhook(event, restaurant, venue, environment):
    try:
        if event.get('event') != 'transaction.updated' or event.get('environment') != environment:
            return Response(status=400)
        remote = event['data']['transaction']
        reference = remote['reference']
        if not isinstance(reference, str) or not reference.startswith('waiter-'):
            return Response(status=200)
        attempt_id = uuid.UUID(hex=reference[7:])
    except (KeyError, TypeError, ValueError):
        return Response(status=400)
    attempt = PaymentAttempt.objects.select_related('gateway', 'session', 'order').filter(id=attempt_id,
        gateway__restaurant_slug=restaurant, gateway__venue_slug=venue, gateway__environment=environment, gateway__provider='wompi').first()
    if not attempt:
        return Response(status=200)
    credentials = decrypt(attempt.credentials_cipher)
    provider = PROVIDERS['wompi']
    if not provider.verified_event(event, credentials['events']):
        return Response(status=403)
    # Reference/currency may not be signed by Wompi: read back by signed ID before assigning to an attempt.
    verified = provider.read(environment, credentials, remote['id'])
    if verified.get('reference') != attempt.reference:
        return Response(status=403)
    if attempt.provider_id and attempt.provider_id != verified.get('id'):
        return Response(status=409)
    PaymentAttempt.objects.filter(id=attempt.id, provider_id='').update(provider_id=verified['id'])
    attempt.refresh_from_db()
    apply_remote(attempt, verified)
    return Response(status=200)
