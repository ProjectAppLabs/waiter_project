"""Validación de ajustes y datos operativos del domicilio."""
from decimal import Decimal
from uuid import UUID, uuid5

from django.db import transaction
from catalog.models import Product
from catalog.services import writing
from sales.models import OrderLine
from sales.services import text, recalculate
from tenancy.http import require, payload, model_dict
from loyalty import delivery as crm
from .coverage import METHODS, coordinates, decimal, quote_session
from .models import DeliverySettings, SessionDelivery


def settings_dict(row):
    return {**model_dict(row, ('enabled', 'radius_km', 'min_order', 'methods', 'notes')),
            'tiers': [{'up_to_km': float(Decimal(str(t['up_to_km']))), 'fee': float(Decimal(str(t['fee'])))} for t in row.tiers]}


def save_settings(restaurant, raw):
    data = payload(raw, ('enabled', 'radius_km', 'tiers', 'min_order', 'methods', 'notes'), ('enabled', 'radius_km', 'tiers', 'min_order', 'methods'))
    require(type(data['enabled']) is bool, 'Indique si el domicilio está activo.', 'invalid_data', 400)
    require(not data['enabled'] or restaurant.latitude is not None and restaurant.longitude is not None,
            'Ubique primero la sede en el mapa para activar domicilios.', 'location_required', 400)
    if data['enabled']:
        coordinates(restaurant.latitude, restaurant.longitude)
    radius = decimal(data['radius_km'], Decimal('.01'), 50, 2)
    tiers = data['tiers']
    require(isinstance(tiers, list) and 1 <= len(tiers) <= 50, 'Indique los tramos del envío.', 'invalid_data', 400)
    clean, previous = [], Decimal(0)
    for tier in tiers:
        tier = payload(tier, ('up_to_km', 'fee'), ('up_to_km', 'fee'))
        limit, fee = decimal(tier['up_to_km'], Decimal('.01'), 50, 2), decimal(tier['fee'], places=2)
        require(limit > previous, 'Ordene los tramos de menor a mayor distancia.', 'invalid_data', 400)
        clean.append({'up_to_km': str(limit), 'fee': str(fee)})
        previous = limit
    require(previous >= radius, 'El último tramo debe cubrir todo el radio.', 'invalid_data', 400)
    methods = data['methods']
    require(isinstance(methods, list) and methods and all(m in METHODS for m in methods) and len(set(methods)) == len(methods),
            'Elija al menos un método de pago válido.', 'invalid_data', 400)
    row, _ = DeliverySettings.objects.update_or_create(restaurant=restaurant, defaults={
        'enabled': data['enabled'], 'radius_km': radius, 'tiers': clean, 'min_order': decimal(data['min_order'], places=2),
        'methods': methods, 'notes': text(data.get('notes', ''), 200)})
    return row


def delivery_dict(row, quote=None):
    if quote is None and row.session.orders.exists():
        from tenancy.models import Restaurant
        restaurant = Restaurant.objects.get(organization__slug=row.session.restaurant_slug, slug=row.session.venue_slug)
        config = DeliverySettings.objects.filter(restaurant=restaurant).first()
        quote = {'envio': row.fee, 'distancia_km': row.distance_km,
                 'sede': {'slug': restaurant.slug, 'nombre': restaurant.name},
                 'metodos': [row.payment] if row.payment else [], 'minimo': config.min_order if config else Decimal(0),
                 'nota': config.notes if config else ''}
    quote = quote or quote_session(row.session, row.latitude, row.longitude)
    return {'lat': float(row.latitude), 'lng': float(row.longitude), 'direccion': row.address, 'indicaciones': row.details,
            'telefono': row.phone, 'nombre': row.name, **{k: float(v) if isinstance(v, Decimal) else v for k, v in quote.items() if k != 'cobertura'}}


@transaction.atomic
def set_delivery(session, diner, raw):
    from experience_app.models import TableSession
    from experience_app.services.online_payments import ACTIVE
    from tenancy.models import Organization
    org = Organization.objects.get(slug=session.restaurant_slug)
    with writing(org, operational=True):
        session = TableSession.objects.select_for_update().get(pk=session.pk)
        require(session.is_delivery and session.state in TableSession.OPEN_STATES, 'El domicilio necesita una visita sin mesa.', 'invalid_session', 409)
        require(not session.confirming and not session.orders.exists() and not session.payments.filter(status__in=ACTIVE).exists(),
                'El pedido ya está confirmado. No podemos cambiar la entrega.', 'not_editable', 409)
        data = payload(raw, ('lat', 'lng', 'direccion', 'indicaciones', 'telefono', 'nombre', 'etiqueta', 'direccion_id', 'guardar', 'acepta_datos', 'place_id'),
                       ('lat', 'lng', 'direccion', 'telefono', 'nombre', 'guardar', 'acepta_datos'))
        require(type(data['guardar']) is bool and type(data['acepta_datos']) is bool, 'Revise la autorización de datos.', 'invalid_data', 400)
        lat, lng = coordinates(data['lat'], data['lng'])
        result = quote_session(session, lat, lng)
        number = crm.phone(data['telefono'])
        address, details, name = text(data['direccion'], 300, True), text(data.get('indicaciones', ''), 200), text(data['nombre'], 120, True)
        require(len(' · '.join(filter(None, (address, details)))) <= 500, 'La dirección y las indicaciones juntas admiten hasta 500 caracteres.', 'invalid_data', 400)
        label = text(data.get('etiqueta', 'Casa'), 60, True)
        customer = crm.customer_for_diner(org, diner)
        if customer and customer.normalized_phone not in (None, number):
            customer = None
        if data.get('direccion_id') is not None:
            require(type(data['direccion_id']) is int and customer and crm.consented(customer) and customer.addresses.filter(pk=data['direccion_id']).exists(),
                    'No encontramos la dirección.', 'not_found', 404)
        require(not data['guardar'] or data['acepta_datos'] or crm.consented(customer),
                'Para guardar la dirección necesitamos su autorización.', 'consent_required', 400)
        if data['acepta_datos']:
            customer = crm.authorize(org, number, name, 'menu', diner)
        if not crm.consented(customer):
            customer = None
        if data['guardar']:
            place_id = data.get('place_id') if isinstance(data.get('place_id'), str) and len(data['place_id']) <= 255 else ''
            crm.save_address(customer, {'label': label, 'text': address, 'details': details, 'latitude': lat, 'longitude': lng, 'place_id': place_id}, data.get('direccion_id'))
        row, _ = SessionDelivery.objects.update_or_create(session=session, defaults={'diner': diner, 'customer': customer,
            'latitude': lat, 'longitude': lng, 'address': address, 'details': details, 'phone': number, 'name': name,
            'fee': result['envio'], 'distance_km': result['distancia_km']})
        return row, result


def prepare(session, payment):
    row = SessionDelivery.objects.select_for_update().filter(session=session).first()
    require(row, 'Indique la ubicación de entrega antes de confirmar su domicilio.', 'delivery_required', 400)
    if row.payment and session.orders.exists():
        require(payment == row.payment, 'El método de pago ya quedó confirmado.', 'not_editable', 409)
        result = delivery_dict(row)
        result['envio'], result['minimo'] = row.fee, Decimal(str(result['minimo']))
        return row, result
    result = quote_session(session, row.latitude, row.longitude)
    require(payment in result['metodos'], 'Elija uno de los métodos de pago disponibles para domicilio.', 'invalid_payment_method', 400)
    row.fee, row.distance_km, row.payment = result['envio'], result['distancia_km'], payment
    row.save(update_fields=['fee', 'distance_km', 'payment'])
    return row, result


def apply_order(order, row, minimum):
    from sales.services import editable
    editable(order)
    food = sum((l.total for l in order.lines.exclude(product__kind='service').filter(cancelled=False)), Decimal(0))
    require(food >= minimum, f'El pedido mínimo para domicilio es de $ {minimum:,.0f}, sin incluir el envío.', 'minimum_order', 400)
    # El bloqueo de organización del adaptador serializa la creación del producto de sistema.
    product, _ = Product.objects.get_or_create(organization=order.organization, kind='service', name='Domicilio',
        defaults={'price': 0, 'available_in_pos': False, 'track_stock': False})
    order.service = 'delivery'
    order.customer_name, order.delivery_phone = row.name, row.phone
    order.delivery_address = ' · '.join(filter(None, (row.address, row.details)))
    order.delivery_details, order.delivery_lat, order.delivery_lng = row.details, row.latitude, row.longitude
    order.delivery_fee, order.delivery_distance_km, order.delivery_payment = row.fee, row.distance_km, row.payment
    order.customer = row.customer if crm.consented(row.customer) else None
    OrderLine.objects.update_or_create(order=order, uuid=uuid5(UUID(str(order.uuid)), 'domicilio'), defaults={
        'product': product, 'name': 'Domicilio', 'qty': 1, 'unit_price': row.fee, 'subtotal': row.fee, 'total': row.fee,
        'taxes': [], 'stock_usage': []})
    recalculate(order)
