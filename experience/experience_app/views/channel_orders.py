"""API exclusiva para el backend del canal; nunca entregar la clave interna al navegador o al modelo."""
from experience_app.adapters.backend import backend_for, client_for
from functools import wraps

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient, OdooError, OdooUnavailable
from experience_app.adapters.registry.client import resolve
from experience_app.models import ChannelOrder
from experience_app.services import channel_orders
from experience_app.views.internal import INVALID_KEY, key_is_valid


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) - set(self.fields):
            raise serializers.ValidationError({'non_field_errors': ['Datos o campos no admitidos.']})
        return super().to_internal_value(data)


class CustomerSerializer(StrictSerializer):
    nombre = serializers.CharField(max_length=100)
    telefono = serializers.RegexField(r'^\+[1-9][0-9]{7,14}$', max_length=16)


class LineSerializer(StrictSerializer):
    producto = serializers.IntegerField(min_value=1)
    cantidad = serializers.IntegerField(min_value=1, max_value=50)
    nota = serializers.CharField(max_length=500, allow_blank=True, default='')


class OrderSerializer(StrictSerializer):
    idempotencia = serializers.UUIDField()
    cliente = CustomerSerializer()
    lineas = LineSerializer(many=True, allow_empty=False, max_length=30)


class ConfirmSerializer(StrictSerializer):
    cotizacion = serializers.RegexField(r'^[a-f0-9]{64}$')
    confirmado = serializers.BooleanField()


def internal_endpoint(fn):
    @wraps(fn)
    def wrapped(request, *args, **kwargs):
        if not key_is_valid(request):
            return Response(INVALID_KEY, status=401)
        try:
            if hasattr(backend_for(kwargs.get('restaurant', '')), 'Client'):
                resolve(kwargs['restaurant'], kwargs['venue'])
            return fn(request, *args, **kwargs)
        except OdooUnavailable:
            return Response({'detail': 'El POS no responde. Conserva la referencia y reintenta.'}, status=503)
        except OdooError as exc:
            if exc.data.get('name') in {'odoo.exceptions.UserError', 'odoo.exceptions.ValidationError'}:
                return Response({'detail': str(exc)}, status=409)
            return Response({'detail': 'No se pudo procesar el pedido en el POS.'}, status=502)
    return wrapped


@api_view(['GET'])
@internal_endpoint
def menu(request, restaurant, venue):
    tenant = resolve(restaurant, venue)
    client = client_for(tenant, OdooClient)
    sessions = client.call_kw('pos.session', 'search_read', [
        [['config_id', '=', tenant.config_id], ['state', '=', 'opened']], ['id']], {'limit': 1})
    if not sessions:
        return Response({'detail': 'Abre la caja del POS para recibir pedidos de WhatsApp.'}, status=409)
    catalog = backend_for(tenant.restaurant_slug).load_catalog(client, sessions[0]['id'])
    return Response({'productos': [{'id': p.id, 'nombre': p.name, 'precio_orientativo': p.final_price,
                                   'agotado': p.sold_out, 'descripcion': p.description,
                                   'ingredientes': p.attributes.get('ingredientes', [])} for p in catalog.products],
                     'nota': 'Cotiza el pedido para obtener el precio definitivo del tipo para recoger.'})


@api_view(['POST'])
@internal_endpoint
def create(request, restaurant, venue):
    body = OrderSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    order, created = channel_orders.create(restaurant, venue, body.validated_data)
    return Response(channel_orders.representation(order), status=201 if created else 200)


def _get(restaurant, venue, order_id):
    return get_object_or_404(ChannelOrder, id=order_id, restaurant_slug=restaurant, venue_slug=venue)


@api_view(['GET'])
@internal_endpoint
def detail(request, restaurant, venue, order_id):
    order = _get(restaurant, venue, order_id)
    return Response({**channel_orders.representation(order), 'estado': channel_orders.status(order)})


@api_view(['POST'])
@internal_endpoint
def confirm(request, restaurant, venue, order_id):
    body = ConfirmSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    if not body.validated_data['confirmado']:
        return Response({'detail': 'Falta la confirmación del cliente.'}, status=400)
    order = channel_orders.confirm(_get(restaurant, venue, order_id), body.validated_data['cotizacion'])
    return Response(channel_orders.representation(order))
