from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


from experience_app.adapters.core.pos import Catalog, Category, CompanyBrand, Product
from experience_app.adapters.core.context import RestaurantContext

BRAND = {'color': '#7A2E2A', 'colorTexto': '#FFFFFF', 'colorSuave': '#F2EAEA', 'fuente': 'Fraunces', 'radio': 14, 'lema': 'Cocina de barrio', 'saludo': '', 'mesero': 'Alex', 'bienvenida': '¿Qué te provoca hoy?', 'logo': None}
TABLE = RestaurantContext('burger-house', 'Burger House', 'poblado', 'Poblado', '8H2KQ7', 8, 9, BRAND, 1)
DELIVERY = RestaurantContext('burger-house', 'Burger House', 'poblado', 'Poblado', None, None, None, restaurant_id=1)
# El sistema propio sin nada editado: todo vacío, así que la marca del comensal usa los valores iniciales (BRAND).
UNTOUCHED_COMPANY = CompanyBrand(name='', color='', font='', radius=None, tagline='', greeting='', waiter_name='', welcome='',
                                 has_logo=False, version='20260905010203')
# template_id distinto del id: atrapa a quien pida la foto con el id del producto en vez del de la plantilla.
# final_price distinto de price: atrapa a quien muestre o sume la base gravable en vez de lo que se paga.
# image_origin='ai' en el plato con foto: atrapa una carta que no avise «Imágenes de referencia».
ANGUS = Product(id=3, name='Hamburguesa Angus', price=36900.0, category_ids=[2], tax_ids=[5], template_id=21,
                description='Carne angus 200 g, queso madurado', favorite=True, has_image=True, image_version='20260905010203',
                image_origin='ai', final_price=43911.0)
LIMONADA = Product(id=7, name='Limonada de Coco', price=9900.0, category_ids=[1], tax_ids=[5],
                   template_id=22, description='', favorite=False, has_image=False)
CATALOG = Catalog(company_name='Burger House', products=[ANGUS, LIMONADA], categories=[Category(1, 'Bebidas', 1), Category(2, 'Hamburguesas', 2)])


@pytest.fixture(autouse=True)
def design_system_defined(request, monkeypatch):
    """Las pruebas anteriores a la regla «primero el sistema de diseño» preparan plantillas sobre el tema de fábrica; la
    regla se prueba aparte (marca `sistema_de_diseno_real`) con la función real."""
    if 'sistema_de_diseno_real' not in request.keywords:
        from experience_app.mcp import tools
        monkeypatch.setattr(tools, '_require_design_system', lambda theme: None)


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def company_brand_stub():
    """el sistema propio responde la marca sin nada editado: la entrada no sale a la red por la marca y se usa la marca inicial."""
    with patch('experience_app.services.brand.pos.read_company_brand', return_value=UNTOUCHED_COMPANY) as read, patch('experience_app.services.banners.for_menu', return_value=None):
        yield read


@pytest.fixture
def table_tenant(company_brand_stub):
    with patch('experience_app.views.sessions.resolve', return_value=TABLE), patch('experience_app.views.context.resolve', return_value=TABLE):
        yield TABLE


@pytest.fixture
def catalog_stub():
    with patch('experience_app.services.catalog.get_catalog', return_value=CATALOG):
        yield CATALOG


@pytest.fixture
def two_diners(db):
    from experience_app.services.sessions import open_session
    session, ana = open_session(TABLE, None)
    _, beto = open_session(TABLE, None)
    return session, ana, beto


@pytest.fixture(autouse=True)
def local_restaurant(request):
    """Las reglas del comensal resuelven su organización y mesa en la base propia."""
    if 'core' in request.fixturenames:
        return
    request.getfixturevalue('db')
    from tenancy.models import Organization, Restaurant
    from tables.models import Floor, Table
    org = Organization.objects.create(slug='burger-house', name='Burger House', status='active')
    venue = Restaurant.objects.create(id=1, organization=org, slug='poblado', name='Poblado')
    Restaurant.objects.create(id=2, organization=org, slug='laureles', name='Laureles')
    floor = Floor.objects.create(restaurant=venue, name='Salón')
    Table.objects.create(id=9, floor=floor, number=8, token='8H2KQ7')
