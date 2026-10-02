"""Contrato del comensal por las rutas públicas y los modelos propios."""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import make_password
from django.core.files.base import ContentFile
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from catalog.models import Category, Product, ProductPhoto, RestaurantPrice, RestaurantUnavailable, Tax, Recipe, RecipeLine, Unit
from inventory.models import Stock, StockMove
from loyalty.models import Coupon, LoyaltyCard, LoyaltyProgram
from loyalty.services import seed_organization as seed_loyalty
from sales.models import CashShift, Order, Payment
from sales.services import seed_organization, seed_restaurant
from tables.models import Table
from tenancy.models import Organization, Restaurant
from experience_app.models import Diner, DinerAccount

pytestmark = pytest.mark.django_db


@pytest.fixture
def core(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.DINER_DEMO_ENABLED = True
    settings.IS_PRODUCTION = False
    org = Organization.objects.create(slug='la-casa', name='La casa', status='active', signup_discount_percent=5)
    venue = Restaurant.objects.create(organization=org, slug='centro', name='Centro', street='Calle 1')
    seed_organization(org)
    seed_restaurant(venue)
    seed_loyalty(org)
    LoyaltyProgram.objects.filter(organization=org).update(active=True)
    owner = Account.objects.create(organization=org, username='duena', name='Dueña', role='owner', activated=True,
                                   password=make_password('Clave-2026'))
    table = Table.objects.create(floor=venue.floors.get(), number=1, token='Ab12Cd')
    category = Category.objects.create(organization=org, name='Platos')
    tax = Tax.objects.create(organization=org, name='INC', amount=8, included=True)
    product = Product.objects.create(organization=org, name='Sopa', price=10800, kind='dish')
    product.categories.add(category)
    product.taxes.add(tax)
    RestaurantPrice.objects.create(restaurant=venue, product=product, price=21600)
    with patch('requests.sessions.Session.request', side_effect=AssertionError('El sistema propio no debe usar HTTP')):
        yield org, venue, owner, table, product


def opened(core, *, shift=True, account=False):
    org, venue, owner, table, product = core
    if shift:
        CashShift.objects.create(restaurant=venue, opened_by=owner, opening_cash=0)
    client = APIClient()
    response = client.post('/api/v1/sesiones/', {'restaurante': org.slug, 'sede': venue.slug, 'token': table.token}, format='json')
    assert response.status_code == 201, response.data
    sid = response.data['sesion']['id']
    if account:
        diner = Diner.objects.get(session_id=sid)
        diner.account = DinerAccount.objects.create(organization_slug=org.slug, name='Ana', phone='+573001234567', verified=True)
        diner.save()
    response = client.post(f'/api/v1/sesiones/{sid}/lineas/', {'producto_id': product.pk, 'cantidad': 1}, format='json')
    assert response.status_code == 201, response.data
    return client, sid


# Falla si resolver, portada, precio de sede o token llaman al registro o mezclan organizaciones.
def test_core_menu_resolution_and_isolation(core):
    org, venue, owner, table, product = core
    client = APIClient()
    body = client.get('/api/v1/la-casa/centro/').json()
    assert body['carta']['categorias'][0]['productos'][0]['precio'] == 21600
    assert client.get('/api/v1/la-casa/').json()['restaurantes'][0]['direccion'] == 'Calle 1'
    assert client.get(f'/api/v1/la-casa/centro/t/{table.token}/').json()['contexto']['mesa']['numero'] == 1
    other = Restaurant.objects.create(organization=org, slug='norte', name='Norte')
    assert client.get(f'/api/v1/la-casa/norte/t/{table.token}/').status_code == 404
    org.status = 'suspended'
    org.save()
    denied = client.get('/api/v1/la-casa/centro/')
    assert denied.status_code == 404
    assert denied.json()['error'] == 'restaurant_unavailable'


# Falla si una escritura deja carta o marca antiguas en caché o pierde la galería.
def test_core_cache_gallery_and_brand(core):
    org, venue, owner, table, product = core
    client = APIClient()
    client.get('/api/v1/la-casa/centro/')
    RestaurantUnavailable.objects.create(restaurant=venue, product=product)
    photo = ProductPhoto.objects.create(product=product, image=ContentFile(b'RIFF1234WEBP', name='foto.webp'), width=1, height=1, file_size=12)
    org.greeting = 'Bienvenidos'
    org.brand_logo = b'\x89PNG\r\n\x1a\n'
    org.brand_version += 1
    org.save()
    body = client.get('/api/v1/la-casa/centro/').json()
    dish = body['carta']['categorias'][0]['productos'][0]
    assert dish['agotado'] and str(photo.pk) in dish['fotos'][0]
    assert body['contexto']['marca']['saludo'] == 'Bienvenidos'
    assert client.get(body['contexto']['marca']['logo']).status_code == 200
    assert client.get(dish['fotos'][0]).status_code == 200


# Falla si confirmar abre caja automáticamente o pierde el carrito cuando está cerrada.
def test_core_closed_restaurant(core):
    client, sid = opened(core, shift=False)
    response = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert response.status_code == 409, response.data
    assert response.data['error'] == 'restaurant_closed'
    assert not Order.objects.exists() and not CashShift.objects.exists()


# Falla si el pago no dispara cocina, abona puntos y descuenta existencias exactamente una vez.
def test_core_confirm_pay_status_call_and_bill(core):
    org, venue, owner, table, product = core
    unit = Unit.objects.create(organization=org, name='Unidad', root='count', factor=1)
    ingredient = Product.objects.create(organization=org, name='Papa', kind='ingredient', unit=unit)
    recipe = Recipe.objects.create(product=product, yield_qty=1)
    RecipeLine.objects.create(recipe=recipe, ingredient=ingredient, qty=1, unit=unit)
    Stock.objects.create(restaurant=venue, ingredient=ingredient, qty=10)
    client, sid = opened(core, account=True)
    response = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert response.status_code in (200, 201), response.data
    order = Order.objects.get()
    assert (order.origin, order.channel, order.state) == ('diner', 'menu', 'draft')
    assert order.total == Decimal('20520') and order.lines.get().discount_pct == 5
    assert not order.courses.exists()
    assert client.post(f'/api/v1/sesiones/{sid}/llamar/').status_code == 200
    table.refresh_from_db()
    assert table.call == 'assist'
    assert client.get(f'/api/v1/sesiones/{sid}/cuenta/').status_code == 200
    paid = client.post(f'/api/v1/sesiones/{sid}/pago/simulado/', {'metodo': 'tarjeta'}, format='json')
    assert paid.status_code == 200, paid.data
    assert client.post(f'/api/v1/sesiones/{sid}/pago/simulado/', {'metodo': 'tarjeta'}, format='json').status_code == 200
    order.refresh_from_db()
    assert order.state == 'paid' and order.courses.count() == 1
    assert Payment.objects.get().method.name == 'Pago en línea'
    assert StockMove.objects.filter(kind='sale').count() == 1
    assert Stock.objects.get().qty == 9
    assert LoyaltyCard.objects.get().points > 0
    assert client.get(f"/api/v1/pedidos/{response.data['pedido']}/").data['estado'] == 'enviado'


# Falla si el cupón no llega al pedido propio o cambia al repetir la confirmación.
def test_core_coupon_and_idempotency(core):
    org, venue, owner, table, product = core
    Coupon.objects.create(organization=org, code='SOPA10', name='Sopa', percent=10)
    client, sid = opened(core)
    assert client.put(f'/api/v1/sesiones/{sid}/cupon/', {'codigo': 'SOPA10'}, format='json').status_code == 200
    for _ in range(2):
        response = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
        assert response.status_code in (200, 201), response.data
    assert Order.objects.count() == 1
    assert Order.objects.get().total == 19440
    assert Order.objects.get().lines.get().coupon_code == 'SOPA10'


# Falla si cualquiera de las cuatro rutas permite otra sede u omite el rol administrador.
@pytest.mark.parametrize('section,action', [('menu_settings','get'), ('menu_decorations','list'), ('mcp_keys','list'), ('payment_gateways','get')])
@pytest.mark.parametrize('role,expected', [('owner',200), ('admin',200), ('cashier',403), ('waiter',403)])
def test_core_admin_permissions(core, section, action, role, expected):
    org, venue, owner, table, product = core
    owner.role = role
    owner.save()
    if role != 'owner':
        owner.restaurants.add(venue)
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    response = client.post('/api/pos/v1/auth/login', {'login': owner.username, 'password':'Clave-2026', 'restaurant_id':venue.pk}, format='json')
    assert response.status_code == 200, response.data
    path = '/api/pos/v1/admin/' + section
    response = client.post(path, {'action': action}, format='json')
    assert response.status_code == expected, response.data
    other = Organization.objects.create(slug='otra-casa', name='Otra', status='active')
    foreign = Restaurant.objects.create(organization=other, slug='centro', name='Centro')
    denied = client.post(path, {'action': action, 'restaurant_id': foreign.pk}, format='json')
    assert denied.status_code in (403,404)


# Falla si WhatsApp duplica el pedido, cambia el total confirmado o envía cocina fuera de su transacción.
def test_core_whatsapp_quote_confirm(core, settings):
    org, venue, owner, table, product = core
    settings.EXPERIENCE_INTERNAL_KEY = 'prueba-interna'
    CashShift.objects.create(restaurant=venue, opened_by=owner, opening_cash=0)
    client = APIClient()
    client.credentials(HTTP_X_INTERNAL_KEY=settings.EXPERIENCE_INTERNAL_KEY)
    path = '/internal/v1/la-casa/centro/whatsapp/pedidos/'
    response = client.post(path, {'idempotencia': str(uuid4()), 'cliente': {'nombre': 'Ana', 'telefono': '+573001234567'},
        'lineas': [{'producto': product.pk, 'cantidad': 2, 'nota': 'Sin sal'}]}, format='json')
    assert response.status_code == 201, response.data
    quote = response.data
    assert quote['resumen']['total'] == 43200 and not Order.objects.exists()
    for _ in range(2):
        response = client.post(path + quote['id'] + '/confirmar/',
            {'cotizacion': quote['resumen']['cotizacion'], 'confirmado': True}, format='json')
        assert response.status_code == 200, response.data
    order = Order.objects.get()
    assert order.origin == 'ai' and order.channel == 'whatsapp' and order.courses.count() == 1
    assert order.lines.get().note == 'Sin sal'
    assert client.get(path + quote['id'] + '/').data['estado'] == 'enviado'
    org.status = 'suspended'
    org.save()
    assert client.get(path + quote['id'] + '/').status_code == 404


# Falla si una cotización vencida o con precio distinto crea un pedido o deja una comanda parcial.
@pytest.mark.parametrize('change', ['price', 'expired', 'stock', 'options'])
def test_core_whatsapp_rechecks_before_confirm(core, change):
    from experience_app.adapters.core import pos
    from experience_app.adapters.core.pos import Client
    from experience_app.adapters.core.pos import resolve
    from experience_app.adapters.core import whatsapp
    from tenancy.http import Problem
    org, venue, owner, table, product = core
    CashShift.objects.create(restaurant=venue, opened_by=owner, opening_cash=0)
    client = Client(resolve(org.slug, venue.slug))
    lines = [{'producto': product.pk, 'cantidad': 1}]
    quoted = whatsapp.quote(client, lines)
    expiry = timezone.now() + timedelta(minutes=10)
    if change == 'price':
        RestaurantPrice.objects.filter(restaurant=venue, product=product).update(price=30000)
    elif change == 'stock':
        RestaurantUnavailable.objects.create(restaurant=venue, product=product)
    elif change == 'options':
        product.diner_attributes = {'tamanos': [{'nombre': 'Grande', 'precio': 30000}]}
        product.save()
    else:
        expiry = timezone.now() - timedelta(minutes=1)
    with pytest.raises(Problem):
        whatsapp.confirm(client, str(uuid4()), lines, {'nombre': 'Ana', 'telefono': '+573001234567'},
                         quoted['cotizacion'], expiry.strftime('%Y-%m-%d %H:%M:%S'))
    assert not Order.objects.exists()


# Falla si el anticipo filtra datos privados, acepta otra sede o concilia centavos como pesos.
def test_core_reservation_public_and_reconciliation(core):
    from reservations.models import Reservation
    from experience_app.adapters.core import pos
    from experience_app.adapters.core.pos import Client
    from experience_app.adapters.core.pos import resolve
    org, venue, owner, table, product = core
    row = Reservation.objects.create(organization=org, restaurant=venue, code='R1', customer_name='Ana Pérez',
        customer_phone='+573001234567', customer_email='privado@example.com', notes='Privado',
        date=timezone.localdate()+timedelta(days=1), time_start=12, time_end=14, main_table=table,
        created_by=owner, deposit_amount=50000, deposit_state='pending')
    row.tables.add(table)
    client = APIClient()
    path = f'/api/v1/la-casa/centro/reservas/{row.pay_token}/pagos/'
    response = client.get(path)
    assert response.status_code == 200, response.data
    assert response.data['amount_in_cents'] == 5000000
    assert 'privado' not in str(response.data).lower()
    Restaurant.objects.create(organization=org, slug='norte', name='Norte')
    assert client.get(path.replace('/centro/', '/norte/')).status_code == 404
    adapter = Client(resolve(org.slug, venue.slug))
    for _ in range(2):
        assert adapter.call_kw('waiter.reservation', 'waiter_deposit_paid', [row.pay_token, 5000000, 'ref-1'])['paid']
    row.refresh_from_db()
    assert row.deposit_state == 'paid'


# Falla si el MCP no usa catálogo y banners locales o guarda al preparar sin confirmación.
def test_core_mcp_catalog_design_and_banners(core):
    from experience_app.mcp import keys
    from loyalty.models import Banner
    org, venue, owner, table, product = core
    key, raw = keys.create(org.slug, venue.slug, 'Diseño')
    client = APIClient()
    def call(name, arguments=None):
        response = client.post('/mcp/', {'jsonrpc':'2.0','id':1,'method':'tools/call',
            'params': {'name':name,'arguments':arguments or {}}}, format='json', HTTP_AUTHORIZATION='Bearer '+raw)
        assert response.status_code == 200, response.content
        result = response.json()['result']
        assert not result.get('isError'), result
        return result['structuredContent']
    assert call('listar_catalogo')['productos'][0]['precio'] == 21600
    assert call('leer_diseno_menu')
    banner = {'layout':'product', 'title':'Sopa de hoy', 'target':'product', 'targetId':product.pk, 'theme':'amber'}
    prepared = call('preparar_banners', {'banners':[banner]})
    assert not Banner.objects.exists()
    call('confirmar_cambio', {'token':prepared['token']})
    assert Banner.objects.get().title == 'Sopa de hoy'
    assert call('leer_banners')
    org.status = 'suspended'
    org.save()
    assert client.post('/mcp/', {'jsonrpc':'2.0','id':1,'method':'ping'}, format='json', HTTP_AUTHORIZATION='Bearer '+raw).status_code == 404


# Falla si dos comensales de una mesa obtienen cuentas separadas o los puntos se atribuyen al primero.
def test_core_shared_cart_points_per_diner(core):
    org, venue, owner, table, product = core
    first, sid = opened(core, account=True)
    second = APIClient()
    response = second.post('/api/v1/sesiones/', {'restaurante':org.slug, 'sede':venue.slug, 'token':table.token}, format='json')
    assert response.data['sesion']['id'] == sid
    diner = Diner.objects.get(key=second.cookies['waiter_diner'].value)
    diner.account = DinerAccount.objects.create(organization_slug=org.slug, name='Beto', email='beto@example.com', verified=True)
    diner.save()
    assert second.post(f'/api/v1/sesiones/{sid}/lineas/', {'producto_id':product.pk, 'cantidad':2}, format='json').status_code == 201
    response = first.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert response.status_code in (200,201), response.data
    assert first.post(f'/api/v1/sesiones/{sid}/pago/simulado/', {'metodo':'nequi'}, format='json').status_code == 200
    assert sorted(float(card.points) for card in LoyaltyCard.objects.all()) == [20.52, 43.2]


# Falla si las lecturas de carta crecen por producto o una foto ajena se publica.
def test_core_catalog_batched_and_foreign_photo(core, django_assert_num_queries):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext
    from experience_app.adapters.core import pos
    from experience_app.adapters.core.pos import resolve
    org, venue, owner, table, product = core
    adapter = pos.Client(resolve(org.slug, venue.slug))
    with CaptureQueriesContext(connection) as before:
        pos.load_catalog(adapter, venue.pk)
    for i in range(10):
        Product.objects.create(organization=org, name=f'Plato {i}', kind='dish', price=100)
    with django_assert_num_queries(len(before)):
        pos.load_catalog(adapter, venue.pk)
    foreign = Organization.objects.create(slug='otra-marca', name='Otra')
    dish = Product.objects.create(organization=foreign, name='Privado', kind='dish', price=100)
    photo = ProductPhoto.objects.create(product=dish, image=ContentFile(b'RIFF1234WEBP', name='privado.webp'), width=1, height=1, file_size=12)
    assert pos.fetch_gallery_image(adapter, dish.pk, photo.pk) is None


# Falla si añadir otra ronda antes del pago confirma líneas que nunca llegan al pedido propio.
def test_core_add_round_before_payment(core):
    client, sid = opened(core)
    first = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert first.status_code == 201, first.data
    assert client.post(f'/api/v1/sesiones/{sid}/lineas/', {'producto_id':core[4].pk, 'cantidad':2}, format='json').status_code == 201
    again = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert again.status_code == 201, again.data
    assert first.data['pedido'] == again.data['pedido']
    assert Order.objects.get().total == 64800 and Order.objects.get().lines.count() == 2
    assert not Order.objects.get().courses.exists()


# Falla si Wompi aprobado duplica pagos, admite un saldo distinto o cobra en otra organización.
def test_core_wompi_reconcile(core):
    from experience_app.models import Order as DinerOrder, PaymentGateway, PaymentAttempt
    from experience_app.services.online_payments import reconcile
    client, sid = opened(core)
    response = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert response.status_code == 201, response.data
    order = DinerOrder.objects.get(pk=response.data['pedido'])
    gateway = PaymentGateway.objects.create(restaurant_slug=core[0].slug, venue_slug=core[1].slug, environment='prod')
    attempt = PaymentAttempt.objects.create(gateway=gateway, session_id=sid, diner=Diner.objects.get(session_id=sid),
        order=order, amount_in_cents=2160000, method='CARD', status='APPROVED')
    for _ in range(2):
        assert reconcile(attempt).reconciled
    assert Order.objects.get().state == 'paid' and Payment.objects.count() == 1
    assert Payment.objects.get().reference == attempt.reference


# Falla si una conciliación aprobada con monto cambiado pierde su estado de revisión o paga la cuenta.
def test_core_wompi_amount_conflict(core):
    from experience_app.models import Order as DinerOrder, PaymentGateway, PaymentAttempt
    from experience_app.services.online_payments import reconcile
    client, sid = opened(core)
    response = client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    order = DinerOrder.objects.get(pk=response.data['pedido'])
    gateway = PaymentGateway.objects.create(restaurant_slug=core[0].slug, venue_slug=core[1].slug, environment='prod')
    attempt = PaymentAttempt.objects.create(gateway=gateway, session_id=sid, diner=Diner.objects.get(session_id=sid),
        order=order, amount_in_cents=2160001, method='CARD', status='APPROVED')
    assert reconcile(attempt).needs_review and not attempt.reconciled
    assert not Payment.objects.exists() and Order.objects.get().state == 'draft'


# Falla si los estados del menú no siguen a los cursos o un rol del POS libera un pedido sin pagar.
def test_core_kitchen_states_and_staff_prepayment(core):
    from experience_app.adapters.core import pos
    from experience_app.adapters.core.pos import Client
    from experience_app.adapters.core.pos import resolve
    from experience_app.adapters.core.pos import read_order_status
    from sales.services import fire
    from tenancy.http import Problem
    client, sid = opened(core)
    client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    order = Order.objects.get()
    with pytest.raises(Problem):
        fire(order, core[2])
    client.post(f'/api/v1/sesiones/{sid}/pago/simulado/', {'metodo':'tarjeta'}, format='json')
    adapter = Client(resolve(core[0].slug, core[1].slug))
    course = order.courses.get()
    assert read_order_status(adapter, order.pk).kitchen == 'received'
    for field, state in [('preparation_at','cooking'), ('ready_at','ready'), ('served_at','served')]:
        setattr(course, field, timezone.now())
        course.save()
        assert read_order_status(adapter, order.pk).kitchen == state


# Falla si un token válido cambia de tamaño al resolver o admite caracteres ajenos al contrato.
@pytest.mark.parametrize('token,valid_token', [('abc123',True), ('A'*64,True), ('abc12',False), ('A'*65,False), ('abc_123',False)])
def test_core_table_token_contract(core, token, valid_token):
    from django.core.exceptions import ValidationError
    table = core[3]
    table.token = token
    if valid_token:
        table.full_clean()
        table.save()
        assert APIClient().get(f'/api/v1/la-casa/centro/t/{token}/').status_code == 200
    else:
        with pytest.raises(ValidationError):
            table.full_clean()


def admin_client(core, role='owner'):
    org, venue, account, table, product = core
    account.role = role
    account.save()
    if role != 'owner':
        account.restaurants.add(venue)
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    response = client.post('/api/pos/v1/auth/login', {'login':account.username, 'password':'Clave-2026', 'restaurant_id':venue.pk}, format='json')
    assert response.status_code == 200, response.data
    return client


# Falla si las escrituras del dueño no usan los servicios de diseño, decoración y claves existentes.
def test_core_admin_writes(core):
    from experience_app.tests.diseno.test_decoraciones import png, b64
    client = admin_client(core)
    base = '/api/pos/v1/admin/'
    response = client.post(base+'menu_settings', {'action':'set', 'plantilla':'S1', 'tema':{'fundamentos':{'densidad':.9}}}, format='json')
    assert response.status_code == 200, response.data
    assert client.post(base+'menu_settings', {'action':'get'}, format='json').data['ajustes']['tema']['fundamentos']['densidad'] == .9
    preview = client.post(base+'menu_settings', {'action':'preview', 'plantilla':'S1', 'tema':{'fundamentos':{'densidad':.8}}}, format='json')
    assert preview.status_code == 200, preview.data
    decoration = client.post(base+'menu_decorations', {'action':'add', 'nombre':'Hoja', 'imagen':b64(png())}, format='json')
    assert decoration.status_code == 200, decoration.data
    assert client.post(base+'menu_decorations', {'action':'remove', 'decoracion_id':decoration.data['id']}, format='json').status_code == 200
    key = client.post(base+'mcp_keys', {'action':'create', 'nombre':'Diseño'}, format='json')
    assert key.status_code == 200 and key.data['clave'].startswith('wtr_'), key.data
    assert client.post(base+'mcp_keys', {'action':'revoke', 'key_id':key.data['id']}, format='json').status_code == 200
    assert client.post(base+'mcp_keys', {'action':'list', 'restaurante':'ajeno'}, format='json').status_code == 400


# Falla si el encargado escribe pasarelas o el dueño asocia un medio ajeno al pago del menú.
@pytest.mark.parametrize('role', ['owner', 'admin'])
def test_core_gateway_writing_permissions(core, role, settings):
    from cryptography.fernet import Fernet
    settings.PAYMENTS_FERNET_KEY = Fernet.generate_key().decode()
    client = admin_client(core, role)
    path = '/api/pos/v1/admin/payment_gateways'
    response = client.post(path, {'action':'set', 'configuration': {'environment':'test', 'enabled':False}}, format='json')
    assert response.status_code == (200 if role == 'owner' else 403), response.data
    if role == 'owner':
        response = client.post(path, {'action':'set', 'configuration': {'environment':'test', 'payment_method_id':999999}}, format='json')
        assert response.status_code == 400, response.data


# Falla si ventas o inventario no pueden leer un pedido autónomo sin empleado.
def test_core_autonomous_reports(core):
    from sales.reading import orders
    from sales.reports import summary
    client, sid = opened(core)
    client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    client.post(f'/api/v1/sesiones/{sid}/pago/simulado/', {'metodo':'tarjeta'}, format='json')
    result = summary(orders())
    assert result['autonomous'] == 1 and result['by_waiter'][0]['waiter'] == 'Pedido autónomo'


# Falla si una mesa queda atada a la visita anterior cuando el POS ya cerró la caja de ese turno o canceló su pedido:
# el siguiente comensal caería en esa sesión y su pedido chocaría con uno pagado o cancelado.
def test_core_table_session_ends_with_closed_shift_or_cancelled_order(core):
    from experience_app.models import TableSession
    org, venue, owner, table, product = core
    client, sid = opened(core)
    client.post(f'/api/v1/sesiones/{sid}/confirmar/', {}, format='json')
    assert client.post(f'/api/v1/sesiones/{sid}/pago/simulado/', {'metodo': 'tarjeta'}, format='json').status_code == 200
    join = lambda: APIClient().post('/api/v1/sesiones/', {'restaurante': org.slug, 'sede': venue.slug, 'token': table.token}, format='json').data['sesion']['id']
    # Pagado pero sin servir y con la caja abierta: quien llega a la mesa sigue la misma visita.
    assert join() == sid
    CashShift.objects.filter(restaurant=venue).update(state='closed')
    assert TableSession.objects.get(id=sid).state == TableSession.OPEN_STATES[1]
    second_client, second = opened(core)
    assert second != sid and TableSession.objects.get(id=sid).state == TableSession.PAID
    assert second_client.post(f'/api/v1/sesiones/{second}/confirmar/', {}, format='json').status_code in (200, 201)
    Order.objects.filter(table=table, state='draft').update(state='cancelled')
    third = join()
    assert third != second and TableSession.objects.get(id=second).state == TableSession.CLOSED
