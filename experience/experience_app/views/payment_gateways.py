from django.conf import settings
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from experience_app.adapters.core.pos import resolve
from experience_app.models import PaymentAttempt, PaymentGateway, TableSession
from experience_app.payments import PROVIDERS
from experience_app.services import online_payments, payment_settings
from experience_app.views.channel_orders import StrictSerializer
from experience_app.views.internal import INVALID_KEY, key_is_valid
from experience_app.views.sessions import diner_for


@api_view(['GET', 'PUT', 'POST'])
def configuration(request, restaurant, venue):
    if not key_is_valid(request):
        return Response(INVALID_KEY, status=401)
    if request.method == 'GET':
        result = payment_settings.view(restaurant, venue)
    elif request.method == 'PUT':
        resolve(restaurant, venue)
        try:
            result = payment_settings.save(restaurant, venue, request.data)
        except IntegrityError:
            return Response({'detail': 'Otro administrador cambió la configuración. Actualiza e intenta de nuevo.'}, status=409)
    else:
        if not isinstance(request.data, dict) or set(request.data) != {'environment'} or request.data['environment'] not in ('test', 'prod'):
            raise ValidationError({'detail': 'Ambiente inválido.'})
        config = get_object_or_404(PaymentGateway, restaurant_slug=restaurant, venue_slug=venue, provider='wompi', environment=request.data['environment'])
        merchant = PROVIDERS[config.provider].merchant(config.environment, config.public_key)
        result = {'ok': True, 'name': merchant.get('name', ''), 'methods': merchant.get('accepted_payment_methods', []),
            'detail': 'La llave pública identifica el comercio. Los secretos se verifican al crear y confirmar una transacción.'}
    response = Response(result)
    response['Cache-Control'] = 'no-store'
    return response


class BrowserInfo(StrictSerializer):
    browser_color_depth = serializers.RegexField(r'^\d{1,3}$')
    browser_screen_height = serializers.RegexField(r'^\d{1,5}$')
    browser_screen_width = serializers.RegexField(r'^\d{1,5}$')
    browser_language = serializers.CharField(max_length=30)
    browser_user_agent = serializers.CharField(max_length=600)
    browser_tz = serializers.RegexField(r'^-?\d{1,4}$')


class CreatePayment(StrictSerializer):
    id = serializers.UUIDField()
    expected_amount_in_cents = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(choices=PROVIDERS['wompi'].METHODS)
    email = serializers.EmailField(max_length=254)
    accepted = serializers.BooleanField()
    personal_data_accepted = serializers.BooleanField()
    acceptance_token = serializers.CharField(max_length=4000)
    accept_personal_auth = serializers.CharField(max_length=4000)
    token = serializers.RegexField(r'^tok_(?:test|prod)_[A-Za-z0-9_-]+$', max_length=200, required=False)
    browser_info = BrowserInfo(required=False)
    installments = serializers.IntegerField(min_value=1, max_value=36, default=1)
    phone_number = serializers.RegexField(r'^3\d{9}$', required=False)

    def validate(self, data):
        if not data['accepted'] or not data['personal_data_accepted']:
            raise ValidationError({'detail': 'Debes aceptar las condiciones y el tratamiento de datos para pagar.'})
        if data['method'] == 'CARD' and (not data.get('token') or not data.get('browser_info')):
            raise ValidationError({'detail': 'Falta el token seguro de la tarjeta.'})
        if data['method'] == 'NEQUI' and not data.get('phone_number'):
            raise ValidationError({'detail': 'Ingresa el celular registrado en Nequi.'})
        return data


def owner(request, session_id):
    origin = request.headers.get('Origin')
    if origin and origin.rstrip('/') != settings.DINER_PUBLIC_URL:
        raise PermissionDenied('Origen no permitido.')
    session = get_object_or_404(TableSession, id=session_id)
    return session, diner_for(request, session)


@api_view(['GET', 'POST'])
def payments(request, session_id):
    session, diner = owner(request, session_id)
    if request.method == 'GET':
        result = online_payments.context(session, diner)
    else:
        body = CreatePayment(data=request.data)
        body.is_valid(raise_exception=True)
        result = online_payments.serialize(online_payments.create(session, diner, body.validated_data))
    response = Response(result)
    response['Cache-Control'] = 'no-store'
    return response


@api_view(['GET', 'DELETE'])
def detail(request, session_id, payment_id):
    session, diner = owner(request, session_id)
    attempt = get_object_or_404(PaymentAttempt, id=payment_id, session=session, diner=diner)
    if request.method == 'DELETE':
        if attempt.gateway.environment != 'test' or attempt.status != 'APPROVED':
            raise ValidationError({'detail': 'Solo se puede finalizar una prueba sandbox aprobada.'})
        PaymentAttempt.objects.filter(id=attempt.id, status='APPROVED').update(status='TEST_COMPLETED')
        return Response({'ok': True})
    response = Response(online_payments.serialize(online_payments.refresh(attempt)))
    response['Cache-Control'] = 'no-store'
    return response


@api_view(['POST'])
def webhook(request, restaurant, venue, environment):
    if environment not in ('test', 'prod') or not isinstance(request.data, dict):
        return Response(status=400)
    return online_payments.webhook(request.data, restaurant, venue, environment)


# ---- Anticipo de una reserva: quien tiene el enlace tiene el token; no hay cookie de comensal.
def _origin_ok(request):
    origin = request.headers.get('Origin')
    if origin and origin.rstrip('/') != settings.DINER_PUBLIC_URL:
        raise PermissionDenied('Origen no permitido.')


@api_view(['GET', 'POST'])
def reservation_payments_view(request, restaurant, venue, token):
    from experience_app.services import reservation_payments
    _origin_ok(request)
    if request.method == 'GET':
        result = reservation_payments.context(restaurant, venue, token)
    else:
        body = CreatePayment(data=request.data)
        body.is_valid(raise_exception=True)
        result = online_payments.serialize(reservation_payments.create(restaurant, venue, token, body.validated_data))
    response = Response(result)
    response['Cache-Control'] = 'no-store'
    return response


@api_view(['GET', 'DELETE'])
def reservation_payment_detail(request, restaurant, venue, token, payment_id):
    from experience_app.services import reservation_payments
    _origin_ok(request)
    attempt = get_object_or_404(reservation_payments.attempts(restaurant, venue, token), id=payment_id)
    if request.method == 'DELETE':
        if attempt.gateway.environment != 'test' or attempt.status != 'APPROVED':
            raise ValidationError({'detail': 'Solo se puede finalizar una prueba sandbox aprobada.'})
        PaymentAttempt.objects.filter(id=attempt.id, status='APPROVED').update(status='TEST_COMPLETED')
        return Response({'ok': True})
    response = Response(online_payments.serialize(online_payments.refresh(attempt)))
    response['Cache-Control'] = 'no-store'
    return response
