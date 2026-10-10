"""Contrato de domicilios, cobro y privacidad con proveedores simulados."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import Product, Tax, Unit, Recipe, RecipeLine
from delivery.coverage import quote, distance
from delivery.models import DeliverySettings, SessionDelivery, DeliveryLink
from experience_app.models import Diner, DinerAccount, TableSession, CartLine
from inventory.models import Stock, StockMove
from loyalty.models import Customer, CustomerAddress
from sales.models import CashShift, Order, Payment
from sales.services import seed_restaurant, seed_organization
from tenancy.http import Problem
from tenancy.models import OrganizationAudit, OrganizationModule
from tenancy.tests.helpers import organization, restaurant, account, pos_client

pytestmark = pytest.mark.django_db


@pytest.fixture
# Falla si las pruebas contactan proveedores reales o comparten datos del entorno.
def env(settings, monkeypatch):
    settings.OPENAI_API_KEY = settings.TYPESAFE_API_KEY = ''
    settings.GOOGLE_MAPS_API_KEY = ''
    settings.EXPERIENCE_INTERNAL_KEY = 'clave-interna-de-prueba'
    settings.WA_ACCESS_TOKEN = 'token-simulado'
    settings.WA_TEST_RECIPIENTS = ['573001234567']
    monkeypatch.setattr('requests.sessions.Session.request', Mock(side_effect=AssertionError('Red real prohibida')))
    org = organization(status='active')
    venue = restaurant(org, latitude=4.65, longitude=-74.05)
    owner = account(org)
    seed_restaurant(venue)
    seed_organization(org)
    shift = CashShift.objects.create(restaurant=venue, opened_by=owner)
    product = Product.objects.create(organization=org, kind='dish', name='Sopa', price=20000)
    tax = Tax.objects.create(organization=org, name='INC', amount=8, included=True)
    product.taxes.add(tax)
    unit = Unit.objects.create(organization=org, name='Unidad', root='count', factor=1)
    ingredient = Product.objects.create(organization=org, kind='ingredient', name='Papa', unit=unit)
    recipe = Recipe.objects.create(product=product, yield_qty=1)
    RecipeLine.objects.create(recipe=recipe, ingredient=ingredient, qty=1, unit=unit)
    Stock.objects.create(restaurant=venue, ingredient=ingredient, qty=10)
    config = DeliverySettings.objects.create(restaurant=venue, enabled=True, radius_km=5,
        tiers=[{'up_to_km': '1', 'fee': '3000'}, {'up_to_km': '5', 'fee': '6000'}], min_order=10000,
        methods=['online', 'cash', 'card_on_delivery'])
    session = TableSession.objects.create(restaurant_slug=org.slug, venue_slug=venue.slug)
    diner = Diner.objects.create(session=session)
    CartLine.objects.create(session=session, diner=diner, product_id=product.pk, name=product.name, unit_price=20000, qty=1, tax_ids=[tax.pk])
    client = APIClient()
    client.cookies['waiter_diner'] = diner.key
    return dict(org=org, venue=venue, owner=owner, shift=shift, product=product, config=config, session=session, diner=diner, client=client)


def delivery_body(**kwargs):
    return {'lat': 4.651, 'lng': -74.05, 'direccion': 'Calle 1 # 2-3', 'indicaciones': 'Portería',
            'telefono': '300 123 4567', 'nombre': 'Ana', 'guardar': False, 'acepta_datos': False, **kwargs}


def put_delivery(e, **kwargs):
    return e['client'].put(f"/api/v1/sesiones/{e['session'].pk}/domicilio", delivery_body(**kwargs), format='json')


def confirm(e, method='cash'):
    return e['client'].post(f"/api/v1/sesiones/{e['session'].pk}/confirmar/", {'metodo_pago': method}, format='json')


# Falla si la cobertura ignora la sede más cercana, su radio o el tramo sin redondear.
def test_coverage_nearest_and_tiers(env):
    e = env
    near = restaurant(e['org'], 'cercana', latitude=4.66, longitude=-74.05)
    CashShift.objects.create(restaurant=near, opened_by=e['owner'])
    DeliverySettings.objects.create(restaurant=near, enabled=True, radius_km=1, tiers=[{'up_to_km': '1', 'fee': '1000'}])
    assert quote(e['org'], '4.661', '-74.05')['sede']['slug'] == 'cercana'
    result = quote(e['org'], '4.671', '-74.05')
    assert result['sede']['slug'] == 'centro' and result['envio'] == 6000
    assert isinstance(result['distancia_km'], Decimal)
    assert quote(e['org'], 0, 0)['motivo'] == 'fuera_de_zona'
    assert distance(0, 0, 0, 0) == 0
    assert abs(distance(0, 0, 0, 1) - Decimal('111.19508')) < Decimal('.00001')
    assert abs(distance(0, 0, 0, 180) - Decimal('20015.11444')) < Decimal('.00001')


@pytest.mark.parametrize('lat,lng', [(91, 0), (0, -181), ('NaN', 0), (True, 0), (None, 2), ('Infinity', 1)])
# Falla si la ruta de cotización admite coordenadas no finitas o fuera de rango.
def test_quote_bad_coordinates(env, lat, lng):
    response = env['client'].post(f"/api/v1/{env['org'].slug}/domicilio/cotizar", {'lat': lat, 'lng': lng}, format='json')
    assert response.status_code == 400


# Falla si los ajustes dejan de exigir dueño, ubicación, validación e historial con aislamiento.
def test_owner_settings(env):
    e = env
    client = pos_client(e['owner'])
    base = '/api/pos/v1/delivery/settings'
    assert client.get(base).data['restaurants'][0]['has_location'] is True
    body = {'enabled': True, 'radius_km': 5, 'tiers': [{'up_to_km': 5, 'fee': 2000}], 'min_order': 1000, 'methods': ['cash'], 'notes': 'Con gusto'}
    assert client.put(f"{base}/{e['venue'].pk}", body, format='json').status_code == 200
    assert OrganizationAudit.objects.filter(action='delivery.deliverysettings.updated', organization=e['org']).exists()
    for key, value in [('methods', []), ('radius_km', 51), ('tiers', [{'up_to_km': 1, 'fee': -1}]), ('enabled', 'sí'), ('notes', 'x' * 201)]:
        assert client.put(f"{base}/{e['venue'].pk}", {**body, key: value}, format='json').status_code == 400
    e['venue'].latitude = None
    e['venue'].save()
    assert client.put(f"{base}/{e['venue'].pk}", body, format='json').data['error'] == 'location_required'
    admin = account(e['org'], role='admin', username='admin', restaurants=[e['venue']])
    assert pos_client(admin).get(base).status_code == 403
    other = restaurant(organization('otra'))
    assert client.put(f'{base}/{other.pk}', body, format='json').status_code == 404


@pytest.mark.parametrize('method', ['cash', 'card_on_delivery', 'online'])
# Falla si envío, pagos y recibo no cuadran, si el envío consume inventario o si online cocina antes del pago.
def test_delivery_checkout_payment_and_receipt(env, method):
    e = env
    response = put_delivery(e)
    assert response.status_code == 200, response.data
    assert response.data['carrito']['total'] == 23000
    response = confirm(e, method)
    assert response.status_code == 201, response.data
    order = Order.objects.get()
    assert order.total == 23000 and order.service == 'delivery'
    assert order.customer is None and not Customer.objects.exclude(vat='222222222222').exists()
    assert order.delivery_payment == method
    assert order.courses.exists() is (method != 'online')
    delivery = order.lines.get(product__kind='service')
    assert delivery.total == 3000 and delivery.taxes == [] and delivery.stock_usage == [] and delivery.course_id is None
    assert not delivery.product.available_in_pos and not delivery.product.track_stock
    assert StockMove.objects.count() == 0
    pos = pos_client(e['owner'])
    receipt = pos.get(f'/api/pos/v1/orders/{order.pk}').data['order']
    assert receipt['delivery_lat'] == 4.651 and receipt['delivery_fee'] == 3000
    assert receipt['delivery_details'] == 'Portería' and receipt['customer']['name'] == 'Ana'
    assert receipt['customer']['phone'] == '+573001234567'
    from experience_app.adapters.core.pos import Client, resolve, gateway_paid
    gateway_paid(Client(resolve(e['org'].slug, e['venue'].slug)), order.pk, 2300000, 'referencia-de-prueba')
    order.refresh_from_db()
    assert order.state == 'paid' and order.paid == 23000 and order.courses.count() == 1
    assert Payment.objects.get().amount == 23000 and Stock.objects.get().qty == 9
    assert StockMove.objects.count() == 1
    assert order.lines.get(product__kind='service').stock_usage == []
    assert put_delivery(e).status_code == 409


# Falla si confirmar permite saltar dirección, método, mínimo o cobertura actual.
def test_confirm_validation_and_rollback(env):
    e = env
    assert confirm(e).data['error'] == 'delivery_required'
    assert put_delivery(e).status_code == 200
    assert confirm(e, 'bitcoin').data['error'] == 'invalid_payment_method'
    e['config'].min_order = 30000
    e['config'].save()
    assert confirm(e).data['error'] == 'minimum_order'
    assert not Order.objects.exists() and not e['session'].orders.exists()
    e['config'].enabled = False
    e['config'].save()
    assert confirm(e).data['error'] == 'delivery_unavailable'


# Falla si la sesión usa la cobertura de otra sede o no actualiza el envío y la sugerencia.
def test_session_own_venue_and_requote(env):
    e = env
    near = restaurant(e['org'], 'cerca', latitude=4.661, longitude=-74.05)
    CashShift.objects.create(restaurant=near, opened_by=e['owner'])
    DeliverySettings.objects.create(restaurant=near, enabled=True)
    response = put_delivery(e, lat=4.661)
    assert response.data['domicilio']['sugerida']['slug'] == 'cerca'
    assert response.data['domicilio']['sede']['slug'] == 'centro'
    assert response.data['carrito']['envio'] == 6000
    assert put_delivery(e).data['carrito']['envio'] == 3000
    e['config'].radius_km = Decimal('.1')
    e['config'].save()
    assert put_delivery(e, lat=4.661).status_code == 409
    assert put_delivery(e, telefono='abc').status_code == 409


# Falla si las direcciones se guardan sin autorización, se revelan por teléfono o sobreviven a la revocación.
def test_customer_consent_addresses_and_revoke(env):
    e = env
    assert put_delivery(e, guardar=True).data['error'] == 'consent_required'
    assert not CustomerAddress.objects.exists()
    assert put_delivery(e, guardar=True, acepta_datos=True).status_code == 200
    customer = Customer.objects.get(normalized_phone='+573001234567')
    assert customer.data_consent_channel == 'menu'
    base = f"/api/v1/{e['org'].slug}/domicilio/direcciones"
    response = e['client'].get(base)
    assert len(response.data['direcciones']) == 1
    address = response.data['direcciones'][0]
    stranger = APIClient()
    stranger_diner = Diner.objects.create(session=e['session'])
    stranger.cookies['waiter_diner'] = stranger_diner.key
    assert stranger.get(base).data['direcciones'] == []
    assert stranger.delete(f"{base}/{address['id']}").status_code == 404
    foreign = organization('otra')
    assert e['client'].get(f'/api/v1/{foreign.slug}/domicilio/direcciones').status_code == 404
    assert confirm(e).status_code == 201
    assert e['client'].delete(f'/api/v1/{e["org"].slug}/datos').status_code == 200
    customer.refresh_from_db()
    assert customer.data_consent_revoked_at and not customer.addresses.exists()
    assert Order.objects.get().customer == customer
    assert e['client'].get(base).data == {'direcciones': []}


# Falla si el buscador supera su cupo, usa red sin clave o devuelve más de cinco resultados.
def test_geocoding_and_limits(env, settings, monkeypatch):
    e = env
    url = f'/api/v1/{e["org"].slug}/domicilio/buscar'
    from django.core.cache import cache
    cache.clear()
    settings.NOMINATIM_ENABLED = False
    assert e['client'].post(url, {'texto': 'Calle 1'}, format='json').status_code == 503
    settings.GOOGLE_MAPS_API_KEY = 'clave-simulada'
    remote = Mock(return_value=Mock(status_code=200, json=lambda: {'status': 'OK', 'results': [
        {'formatted_address': 'Calle 1, Bogotá', 'geometry': {'location': {'lat': 4.65, 'lng': -74.05}}}] * 8}))
    monkeypatch.setattr('requests.get', remote)
    # Textos distintos: la misma búsqueda repetida sale de la caché sin consultar al proveedor.
    for i in range(20):
        response = e['client'].post(url, {'texto': f'Calle {i}'}, format='json')
        assert response.status_code == 200 and len(response.data['resultados']) == 5
    assert e['client'].post(url, {'texto': 'Calle 99'}, format='json').status_code == 429
    assert remote.call_count == 20 and remote.call_args.kwargs['params']['components'] == 'country:CO'


# Falla si las rutas públicas aceptan cookies desde un origen ajeno.
def test_origins(env, settings):
    e = env
    url = f'/api/v1/{e["org"].slug}/domicilio/cotizar'
    assert e['client'].post(url, {'lat': 4.65, 'lng': -74.05}, format='json', HTTP_ORIGIN='https://ajeno.co').status_code == 403
    assert e['client'].post(url, {'lat': 4.65, 'lng': -74.05}, format='json', HTTP_ORIGIN=settings.DINER_PUBLIC_URL).status_code == 200


# Falla si los indicadores cuentan borradores u otra organización o no separan canales y zona horaria.
def test_customer_insights(env):
    e = env
    assert put_delivery(e, acepta_datos=True).status_code == 200
    assert confirm(e).status_code == 201
    order = Order.objects.get()
    order.state, order.paid_at = 'paid', timezone.now()
    order.save()
    Order.objects.create(organization=e['org'], restaurant=e['venue'], shift=e['shift'], uuid=uuid4(), service='takeout', prefix='TA', tracking=2, number='TA-2', customer=order.customer, total=999)
    other = organization('otra')
    Order.objects.create(organization=other, restaurant=e['venue'], shift=e['shift'], uuid=uuid4(), service='takeout', prefix='TA', tracking=3, number='TA-3', customer=order.customer, total=999, state='paid')
    response = pos_client(e['owner']).get(f'/api/pos/v1/customers/{order.customer_id}')
    assert response.data['customer']['orders'] == 1
    info = response.data['customer']['insights']
    assert info['orders'] == 1 and info['total_spent'] == 23000 and info['avg_ticket'] == 23000
    assert info['channels'] == {'pos': 0, 'menu': 1, 'whatsapp': 0}
    assert sum(info['hours'].values()) == sum(info['weekdays'].values()) == 1
    assert info['top_products'][0]['name'] == 'Sopa' and len(info['top_products']) == 1
    assert info['rfm']['segment'] == 'nuevo'


# Falla si una dirección propia no se puede borrar o si la undécima supera el límite del cliente.
def test_address_delete_limit_and_id_ownership(env):
    e = env
    assert put_delivery(e, guardar=True, acepta_datos=True).status_code == 200
    customer = Customer.objects.get(normalized_phone='+573001234567')
    for i in range(2, 11):
        assert put_delivery(e, guardar=True, direccion=f'Calle {i}').status_code == 200
    assert customer.addresses.count() == 10
    assert put_delivery(e, guardar=True, direccion='Calle 11').data['error'] == 'address_limit'
    address = customer.addresses.first()
    assert e['client'].delete(f'/api/v1/{e["org"].slug}/domicilio/direcciones/{address.pk}').data == {'ok': True}
    assert customer.addresses.count() == 9
    assert put_delivery(e, direccion_id=999999, guardar=True).status_code == 404


@pytest.mark.parametrize('change', [{'telefono': '123'}, {'nombre': ''}, {'guardar': 'sí'}, {'lat': 91}, {'direccion': 'x' * 301}])
# Falla si los datos de entrega inválidos dejan una cotización parcial en la visita.
def test_session_invalid_payload(env, change):
    response = put_delivery(env, **change)
    assert response.status_code == 400
    assert not SessionDelivery.objects.exists()


# Falla si el menú no anuncia la disponibilidad de domicilios y del buscador, o si no dice si la sede está abierta.
def test_public_entry_delivery_capabilities(env, settings):
    e = env
    response = e['client'].get(f'/api/v1/{e["org"].slug}/{e["venue"].slug}/')
    assert response.status_code == 200, response.data
    assert response.data['horario'] == {'configurado': False, 'abierto': True}
    assert response.data['domicilio'] == {'enabled': True, 'buscador': True, 'centro': {'lat': 4.65, 'lng': -74.05}, 'radio_km': 5.0, 'cobro': 'distance', 'recargo': 0.0, 'gratis_desde': None}
    settings.NOMINATIM_ENABLED = False
    assert e['client'].get(f'/api/v1/{e["org"].slug}/{e["venue"].slug}/').data['domicilio']['buscador'] is False
    settings.GOOGLE_MAPS_API_KEY = 'clave-simulada'
    assert e['client'].get(f'/api/v1/{e["org"].slug}/{e["venue"].slug}/').data['domicilio']['buscador']


# Falla si un fallo del proveedor se expone como 500 o si buscar no exige cookie de la organización.
def test_search_provider_error_and_identity(env, settings, monkeypatch):
    import requests
    e = env
    settings.GOOGLE_MAPS_API_KEY = 'clave-simulada'
    url = f'/api/v1/{e["org"].slug}/domicilio/buscar'
    assert APIClient().post(url, {'texto': 'Casa'}, format='json').status_code == 404
    monkeypatch.setattr('requests.get', Mock(side_effect=requests.Timeout()))
    assert e['client'].post(url, {'texto': 'Casa'}, format='json').data['error'] == 'maps_unavailable'


# Falla si el pago aprobado en Wompi omite el envío o se concilia dos veces en cocina y caja.
def test_online_reconciliation_includes_delivery(env):
    from experience_app.models import PaymentGateway, PaymentAttempt, Order as MenuOrder
    from experience_app.services.online_payments import reconcile
    e = env
    assert put_delivery(e).status_code == 200
    assert confirm(e, 'online').data['estado'] == 'pendiente_pago'
    order = Order.objects.get()
    gateway = PaymentGateway.objects.create(restaurant_slug=e['org'].slug, venue_slug=e['venue'].slug,
        environment='prod', payment_method_id=e['org'].paymentmethod_set.get(name='Pago en línea').pk)
    attempt = PaymentAttempt.objects.create(gateway=gateway, session=e['session'], diner=e['diner'], order=MenuOrder.objects.get(),
        amount_in_cents=2300000, method='CARD', status='PENDING', payment_method_id=gateway.payment_method_id)
    reconcile(attempt)
    assert not order.courses.exists()
    attempt.status = 'APPROVED'
    attempt.save()
    assert reconcile(attempt).reconciled
    assert reconcile(attempt).reconciled
    order.refresh_from_db()
    assert order.total == order.paid == 23000 and order.courses.count() == 1 and Payment.objects.count() == 1


# Falla si cambiar tarifas después de confirmar modifica el carrito, la cuenta o el importe que se paga.
def test_confirmed_delivery_is_frozen(env):
    e = env
    assert put_delivery(e).status_code == 200
    assert confirm(e, 'online').status_code == 201
    e['config'].enabled = False
    e['config'].tiers = [{'up_to_km': '5', 'fee': '9000'}]
    e['config'].save()
    cart = e['client'].get(f'/api/v1/sesiones/{e["session"].pk}/carrito/')
    assert cart.status_code == 200 and cart.data['envio'] == 3000
    from experience_app.services.sessions import bill_summary
    assert bill_summary(e['session'], e['diner'])['total'] == 23000
    assert Order.objects.get().total == 23000


# Falla si WhatsApp y la cuenta del menú crean dos clientes para el mismo teléfono o pierden diner_key.
def test_same_phone_customer_across_channels(env):
    from loyalty.delivery import authorize
    e = env
    diner = e['diner']
    diner.account = DinerAccount.objects.create(organization_slug=e['org'].slug, email='ana@example.co', name='Ana', phone='3001234567', verified=True)
    diner.save()
    assert put_delivery(e, acepta_datos=True, guardar=True).status_code == 200
    customer = Customer.objects.get(normalized_phone='+573001234567')
    whatsapp = authorize(e['org'], '573001234567', 'Ana', 'whatsapp')
    assert customer.pk == whatsapp.pk and whatsapp.diner_key == diner.account_id
    assert Customer.objects.filter(normalized_phone='+573001234567').count() == 1


# Falla si conocer el teléfono de otro cliente permite vincular una cuenta propia a sus direcciones.
def test_phone_does_not_grant_address_access(env):
    from loyalty.delivery import authorize, save_address
    e = env
    victim = authorize(e['org'], '573001234567', 'Ana', 'whatsapp')
    save_address(victim, {'label': 'Casa privada', 'text': 'Dirección privada', 'details': '', 'latitude': Decimal('4.65'), 'longitude': Decimal('-74.05')})
    e['diner'].account = DinerAccount.objects.create(organization_slug=e['org'].slug, email='otro@example.co', name='Otro', verified=True)
    e['diner'].save()
    Customer.objects.create(organization=e['org'], diner_key=e['diner'].account_id, name='Otro')
    assert put_delivery(e, acepta_datos=True).status_code == 200
    assert e['client'].get(f'/api/v1/{e["org"].slug}/domicilio/direcciones').data == {'direcciones': []}


# Falla si la migración de teléfonos pierde pedidos, claves de cuenta o puntos al consolidar contactos antiguos.
def test_phone_migration_preserves_references(env):
    from importlib import import_module
    from django.apps import apps
    from loyalty.models import CustomerDinerIdentity, LoyaltyCard
    e = env
    key = uuid4()
    # `bulk_create` simula datos de antes de la normalización (no pasa por `save`); en MySQL no devuelve los ids, así
    # que se leen después.
    Customer.objects.bulk_create([
        Customer(organization=e['org'], name='Ana', phone='3001234567'),
        Customer(organization=e['org'], name='Ana menú', phone='+57 300 123 4567', diner_key=key)])
    rows = [Customer.objects.get(organization=e['org'], name='Ana'), Customer.objects.get(organization=e['org'], name='Ana menú')]
    first = LoyaltyCard.objects.create(organization=e['org'], customer=rows[0], points=2)
    LoyaltyCard.objects.create(organization=e['org'], customer=rows[1], points=3)
    order = Order.objects.create(organization=e['org'], restaurant=e['venue'], shift=e['shift'], uuid=uuid4(), service='takeout', prefix='TA', tracking=4, number='TA-4', customer=rows[1])
    import_module('loyalty.migrations.0006_unificar_telefonos_colombianos').forward(apps, None)
    first.refresh_from_db()
    order.refresh_from_db()
    assert first.points == 5 and order.customer_id == rows[0].pk
    assert CustomerDinerIdentity.objects.get(key=key).customer_id == rows[0].pk
    assert Customer.objects.filter(normalized_phone='+573001234567').count() == 1


# Falla si un reintento cambia la tarifa o el método de un domicilio ya confirmado.
def test_confirmation_retry_preserves_price_and_method(env):
    e = env
    assert put_delivery(e).status_code == 200
    first = confirm(e, 'cash')
    assert first.status_code == 201
    e['config'].tiers = [{'up_to_km': '5', 'fee': '9000'}]
    e['config'].save()
    assert confirm(e, 'card_on_delivery').status_code == 409
    retry = confirm(e, 'cash')
    assert retry.status_code == 200 and retry.data['pedido'] == first.data['pedido']
    assert SessionDelivery.objects.get().fee == 3000 and Order.objects.get().total == 23000


# Falla si el comensal puede iniciar un pago en línea cuando eligió contra entrega.
def test_cash_delivery_blocks_online_checkout(env):
    from experience_app.services.online_payments import context, create, PaymentConflict
    e = env
    assert put_delivery(e).status_code == 200 and confirm(e).status_code == 201
    assert context(e['session'], e['diner'])['available'] is False
    with pytest.raises(PaymentConflict):
        create(e['session'], e['diner'], {'id': uuid4(), 'method': 'CARD'})


# Falla si el producto de envío aparece en la carta o permite que el dueño lo convierta en un plato.
def test_shipping_product_hidden_and_protected(env):
    e = env
    assert put_delivery(e).status_code == 200 and confirm(e).status_code == 201
    product = Product.objects.get(kind='service')
    client = pos_client(e['owner'])
    assert product.pk not in [p['id'] for p in client.get('/api/pos/v1/products').data['products']]
    assert client.patch(f'/api/pos/v1/products/{product.pk}', {'name': 'Otro nombre'}, format='json').status_code == 404


# Falla si devolver el envío altera impuestos o devuelve ingredientes que nunca se consumieron por esa línea.
def test_refund_shipping_without_inventory(env):
    from experience_app.adapters.core.pos import Client, resolve, gateway_paid
    e = env
    assert put_delivery(e).status_code == 200 and confirm(e, 'online').status_code == 201
    order = Order.objects.get()
    gateway_paid(Client(resolve(e['org'].slug, e['venue'].slug)), order.pk, 2300000, 'pago-para-devolucion')
    line = order.lines.get(product__kind='service')
    method = Payment.objects.get().method_id
    response = pos_client(e['owner']).post(f'/api/pos/v1/orders/{order.pk}/refunds', {
        'lines': [{'line_id': line.pk, 'qty': 1}], 'tip': 0, 'payments': [{'method_id': method, 'amount': 3000}],
        'reason': 'Se recogió el pedido en la sede', 'restock': True, 'request_key': uuid4().hex}, format='json')
    assert response.status_code == 200, response.data
    order.refresh_from_db()
    assert order.refunded == 3000 and Stock.objects.get().qty == 9 and StockMove.objects.count() == 1


# Falla si el turno público del chat omite la acción que abre la hoja de domicilio del menú.
def test_menu_chat_delivery_action(env):
    e = env
    response = e['client'].post(f'/api/v1/sesiones/{e["session"].pk}/asistente/',
        {'id': str(uuid4()), 'mensaje': 'domicilio'}, format='json')
    assert response.status_code == 200, response.data
    assert response.data['accion'] == 'domicilio' and response.data['lineas'] == []
    assert CartLine.objects.count() == 1


# Falla si sin clave de Google no se usa Nominatim como su política exige (identificación, Colombia, caché), si la
# dirección aproximada del pin no se resume para el cliente, o si una caída del proveedor rompe el mapa.
def test_nominatim_busca_y_lee_direcciones(env, settings, monkeypatch):
    from django.core.cache import cache
    e = env
    cache.clear()
    settings.GOOGLE_MAPS_API_KEY = ''
    lugar = {'lat': '4.6512', 'lon': '-74.0518', 'display_name': 'largo', 'address': {
        'road': 'Calle 10', 'house_number': '43-12', 'suburb': 'El Poblado', 'city': 'Medellín', 'country': 'Colombia', 'postcode': '050021'}}
    remote = Mock(side_effect=lambda url, **kw: Mock(status_code=200, json=lambda: [lugar] if url.endswith('/search') else lugar))
    monkeypatch.setattr('requests.get', remote)
    buscar = e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/buscar', {'texto': 'calle 10 43-12'}, format='json')
    assert buscar.status_code == 200 and buscar.data['resultados'] == [{'texto': 'Calle 10 43-12, El Poblado, Medellín', 'lat': 4.6512, 'lng': -74.0518}]
    params, headers = remote.call_args.kwargs['params'], remote.call_args.kwargs['headers']
    assert params['countrycodes'] == 'co' and 'Waiter' in headers['User-Agent'] and params['bounded'] == 1 and 'viewbox' in params
    url = f'/api/v1/{e["org"].slug}/domicilio/direccion'
    for _ in range(3):
        assert e['client'].post(url, {'lat': 6.20871, 'lng': -75.56712}, format='json').data == {'texto': 'Calle 10 43-12, El Poblado, Medellín'}
    assert remote.call_count == 2
    cache.clear()
    monkeypatch.setattr('requests.get', Mock(side_effect=__import__('requests').Timeout('caído')))
    assert e['client'].post(url, {'lat': 6.3, 'lng': -75.5}, format='json').data == {'texto': ''}
    assert e['client'].post(url, {'lat': 99, 'lng': -75.5}, format='json').status_code == 400


# Falla si las sugerencias no muestran el barrio, si repiten la misma calle por tramos, si muestran lugares de otro país
# o para adultos, si no se limitan a la zona de la sede o si una caída de Photon rompe el campo de dirección.
def test_sugerencias_de_direccion(env, settings, monkeypatch):
    from django.core.cache import cache
    e = env
    cache.clear()
    settings.GOOGLE_MAPS_API_KEY = ''
    feature = lambda props, lng=-75.57, lat=6.21: {'geometry': {'coordinates': [lng, lat]}, 'properties': {'countrycode': 'CO', **props}}
    respuesta = {'features': [
        feature({'name': 'Éxito Poblado', 'street': 'Calle 10', 'housenumber': '43E-135', 'district': 'El Poblado', 'city': 'Medellín', 'type': 'house'}),
        feature({'street': 'Carrera 70', 'district': 'Laureles', 'city': 'Perímetro Urbano Medellín', 'type': 'street', 'name': 'Carrera 70'}),
        feature({'street': 'Carrera 70', 'district': 'Laureles', 'city': 'Perímetro Urbano Medellín', 'type': 'street', 'name': 'Carrera 70'}, lat=6.25),
        feature({'name': 'Tienda', 'osm_value': 'erotic', 'type': 'house'}),
        {'geometry': {'coordinates': [-74, 4.6]}, 'properties': {'countrycode': 'VE', 'name': 'Otro país'}}]}
    remote = Mock(return_value=Mock(status_code=200, json=lambda: respuesta))
    monkeypatch.setattr('requests.get', remote)
    url = f'/api/v1/{e["org"].slug}/domicilio/sugerencias'
    data = e['client'].post(url, {'texto': 'calle 10'}, format='json').data['sugerencias']
    assert data == [{'titulo': 'Éxito Poblado', 'detalle': 'Calle 10 43E-135, El Poblado, Medellín', 'lat': 6.21, 'lng': -75.57},
                    {'titulo': 'Carrera 70', 'detalle': 'Laureles, Medellín', 'lat': 6.21, 'lng': -75.57}]
    assert 'bbox' in remote.call_args.kwargs['params'] and 'Waiter' in remote.call_args.kwargs['headers']['User-Agent']
    assert e['client'].post(url, {'texto': 'ca'}, format='json').status_code == 400
    monkeypatch.setattr('requests.get', Mock(side_effect=__import__('requests').Timeout('caído')))
    assert e['client'].post(url, {'texto': 'otra calle'}, format='json').data == {'sugerencias': []}


# Falla si con clave de Google las sugerencias no usan sesión ni prefieren la zona de la sede, si sus resultados se
# guardan en caché (sus términos lo prohíben), si escoger una no trae solo ubicación y dirección (lo más barato) o si
# la lectura del pin gasta Google teniendo OpenStreetMap gratis.
def test_google_places_con_sesion(env, settings, monkeypatch):
    from django.core.cache import cache
    e = env
    cache.clear()
    settings.GOOGLE_MAPS_API_KEY = 'clave-simulada'
    sugerencias = {'suggestions': [{'placePrediction': {'placeId': 'ChIJ-lugar-123', 'structuredFormat': {
        'mainText': {'text': 'Calle 10 #43-12'}, 'secondaryText': {'text': 'El Poblado, Medellín, Antioquia, Colombia'}}}}]}
    detalle = {'location': {'latitude': 6.2098, 'longitude': -75.5684}, 'formattedAddress': 'Cl. 10 #43-12, El Poblado, Medellín, El Poblado, Medellín, Colombia'}
    google = Mock(side_effect=lambda method, url, **kw: Mock(status_code=200, json=lambda: sugerencias if method == 'POST' else detalle))
    monkeypatch.setattr('requests.request', google)
    url = f'/api/v1/{e["org"].slug}/domicilio/sugerencias'
    for _ in range(2):
        data = e['client'].post(url, {'texto': 'calle 10 43', 'sesion': 'sesion-1234-abcd'}, format='json').data['sugerencias']
    assert data == [{'titulo': 'Calle 10 #43-12', 'detalle': 'El Poblado, Medellín, Antioquia', 'place_id': 'ChIJ-lugar-123', 'lat': None, 'lng': None}]
    assert google.call_count == 2
    cuerpo = google.call_args.kwargs['json']
    assert cuerpo['sessionToken'] == 'sesion-1234-abcd' and cuerpo['includedRegionCodes'] == ['co'] and 'rectangle' in cuerpo['locationRestriction']
    lugar = e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/lugar', {'place_id': 'ChIJ-lugar-123', 'sesion': 'sesion-1234-abcd'}, format='json')
    assert lugar.data == {'lat': 6.2098, 'lng': -75.5684, 'texto': 'Cl. 10 #43-12, El Poblado, Medellín', 'place_id': 'ChIJ-lugar-123'}
    assert google.call_args.kwargs['headers']['X-Goog-FieldMask'] == 'location,formattedAddress'
    assert google.call_args.kwargs['params']['sessionToken'] == 'sesion-1234-abcd'
    assert e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/lugar', {'place_id': '../otro'}, format='json').status_code == 400
    nominatim = Mock(return_value=Mock(status_code=200, json=lambda: {'address': {'road': 'Calle 9A', 'suburb': 'El Poblado', 'city': 'Medellín'}}))
    monkeypatch.setattr('requests.get', nominatim)
    assert e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/direccion', {'lat': 6.21, 'lng': -75.57}, format='json').data == {'texto': 'Calle 9A, El Poblado, Medellín'}
    assert 'nominatim' in nominatim.call_args.args[0]


# Falla si una caída o un rechazo de Google (por ejemplo, sin facturación) deja al cliente sin sugerencias.
def test_google_caido_usa_openstreetmap(env, settings, monkeypatch):
    from django.core.cache import cache
    e = env
    cache.clear()
    settings.GOOGLE_MAPS_API_KEY = 'clave-sin-facturacion'
    monkeypatch.setattr('requests.request', Mock(return_value=Mock(status_code=403, json=lambda: {'error': {'code': 403}})))
    photon = {'features': [{'geometry': {'coordinates': [-75.57, 6.21]}, 'properties': {'countrycode': 'CO', 'name': 'Parque El Poblado', 'district': 'El Poblado', 'city': 'Medellín'}}]}
    monkeypatch.setattr('requests.get', Mock(return_value=Mock(status_code=200, json=lambda: photon)))
    data = e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/sugerencias', {'texto': 'parque poblado'}, format='json').data
    assert data['sugerencias'] == [{'titulo': 'Parque El Poblado', 'detalle': 'El Poblado, Medellín', 'lat': 6.21, 'lng': -75.57}]


# Falla si una búsqueda con Google gasta más de una consulta, si no se cuenta (gasto de ProjectApp por día y organización),
# si trae direcciones de otra ciudad o repite barrio y ciudad, o si una caída de Google deja al cliente sin buscar.
def test_buscar_con_google_una_consulta(env, settings, monkeypatch):
    from django.core.cache import cache
    from delivery.models import MapsUsage
    e = env
    cache.clear()
    settings.GOOGLE_MAPS_API_KEY = 'clave-simulada'
    sede = e['venue']
    lat, lng = float(sede.latitude), float(sede.longitude)
    filas = [{'formatted_address': 'Cl 10 #43-12, El Poblado, Medellín, El Poblado, Medellín, Colombia', 'geometry': {'location': {'lat': lat + .01, 'lng': lng + .01}, 'location_type': 'RANGE_INTERPOLATED'}},
             {'formatted_address': 'Cl 10 #43-12, Duitama, Boyacá, Colombia', 'geometry': {'location': {'lat': lat + 2, 'lng': lng + 2}, 'location_type': 'ROOFTOP'}}]
    google = Mock(return_value=Mock(status_code=200, json=lambda: {'status': 'OK', 'results': filas}))
    monkeypatch.setattr('requests.get', google)
    url = f'/api/v1/{e["org"].slug}/domicilio/buscar'
    data = e['client'].post(url, {'texto': 'Calle 10 # 43-12'}, format='json').data['resultados']
    assert data == [{'texto': 'Cl 10 #43-12, El Poblado, Medellín', 'lat': round(lat + .01, 7), 'lng': round(lng + .01, 7), 'exacta': True}]
    assert google.call_count == 1 and 'bounds' in google.call_args.kwargs['params']
    assert MapsUsage.objects.get(organization=e['org'], kind='geocoding').count == 1
    monkeypatch.setattr('requests.get', Mock(side_effect=lambda url, **kw: Mock(status_code=200, json=lambda: {'status': 'REQUEST_DENIED'} if 'googleapis' in url else [])))
    assert e['client'].post(url, {'texto': 'Carrera 70 # 1-2'}, format='json').status_code == 200


# Falla si con sedes en varias ciudades la búsqueda solo mira la primera (una dirección de la otra ciudad no aparece), si
# deja pasar resultados de ciudades donde no hay sede, o si no avisa que la dirección queda fuera de todas las sedes.
def test_busqueda_en_las_zonas_de_todas_las_sedes(env, settings, monkeypatch):
    from django.core.cache import cache
    from delivery.models import DeliverySettings
    from tenancy.tests.helpers import restaurant
    e = env
    cache.clear()
    settings.GOOGLE_MAPS_API_KEY = 'clave-simulada'
    otra = restaurant(e['org'], slug='duitama')
    otra.latitude, otra.longitude = 5.8267, -73.0337
    otra.save()
    DeliverySettings.objects.create(restaurant=otra, enabled=True, radius_km=5, tiers=[{'up_to_km': '5', 'fee': '5000'}], methods=['cash'])
    fila = lambda lat, lng, texto: {'formatted_address': texto, 'geometry': {'location': {'lat': lat, 'lng': lng}, 'location_type': 'ROOFTOP'}}
    google = Mock(return_value=Mock(status_code=200, json=lambda: {'status': 'OK', 'results': [
        fila(4.66, -74.05, 'Cl 10 #43-12, Bogotá'), fila(5.83, -73.03, 'Cl 10 #43-12, Duitama'), fila(6.21, -75.57, 'Cl 10 #43-12, Medellín')]}))
    monkeypatch.setattr('requests.get', google)
    data = e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/buscar', {'texto': 'Calle 10 # 43-12'}, format='json').data['resultados']
    assert [r['texto'] for r in data] == ['Cl 10 #43-12, Bogotá', 'Cl 10 #43-12, Duitama']
    assert 'bounds' not in google.call_args.kwargs['params']
    # Una dirección que solo existe lejos de todas las sedes: no es «no la encontramos», es «sin cobertura».
    google.return_value = Mock(status_code=200, json=lambda: {'status': 'OK', 'results': [fila(10.39, -75.51, 'Cra 3 #36-1, Cartagena')]})
    lejos = e['client'].post(f'/api/v1/{e["org"].slug}/domicilio/buscar', {'texto': 'Carrera 3 # 36-1 Cartagena'}, format='json').data
    assert lejos == {'resultados': [], 'fuera_de_cobertura': True}


# Falla si una sede cerrada (por el horario del dueño) recibe domicilios o pedidos, si la cotización no avisa cuándo abre
# o si con otra sede abierta que cubre la dirección el domicilio no pasa a ella.
def test_sede_cerrada_no_recibe_domicilios(env):
    from tenancy.models import OpeningHours
    e = env
    OpeningHours.objects.create(restaurant=e['venue'], weekly={str(d): [] for d in range(7)})
    cerrada = quote(e['org'], '4.651', '-74.05')
    assert cerrada['cobertura'] is False and cerrada['motivo'] == 'cerrado' and 'está cerrada' in cerrada['mensaje']
    assert put_delivery(e).status_code == 409
    respuesta = confirm(e)
    assert respuesta.status_code == 409 and respuesta.data['error'] == 'restaurant_closed'
    abierta = restaurant(e['org'], 'abierta', latitude=4.652, longitude=-74.05)
    CashShift.objects.create(restaurant=abierta, opened_by=e['owner'])
    DeliverySettings.objects.create(restaurant=abierta, enabled=True, radius_km=5)
    assert quote(e['org'], '4.651', '-74.05')['sede']['slug'] == 'abierta'
    # Sin horario, la sede atiende siempre (como antes).
    OpeningHours.objects.filter(restaurant=e['venue']).delete()
    assert put_delivery(e).status_code == 200 and confirm(e).status_code == 201


# Falla si el dueño no puede escoger tarifa fija, envío gratis, «gratis desde» o recargo, o si se aceptan valores sin
# sentido (modo desconocido, tarifa fija en cero, recargo de más del 50 %).
def test_owner_fee_modes(env):
    e = env
    client = pos_client(e['owner'])
    base = f"/api/pos/v1/delivery/settings/{e['venue'].pk}"
    body = {'enabled': True, 'radius_km': 5, 'tiers': [{'up_to_km': 5, 'fee': 2000}], 'min_order': 0, 'methods': ['cash']}
    saved = client.put(base, {**body, 'fee_mode': 'flat', 'flat_fee': 5000, 'free_from': 60000, 'markup_percent': 8}, format='json')
    assert saved.status_code == 200, saved.data
    assert quote(e['org'], '4.66', '-74.05')['envio'] == 5000
    for key, value in [('fee_mode', 'gratis'), ('flat_fee', 0), ('markup_percent', 51), ('free_from', -1)]:
        assert client.put(base, {**body, 'fee_mode': 'flat', 'flat_fee': 5000, key: value}, format='json').status_code == 400
    assert client.put(base, {**body, 'fee_mode': 'free'}, format='json').status_code == 200
    assert quote(e['org'], '4.66', '-74.05')['envio'] == 0
    # Sin los campos nuevos (un POS anterior) se conserva el cobro por distancia.
    assert client.put(base, body, format='json').status_code == 200
    assert quote(e['org'], '4.66', '-74.05')['envio'] == 2000


# Falla si con recargo el carrito no muestra los precios que se cobrarán, si el pedido cobra distinto de lo que se vio,
# si el envío no queda gratis al alcanzar el «gratis desde» o si al confirmar más platos se recargan dos veces.
def test_markup_and_free_from(env):
    e = env
    e['config'].markup_percent, e['config'].free_from = Decimal('8'), Decimal('21000')
    e['config'].save()
    cart = put_delivery(e).data['carrito']
    assert cart['lineas'][0]['precio'] == 21600 and cart['domicilio']['envio'] == 0 and cart['domicilio']['envio_base'] == 3000
    assert cart['total'] == 21600
    e['config'].free_from = Decimal('50000')
    e['config'].save()
    cart = e['client'].get(f"/api/v1/sesiones/{e['session'].pk}/carrito/").data
    assert cart['envio'] == 3000 and cart['total'] == 24600
    assert confirm(e).status_code == 201
    order = Order.objects.get()
    assert order.total == 24600
    food = order.lines.get(name='Sopa')
    assert food.total == 21600 and food.unit_price == 21600
    from delivery.services import apply_order
    from sales.services import writing
    with writing(e['org'], e['venue']):
        apply_order(order, SessionDelivery.objects.get(), Decimal(0))
    food.refresh_from_db()
    assert food.total == 21600


# Falla si una sede sin caja abierta en el POS recibe domicilios: la cotización debe pasar a otra sede que sí reciba o
# decir que esa sede por ahora no tiene abierto, y el menú debe saberlo desde la entrada.
def test_sede_sin_caja_no_recibe_pedidos(env):
    e = env
    CashShift.objects.filter(restaurant=e['venue']).update(state='closed')
    cerrada = quote(e['org'], '4.651', '-74.05')
    assert cerrada['motivo'] == 'cerrado' and 'no tiene abierto' in cerrada['mensaje']
    assert put_delivery(e).status_code == 409
    assert e['client'].get(f'/api/v1/{e["org"].slug}/{e["venue"].slug}/').data['pedidos'] is False
    otra = restaurant(e['org'], 'otra', latitude=4.652, longitude=-74.05)
    DeliverySettings.objects.create(restaurant=otra, enabled=True, radius_km=5)
    CashShift.objects.create(restaurant=otra, opened_by=e['owner'])
    assert quote(e['org'], '4.651', '-74.05')['sede']['slug'] == 'otra'
