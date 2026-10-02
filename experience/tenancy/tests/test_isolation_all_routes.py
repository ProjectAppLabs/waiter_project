"""Inventario ejecutable de rutas: toda incorporación exige un escenario de aislamiento.

Una ruta sin identificador (por ejemplo /company) opera sobre A y debe devolver solo A.
Las rutas con recursos de B deben rechazarlos con 403/404, también al escribir.
"""
import re
from datetime import date
from uuid import uuid4

import pytest
from django.core.files.base import ContentFile
from django.forms.models import model_to_dict
from django.urls import URLResolver, get_resolver
from django.utils import timezone
from rest_framework.test import APIClient
from PIL import Image

from billing.models import Resolution, SalesDocument
from catalog.models import ProductPhoto
from catalog.images import store_image
from catalog.services import seed_organization
from catalog.tests.conftest import environment as environment, setup as setup
from inventory.models import PurchaseRequest
from loyalty.models import Banner
from loyalty.tests.test_permissions import context as context
from sales.models import Course, Order
from sales.tests.helpers import cash_method
from tenancy.models import SubscriptionCharge
from .helpers import PASSWORD, account, organization, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/pos/v1/'
SECRET = 'SECRETO-B'


def registered(patterns=None, prefix=''):
    for pattern in patterns if patterns is not None else get_resolver().url_patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from registered(pattern.url_patterns, route)
        elif route.startswith(BASE.lstrip('/')) and not route.endswith('^.*$'):
            cls = pattern.callback.view_class
            methods = pattern.callback.view_initkwargs.get('http_method_names', cls.http_method_names)
            for method in methods:
                if method in ('get', 'post', 'put', 'patch', 'delete') and hasattr(cls, method):
                    yield method, route[len(BASE)-1:]


ROUTES = list(registered())


@pytest.fixture
def isolated(context, settings):
    settings.SALES_SSE_TEST_ITERATIONS = 1
    s = context
    org_b = s['org']
    org_b.name = SECRET
    org_b.brand_logo = b'LOGO-B'
    org_b.save()
    for key in ('dish', 'ingredient', 'customer', 'person', 'category', 'supplier', 'r1'):
        obj = s[key]
        obj.name = SECRET
        obj.save()
    org_a = organization('cliente-a')
    seed_organization(org_a)
    venue_a = restaurant(org_a)
    actor = account(org_a)
    client = pos_client(actor)
    order = Order.objects.get(pk=s['order']['id'])
    course = Course.objects.create(order=order, index=1)
    s['dish'].image, _ = store_image(org_b, Image.new('RGB', (8, 8), 'red'))
    s['dish'].save()
    floor = s['r1'].floors.get()
    floor.background.save('fondo.webp', ContentFile(b'RIFF1234WEBP'))
    floor.plan = {**floor.plan, 'images': [{'id': 'imagen-b', 'file': floor.background.name}]}
    floor.save()
    photo = ProductPhoto.objects.create(product=s['dish'], image=ContentFile(b'RIFF1234WEBP', name='foto.webp'), width=1, height=1, file_size=12)
    banner = Banner.objects.create(organization=org_b, title=SECRET, image=ContentFile(b'RIFF1234WEBP', name='banner.webp'))
    purchase = PurchaseRequest.objects.create(restaurant=s['r1'], supplier=s['supplier'], account=s['person'])
    resolution = Resolution.objects.create(organization=org_b, kind='pos', prefix='B', number_from=1, number_to=100,
        next_number=2, valid_from=date(2026, 1, 1), valid_to=date(2027, 1, 1))
    document = SalesDocument.objects.create(organization=org_b, restaurant=s['r1'], order=order, kind='pos', resolution=resolution,
        number=SECRET, buyer=s['customer'], issued_at=timezone.now(), created_by=s['person'], request_key=uuid4().hex)
    charge = SubscriptionCharge.objects.create(organization=org_b, period='2026-10', amount=999, due_date=date(2026, 10, 15))
    s.update(org_a=org_a, actor=actor, venue_a=venue_a, actor_client=client, course=course, photo=photo, banner=banner,
        purchase=purchase, resolution=resolution, document=document, subscription=charge, order_obj=order)
    return s


def scenario(s, method, route):
    """Lista explícita: nunca se acepta automáticamente una ruta nueva sin revisar sus referencias."""
    rid, oid = s['r1'].pk, s['order']['id']
    body, query = {}, {}
    target = '<' in route
    ids = {'restaurant_id': rid, 'image_id': 'imagen-b', 'code': s['card'].code, 'token': s['reservation'].pay_token}
    resources = {
        'products': s['dish'].pk, 'categories': s['category'].pk, 'inventory': s['ingredient'].pk,
        'photos': s['dish'].pk, 'floors': s['r1'].floors.get().pk, 'tables': s['table'].pk,
        'shifts': s['order_obj'].shift_id, 'orders': oid, 'payment-methods': cash_method(s).pk,
        'courses': s['course'].pk, 'customers': s['customer'].pk, 'reservations': s['reservation'].pk,
        'banners': s['banner'].pk, 'documents': s['document'].pk, 'restaurants': rid,
        'team': s['person'].pk, 'notifications': s['notification'].pk,
    }
    if '<int:pk>' in route:
        if route.startswith('billing/orders/'):
            ids['pk'] = oid
        elif route.startswith('billing/resolutions/'):
            ids['pk'] = s['resolution'].pk
        elif route.startswith('inventory/requests/'):
            ids['pk'] = s['purchase'].pk
        elif route.startswith('photos/gallery/'):
            ids['pk'] = s['photo'].pk
        elif route.startswith('catalog/restaurants/'):
            ids['pk'] = s['dish'].pk
        else:
            ids['pk'] = resources[route.split('/')[0]]
    path = re.sub(r'<[^:>]+:([^>]+)>', lambda m: str(ids[m[1]]), route)
    scoped_get = {'catalog', 'inventory', 'inventory/requests', 'floors', 'tables/calls', 'shifts', 'shifts/open',
        'orders', 'payment-methods', 'settings', 'sales/summary', 'sales/orders', 'sales/insights', 'kitchen/tickets',
        'events', 'banners', 'benefits', 'reservations', 'reservations/schedule', 'reservations/timeline', 'reservations/slots',
        'reservations/tables', 'reports/profitability', 'billing/orders'}
    if method == 'get' and (route in scoped_get or route.startswith('inventory/<')):
        target = True
        query = {'restaurant_id': rid, 'date': date.today().isoformat(), 'time_start': 12, 'people': 2}
    if method == 'get' and route == 'shifts/closings':
        target, query = True, {'restaurant_ids': str(rid)}
    if route == 'reservations/schedule':
        target, query = True, {'restaurant_id': rid}
    if route == 'settings':
        target, query = True, {'restaurant_id': rid}
    if route.startswith('admin/'):
        target = True
        body = {'restaurant_id': rid, 'action': 'list' if route.endswith(('mcp_keys', 'menu_decorations')) else 'get'}
    if route.startswith('lines/'):
        target, body = True, {'line_ids': [s['order']['lines'][0]['id']]}
    if method == 'post' and route in ('orders', 'shifts', 'floors', 'inventory/requests', 'reservations'):
        target = True
        body = {
            'orders': {'restaurant_id': rid, 'uuid': str(uuid4()), 'service': 'takeout', 'lines': [], 'fire': False},
            'shifts': {'restaurant_id': rid, 'opening_cash': 0, 'notes': ''},
            'floors': {'restaurant_id': rid, 'name': 'Nuevo'},
            'inventory/requests': {'restaurant_id': rid, 'ingredient_id': s['ingredient'].pk},
            'reservations': {'restaurant_id': rid, 'customer_name': 'Nuevo', 'people': 2, 'date': date.today().isoformat(), 'time_start': 12, 'table_ids': [s['table'].pk]},
        }[route]
    if route.startswith('internal/reservations/'):
        body = {'reference': 'Referencia', 'amount': 10}
    if route.startswith('notifications/'):
        body = {}
    if route == 'brand/logo':
        target = True
    specific = {
        'inventory/requests/<int:pk>/mark': {'state': 'sent'},
        'orders/<int:pk>/lines': {'line_ids': [s['order']['lines'][0]['id']]},
        'orders/<int:pk>/tip': {'amount': 10},
        'floors/<int:pk>/zone-staff': {'assignments': {}},
        'shifts/<int:pk>/zones': {'floor_id': s['r1'].floors.get().pk, 'assignments': {}},
        'tables/<int:pk>/call': {'kind': 'assist'},
        'orders/<int:pk>/redeem': {'card_id': s['card'].pk},
        'billing/orders/<int:pk>/document': {'customer_id': s['customer'].pk, 'request_key': uuid4().hex},
    }
    if method in ('post', 'put', 'delete') and route in specific:
        body = specific[route]
        if route == 'orders/<int:pk>/lines' and method == 'post':
            body = {'lines': [], 'fire': False}
    if method == 'get' and route == 'reservations':
        query = {'table_id': s['table'].pk}
    if method == 'post' and route == 'products':
        target, body = True, {'name': 'Ingrediente A', 'kind': 'ingredient', 'unit_id': s['kg'].pk, 'pantry_category': 'dry'}
    if method == 'post' and route == 'payment-methods':
        target, body = True, {'name': 'Banco A', 'type': 'bank', 'restaurant_ids': [rid]}
    # Rutas sin selección de un recurso: los datos y las escrituras pertenecen siempre a la sesión A.
    implicit = {'subscription', 'org', 'restaurants', 'team', 'notifications', 'notifications/read_all',
        'products', 'categories', 'taxes', 'taxes/regime', 'units', 'suppliers', 'catalog/overview', 'catalog/restaurants',
        'payment-methods', 'settings/cash', 'settings/roles', 'customers', 'customers/id-types', 'loyalty/program',
        'benefits', 'banners', 'me/notify-prefs', 'reports/summary', 'company', 'brand', 'brand/logo',
        'documents', 'billing/settings', 'billing/resolutions'}
    if not target:
        assert route in implicit or route.startswith('auth/'), f'Falta un escenario para {method} {route}'
        if method in ('post', 'put', 'patch'):
            bodies = {
                'products': {'name': 'Plato A', 'kind': 'dish', 'price': 10, 'category_ids': [], 'tax_ids': []},
                'categories': {'name': 'Categoría A'}, 'suppliers': {'name': 'Proveedor A'},
                'restaurants': {'name': 'Sede A', 'slug': 'nueva'},
                'team': {'name': 'Persona A', 'email': 'a@example.com', 'role': 'owner'},
                'customers': {'name': 'Cliente A'}, 'payment-methods': {'name': 'Banco A', 'type': 'bank'},
                'settings/cash': {'tolerance': 5}, 'settings/roles': s['org_a'].role_policy,
                'taxes/regime': {'regime': 'inc'}, 'me/notify-prefs': {'prefs': {'system_sound': False}},
                'banners': [], 'benefits': {}, 'company': {'legal_name': 'Empresa A'}, 'brand': {'tagline': 'Hola A'},
                'loyalty/program': {'active': False}, 'billing/settings': {'send_email': False},
                'billing/resolutions': {'kind': 'pos', 'prefix': 'A', 'number_from': 1, 'number_to': 100, 'next_number': 1,
                    'valid_from': '2026-01-01', 'valid_to': '2027-01-01'},
                'auth/login': {'login': s['person'].username, 'password': PASSWORD, 'restaurant_id': rid},
                'auth/request_code': {'login': s['person'].username},
                'auth/activate': {'login': s['person'].username, 'code': '123456', 'password': PASSWORD},
                'auth/change_password': {'current': PASSWORD, 'next': PASSWORD},
            }
            body = bodies.get(route, {})
    return path, query, body, target


# Falla si una ruta registrada lee o modifica recursos de B con la sesión de A, o una ruta nueva queda sin escenario.
@pytest.mark.parametrize('method,route', ROUTES, ids=[f'{m} {r}' for m, r in ROUTES])
def test_all_registered_pos_routes(isolated, method, route):
    s = isolated
    path, query, body, target = scenario(s, method, route)
    tracked = [s[k] for k in ('org', 'r1', 'person', 'dish', 'ingredient', 'customer', 'card', 'reservation',
                              'notification', 'document', 'resolution', 'subscription', 'order_obj', 'purchase', 'banner')]
    before = [model_to_dict(obj) for obj in tracked]
    from urllib.parse import urlencode
    url = BASE + path + ('?' + urlencode(query) if query else '')
    response = getattr(s['actor_client'], method)(url, body, format='json')
    assert response.status_code in ((403, 404) if target else (200, 201, 400, 401, 403, 409)), (method, route, getattr(response, 'data', None))
    content = b''.join(response.streaming_content) if response.streaming else response.content
    assert SECRET.encode() not in content
    for obj, previous in zip(tracked, before):
        obj.refresh_from_db()
        assert model_to_dict(obj) == previous, (method, route, obj)


# Falla si las fotos, planos, banners o anticipos ignoran ?org= y sirven recursos del otro cliente.
@pytest.mark.parametrize('route', ['photos/<int:pk>', 'photos/gallery/<int:pk>', 'floors/<int:pk>/background',
    'floors/<int:pk>/images/<str:image_id>', 'banners/<int:pk>/image', 'public/reservations/<str:token>'])
def test_public_resources_query_organization(isolated, route):
    s = isolated
    path, _, _, _ = scenario(s, 'get', route)
    response = APIClient().get(BASE + path, {'org': s['org_a'].slug})
    assert response.status_code in (403, 404)
    assert SECRET.encode() not in response.content
    own = APIClient().get(BASE + path, {'org': s['org'].slug})
    assert own.status_code == 200, getattr(own, 'data', None)
    own.close()


# Falla si un slug de B acepta el token de una mesa de A al leer carta o crear una sesión del comensal.
def test_diner_foreign_table_token(isolated):
    from tables.models import Table
    s = isolated
    table_a = Table.objects.create(floor=s['venue_a'].floors.get(), number=1)
    client = APIClient()
    response = client.get(f"/api/v1/{s['org'].slug}/{s['r1'].slug}/t/{table_a.token}/")
    assert response.status_code == 404 and SECRET.encode() not in response.content
    response = client.post('/api/v1/sesiones/', {'restaurante': s['org'].slug, 'sede': s['r1'].slug, 'token': table_a.token}, format='json')
    assert response.status_code == 404 and SECRET.encode() not in response.content


# Falla si métodos no admitidos en resoluciones causan 500 por recibir argumentos incompatibles.
@pytest.mark.parametrize('method,path', [('patch', 'billing/resolutions'), ('get', 'billing/resolutions/1'), ('post', 'billing/resolutions/1')])
def test_resolution_unsupported_methods(isolated, method, path):
    assert getattr(isolated['actor_client'], method)(BASE + path, {}, format='json').status_code == 405


# Falla si el logo público toma la organización de otro cliente o comparte su contenido por error.
def test_public_logo_organization(isolated):
    client = APIClient()
    foreign = client.get(BASE + 'brand/logo', {'org': isolated['org'].slug})
    assert foreign.status_code == 200 and foreign.content == b'LOGO-B'
    own = client.get(BASE + 'brand/logo', {'org': isolated['org_a'].slug})
    assert own.status_code == 404 and b'LOGO-B' not in own.content
