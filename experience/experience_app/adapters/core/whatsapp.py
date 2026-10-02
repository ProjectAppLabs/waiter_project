"""Cotizaciones sin escritura y confirmación atómica para recoger por WhatsApp."""
import hashlib
import json
import re
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from uuid import UUID, uuid5

from django.utils import timezone
from catalog.reading import CatalogData
from catalog.services import valid
from sales import services as sales
from sales.models import Order
from tenancy.http import require
from . import pos


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def quote(client, lines):
    pos.ensure_open_session(client, client.restaurant.pk)
    valid(isinstance(lines, list) and 1 <= len(lines) <= 30, 'El pedido debe tener entre 1 y 30 líneas.')
    data = CatalogData(client.organization, [client.restaurant])
    result, total, tax = [], Decimal(0), Decimal(0)
    for line in lines:
        valid(isinstance(line, dict) and not set(line)-{'producto', 'cantidad', 'nota'})
        pid, qty, note = line.get('producto'), line.get('cantidad'), line.get('nota', '')
        valid(type(pid) is int and type(qty) is int and 1 <= qty <= 50 and isinstance(note, str) and len(note) <= 500)
        p = data.products.get(pid)
        require(p and p.kind == 'dish' and not data.sold_out(pid, client.restaurant.pk),
                'El producto no está disponible en la carta.', 'unavailable', 400)
        valid(not p.diner_attributes.get('combo') and not p.diner_attributes.get('tamanos'),
              'Este producto requiere opciones; debe atenderlo el personal.')
        servings = data.servings(pid, client.restaurant.pk)
        require(servings is None or servings >= qty, 'No hay existencias suficientes del producto.', 'unavailable', 400)
        for ingredient, needed in data.requirements(pid).items():
            data.pending[(client.restaurant.pk, ingredient)] += needed * qty
        taxes = list(p.taxes.all())
        price = data.prices.get((client.restaurant.pk, pid), p.price)
        excluded = 1 + sum((t.amount/100 for t in taxes if not t.included), Decimal(0))
        included = 1 + sum((t.amount/100 for t in taxes if t.included), Decimal(0))
        unit = sales.rounded(price * excluded)
        amount = sales.rounded(unit * qty)
        total += amount
        tax += amount - sales.rounded(amount / excluded / included)
        result.append({'producto': pid, 'nombre': p.name, 'cantidad': qty, 'nota': note.strip(),
                       'precio_base': float(unit), 'total': float(amount)})
    summary = {'moneda': 'COP', 'total': float(total), 'impuestos': float(tax), 'lineas': result}
    return {**summary, 'cotizacion': digest(summary)}


def confirm(client, uid, lines, customer, fingerprint, expires):
    valid(isinstance(customer, dict) and set(customer) == {'nombre', 'telefono'})
    valid(isinstance(customer['nombre'], str) and 1 <= len(customer['nombre'].strip()) <= 100)
    valid(isinstance(customer['telefono'], str) and re.fullmatch(r'\+[1-9][0-9]{7,14}', customer['telefono']))
    uid = sales.uuid_value(uid)
    request_hash = digest([client.restaurant.pk, lines, customer, fingerprint, expires])
    with sales.writing(client.organization, client.restaurant):
        existing = Order.objects.filter(organization=client.organization, uuid=uid).first()
        if existing:
            require(existing.restaurant_id == client.restaurant.pk and existing.channel_request == request_hash,
                    'La referencia ya pertenece a otro pedido.', 'uuid_conflict', 409)
            return result(existing)
        try:
            expiry = datetime.strptime(expires, '%Y-%m-%d %H:%M:%S').replace(tzinfo=dt_timezone.utc)
        except (ValueError, TypeError):
            valid(False, 'La fecha de vencimiento no es válida.')
        require(expiry > timezone.now(), 'La cotización venció; prepara y confirma un nuevo resumen.', 'quote_expired', 409)
        summary = quote(client, lines)
        require(summary['cotizacion'] == fingerprint, 'La carta cambió; prepara y confirma un nuevo resumen.', 'quote_changed', 409)
        order, _ = sales.create_order(None, {'restaurant_id': client.restaurant.pk, 'uuid': str(uid), 'service': 'takeout',
            'customer_name': customer['nombre'].strip(), 'delivery_phone': customer['telefono'],
            'note': 'Para recoger · Pago pendiente · ' + customer['telefono'], 'fire': False,
            'lines': [{'uuid': str(uuid5(uid, str(i))), 'product_id': line['producto'], 'qty': line['cantidad'],
                       'note': line.get('nota', '')} for i, line in enumerate(lines)]}, restaurant=client.restaurant)
        require(float(order.total) == summary['total'] and float(order.tax) == summary['impuestos'],
                'El total cambió; vuelve a cotizar antes de confirmar.', 'quote_changed', 409)
        order.origin, order.channel, order.channel_request = 'ai', 'whatsapp', request_hash
        order.save(update_fields=['origin', 'channel', 'channel_request'])
        sales.fire(order, None)
        return result(order)


def result(order):
    return {'id': order.pk, 'referencia': order.number, 'estado': order.state, 'pagado': float(order.paid),
            'moneda': 'COP', 'total': float(order.total), 'impuestos': float(order.tax),
            'lineas': [{'producto': l.product_id, 'nombre': l.name, 'cantidad': float(l.qty), 'nota': l.note,
                        'precio_base': float(l.unit_price), 'total': float(l.total)} for l in order.lines.all()]}
