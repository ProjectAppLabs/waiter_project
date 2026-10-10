"""Autorización expresa, identidad del cliente y direcciones privadas."""
import re
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from tenancy.http import require, model_dict
from tenancy.models import Organization
from .models import Customer, CustomerAddress, CustomerDinerIdentity, CustomerCookieIdentity

POLICY_VERSION = '2026-10-09'


def phone(value, required=True):
    digits = re.sub(r'[ ()+-]', '', value) if isinstance(value, str) else ''
    if re.fullmatch(r'(?:3[0-9]{9}|60[1-8][0-9]{7})', digits):
        digits = '57' + digits
    valid = bool(re.fullmatch(r'57(?:3[0-9]{9}|60[1-8][0-9]{7})', digits))
    require(valid or not required, 'Por favor, indique un teléfono colombiano válido.', 'invalid_phone', 400)
    return '+' + digits if valid else None


def consented(customer):
    return bool(customer and customer.data_consent_at and (not customer.data_consent_revoked_at or customer.data_consent_at > customer.data_consent_revoked_at))


def consent_dict(customer):
    return {'active': consented(customer), **model_dict(customer, (
        'data_consent_at', 'data_consent_channel', 'data_consent_version', 'data_consent_revoked_at'))}


def address_dict(row):
    return model_dict(row, ('id', 'label', 'text', 'details', 'latitude', 'longitude', 'place_id', 'last_used_at', 'created_at'))


def customer_for_diner(org, diner):
    # La cookie autentica la cuenta; un teléfono escrito en el formulario no prueba su titularidad.
    cookie = CustomerCookieIdentity.objects.filter(organization=org, key=diner.benefit_key).select_related('customer').first()
    if cookie:
        return cookie.customer
    if not diner.account_id or not diner.account.verified or diner.account.organization_slug != org.slug:
        return None
    identity = CustomerDinerIdentity.objects.filter(organization=org, key=diner.account_id).select_related('customer').first()
    return identity.customer if identity else Customer.objects.filter(organization=org, diner_key=diner.account_id).first()



@transaction.atomic
def authorize(org, number, name, channel, diner=None):
    Organization.objects.select_for_update().get(pk=org.pk)
    normalized = phone(number)
    by_key = customer_for_diner(org, diner) if diner else None
    customer = Customer.objects.filter(organization=org, normalized_phone=normalized).first()
    if customer and by_key and customer.pk != by_key.pk:
        # Un teléfono escrito no puede transferir la identidad de una cuenta a otro cliente.
        by_key = None
    customer = customer or by_key or Customer(organization=org, name=name)
    new = customer.pk is None
    customer.phone, customer.normalized_phone = normalized, normalized
    customer.data_consent_at, customer.data_consent_channel = timezone.now(), channel
    customer.data_consent_version = POLICY_VERSION
    customer.data_consent_revoked_at = None
    # Solo una cuenta ya vinculada o el alta de un teléfono nuevo adquiere acceso a sus direcciones.
    if diner and diner.account_id and diner.account.verified and (new or by_key):
        if not customer.diner_key:
            customer.diner_key = diner.account_id
    customer.save()
    if diner and (new or by_key):
        CustomerCookieIdentity.objects.update_or_create(organization=org, key=diner.benefit_key, defaults={'customer': customer})
    if diner and diner.account_id and diner.account.verified and (new or by_key):
        CustomerDinerIdentity.objects.update_or_create(organization=org, key=diner.account_id, defaults={'customer': customer})
    return customer


@transaction.atomic
def save_address(customer, data, address_id=None):
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    require(consented(customer), 'Para guardar una dirección necesitamos su autorización.', 'consent_required', 400)
    row = customer.addresses.filter(pk=address_id).first() if address_id else customer.addresses.filter(
        latitude=data['latitude'], longitude=data['longitude'], text=data['text']).first()
    require(not address_id or row, 'No encontramos la dirección.', 'not_found', 404)
    if row is None:
        require(customer.addresses.count() < 10, 'Puede guardar hasta diez direcciones. Elimine una antes de agregar otra.', 'address_limit', 409)
        row = CustomerAddress(customer=customer)
    for key, value in data.items():
        setattr(row, key, value)
    row.last_used_at = timezone.now()
    row.full_clean()
    row.save()
    return row


@transaction.atomic
def revoke(customer):
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    customer.addresses.all().delete()
    customer.data_consent_revoked_at = timezone.now()
    customer.save(update_fields=['data_consent_revoked_at'])


def insights(customer, restaurants=None):
    """RFM fijo: r=5/4/3/2/1 hasta 7/30/60/90/más días; f hasta 1/2/4/9/10+ pedidos;
    m hasta 50k/100k/250k/500k/más pesos. Segmento: nuevo (un pedido y ≤30 días), perdido (>90),
    en_riesgo (>60), fiel (≥5 y ≤30); los demás ocasional. Frecuencia: días entre extremos/(n−1).
    Horas y días corresponden a la zona de la organización; lunes=0. Solo ventas pagadas.
    """
    from sales.models import Order, OrderLine
    from django.db.models import Prefetch
    orders = Order.objects.filter(organization=customer.organization, customer=customer, state='paid').order_by('paid_at', 'id')
    if restaurants is not None:
        orders = orders.filter(restaurant__in=restaurants)
    orders = list(orders.prefetch_related(Prefetch('lines', queryset=OrderLine.objects.filter(cancelled=False, parent=None).exclude(product__kind='service'))))
    n = len(orders)
    total = sum((o.total for o in orders), Decimal(0))
    moments = [o.paid_at or o.created_at for o in orders]
    hours, weekdays, channels, products = {str(h): 0 for h in range(24)}, {str(d): 0 for d in range(7)}, dict.fromkeys(('pos', 'menu', 'whatsapp'), 0), {}
    for order, moment in zip(orders, moments):
        local = moment.astimezone(ZoneInfo(customer.organization.timezone))
        hours[str(local.hour)] += 1
        weekdays[str(local.weekday())] += 1
        channels[order.channel] = channels.get(order.channel, 0) + 1
        for line in order.lines.all():
            item = products.setdefault(line.product_id, {'product_id': line.product_id, 'name': line.name, 'qty': Decimal(0)})
            item['qty'] += line.qty
    days = (timezone.now() - max(moments)).days if moments else None
    segment = ('nuevo' if n <= 1 and (days is None or days <= 30) else 'perdido' if days > 90 else
               'en_riesgo' if days > 60 else 'fiel' if n >= 5 and days <= 30 else 'ocasional')
    return {'orders': n, 'total_spent': float(total), 'avg_ticket': float((total / n).quantize(Decimal('.01'))) if n else 0,
            'first_order_at': min(moments).isoformat() if moments else None, 'last_order_at': max(moments).isoformat() if moments else None,
            'frequency_days': float((Decimal(str((max(moments) - min(moments)).total_seconds())) / 86400 / (n - 1)).quantize(Decimal('.01'))) if n > 1 else None,
            'hours': hours, 'weekdays': weekdays, 'channels': channels,
            'top_products': [{**p, 'qty': float(p['qty'])} for p in sorted(products.values(), key=lambda p: (-p['qty'], p['product_id']))[:10]],
            'rfm': {'r': 5 - sum(days > d for d in (7, 30, 60, 90)) if days is not None else 0,
                    'f': 1 + sum(n > d for d in (1, 2, 4, 9)) if n else 0,
                    'm': 1 + sum(total > d for d in (50000, 100000, 250000, 500000)) if n else 0, 'segment': segment}}
