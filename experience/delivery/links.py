"""Enlaces de treinta minutos: capacidad firmada, ligada a una conversación y de un solo uso."""
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from experience_app.views.internal import key_is_valid
from experience_app.adapters.core.pos import organization
from sales.services import text
from tenancy.http import require, payload
from whatsapp.models import WhatsAppConversation
from whatsapp.services import available, window_open
from .api import DinerView
from .models import DeliveryLink
from .coverage import coordinates

SALT = 'delivery.ubicacion.v1'


def create_link(conversation, restaurant):
    require(conversation.account.organization_id == restaurant.organization_id and
            (conversation.account.restaurant_id is None or conversation.account.restaurant_id == restaurant.pk),
            'No encontramos la conversación.', 'not_found', 404)
    available(conversation.account)
    require(window_open(conversation), 'Escriba de nuevo por WhatsApp para continuar.', 'window_closed', 409)
    DeliveryLink.objects.filter(conversation=conversation, used_at=None).update(expires_at=timezone.now())
    row = DeliveryLink.objects.create(conversation=conversation, restaurant=restaurant, nonce=secrets.token_hex(32), expires_at=timezone.now() + timedelta(minutes=30))
    token = signing.dumps({'id': row.pk, 'conversation': conversation.pk, 'nonce': row.nonce}, salt=SALT)
    return {'token': token, 'url': f'{settings.DINER_PUBLIC_URL}/{restaurant.organization.slug}/domicilio/ubicar?token={token}', 'expires_at': row.expires_at.isoformat()}


def resolve_link(token, lock=False):
    try:
        data = signing.loads(token, salt=SALT, max_age=1800)
    except signing.BadSignature:
        require(False, 'El enlace venció o no es válido. Solicite uno nuevo por WhatsApp.', 'invalid_delivery_link', 404)
    query = DeliveryLink.objects.select_for_update() if lock else DeliveryLink.objects
    row = query.select_related('conversation__account__organization', 'restaurant__organization').filter(
        pk=data.get('id'), conversation_id=data.get('conversation'), nonce=data.get('nonce'), expires_at__gt=timezone.now()).first()
    require(row and row.conversation.account.organization_id == row.restaurant.organization_id and
            (row.conversation.account.restaurant_id is None or row.conversation.account.restaurant_id == row.restaurant_id),
            'El enlace venció o no es válido. Solicite uno nuevo por WhatsApp.', 'invalid_delivery_link', 404)
    available(row.conversation.account)
    require(row.restaurant.active and window_open(row.conversation), 'Escriba de nuevo por WhatsApp para continuar.', 'window_closed', 409)
    return row


class LinkView(DinerView):
    def post(self, request, rest):
        require(key_is_valid(request), 'La clave interna no es válida.', 'unauthorized', 401)
        org = organization(rest)
        data = payload(request.data, ('conversation_id', 'sede'), ('conversation_id',))
        require(type(data['conversation_id']) is int, 'Indique una conversación válida.', 'invalid_data', 400)
        conversation = WhatsAppConversation.objects.select_related('account__organization').filter(pk=data['conversation_id'], account__organization=org).first()
        require(conversation, 'No encontramos la conversación.', 'not_found', 404)
        restaurant = org.restaurants.filter(active=True, slug=data['sede']).first() if data.get('sede') else conversation.account.restaurant or org.restaurants.filter(active=True).first()
        require(restaurant, 'No encontramos la sede.', 'not_found', 404)
        with transaction.atomic():
            WhatsAppConversation.objects.select_for_update().get(pk=conversation.pk)
            return Response(create_link(conversation, restaurant), status=201)


class LocateView(DinerView):
    def get(self, request, token):
        row = resolve_link(token)
        return Response({'restaurante': row.restaurant.organization.slug, 'sede': {'slug': row.restaurant.slug, 'nombre': row.restaurant.name},
                         'expires_at': row.expires_at.isoformat(), 'usado': row.used_at is not None})

    def post(self, request, token):
        from assistant.engine import handle
        from whatsapp.processing import send_reply
        data = payload(request.data, ('lat', 'lng', 'direccion', 'indicaciones'), ('lat', 'lng', 'direccion'))
        lat, lng = coordinates(data['lat'], data['lng'])
        address, details = text(data['direccion'], 300, True), text(data.get('indicaciones', ''), 200)
        with transaction.atomic():
            row = resolve_link(token, True)
            require(row.used_at is None, 'Ya recibimos esta ubicación. Solicite otro enlace para cambiarla.', 'delivery_link_used', 409)
            reply = handle('whatsapp', row.restaurant, row.conversation.wa_id, action={'type': 'location', 'lat': str(lat), 'lng': str(lng), 'address': address, 'details': details})
            send_reply(row.conversation, reply)
            row.used_at = timezone.now()
            row.result = reply.delivery.get('quote', {})
            row.save(update_fields=['used_at', 'result'])
        return Response({'ok': True, 'cotizacion': row.result})


class PayView(DinerView):
    """Plan D · El enlace de pago de un pedido hecho por WhatsApp: abre la visita en este navegador para pagarla."""
    def get(self, request, token):
        from experience_app.models import Diner
        from experience_app.views.sessions import COOKIE, COOKIE_MAX_AGE
        from .assistant import PAY_SALT
        try:
            data = signing.loads(token, salt=PAY_SALT, max_age=7200)
        except signing.BadSignature:
            require(False, 'El enlace de pago venció. Escríbanos por WhatsApp para enviarle uno nuevo.', 'invalid_pay_link', 404)
        diner = Diner.objects.select_related('session').filter(pk=data.get('diner'), session_id=data.get('session')).first()
        require(diner, 'El enlace de pago venció. Escríbanos por WhatsApp para enviarle uno nuevo.', 'invalid_pay_link', 404)
        response = Response({'restaurante': diner.session.restaurant_slug, 'sede': diner.session.venue_slug})
        response.set_cookie(COOKIE, diner.key, max_age=COOKIE_MAX_AGE, httponly=True, secure=settings.IS_PRODUCTION, samesite='Lax', path='/api/v1/')
        return response
