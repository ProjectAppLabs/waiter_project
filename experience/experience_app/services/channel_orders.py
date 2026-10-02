"""Puente interno de WhatsApp al motor operativo. Sin mensajes externos ni llamadas a IA."""
from experience_app.adapters.backend import backend_for, client_for
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient
from experience_app.adapters.registry.client import resolve
from experience_app.models import ChannelOrder


class OrderConflict(APIException):
    status_code = 409
    default_detail = 'La referencia ya se utilizó con otro pedido. Usa una nueva para cambiar el resumen.'


def create(restaurant, venue, data):
    lookup = {'restaurant_slug': restaurant, 'venue_slug': venue, 'idempotency_key': data['idempotencia']}
    existing = ChannelOrder.objects.filter(**lookup).first()
    if existing:
        return _same_request(existing, data), False
    tenant = resolve(restaurant, venue)
    quote = client_for(tenant, OdooClient).call_kw('pos.order', 'waiter_whatsapp_quote',
                                          [tenant.config_id, data['lineas']])
    try:
        with transaction.atomic():
            order = ChannelOrder.objects.create(**lookup, customer=data['cliente'], lines=data['lineas'],
                                                quote=quote, expires_at=timezone.now() + timedelta(minutes=10))
    except IntegrityError:
        return _same_request(ChannelOrder.objects.get(**lookup), data), False
    return order, True


def _same_request(order, data):
    if order.customer != data['cliente'] or order.lines != data['lineas']:
        raise OrderConflict()
    return order


def confirm(order, quote):
    if quote != order.quote['cotizacion']:
        raise OrderConflict('Confirma exactamente el resumen que recibió el cliente.')
    if order.result is not None:
        return order
    tenant = resolve(order.restaurant_slug, order.venue_slug)
    # Una sola transacción RPC crea pedido + comanda. El UUID remoto sobrevive a timeouts,
    # reinicios y pagos posteriores; Odoo comprueba caducidad solo si todavía no existe.
    result = client_for(tenant, OdooClient).call_kw('pos.order', 'waiter_whatsapp_confirm', [
        tenant.config_id, str(order.id), order.lines, order.customer, quote,
        order.expires_at.strftime('%Y-%m-%d %H:%M:%S'),
    ])
    order.result = result
    order.save(update_fields=['result'])
    return order


def status(order):
    if order.result is None:
        return 'borrador'
    tenant = resolve(order.restaurant_slug, order.venue_slug)
    remote = backend_for(tenant.restaurant_slug).read_order_status(client_for(tenant, OdooClient), order.result['id'])
    if remote.state in {'paid', 'done', 'invoiced'}:
        return 'pagado'
    if remote.state == 'cancel':
        return 'cancelado'
    return {'none': 'enviado', 'received': 'enviado', 'cooking': 'en_cocina',
            'ready': 'listo', 'served': 'entregado'}[remote.kitchen]


def representation(order):
    return {'id': str(order.id), 'canal': 'whatsapp', 'modalidad': 'recoger',
            'cliente': order.customer, 'resumen': order.quote, 'vence': order.expires_at.isoformat(),
            'estado': 'enviado' if order.result else 'borrador', 'pedido_pos': order.result}
