from dataclasses import replace
from unittest.mock import patch

import pytest
from django.urls import reverse

from django.db import DatabaseError, OperationalError
from experience_app.tests.conftest import DELIVERY, UNTOUCHED_COMPANY

LOGO = reverse('company-logo', args=['burger-house', 'poblado'])
ENTRY = reverse('entry-table', args=['burger-house', 'poblado', '8H2KQ7'])
READ = 'experience_app.services.brand.pos.read_company_brand'
FETCH = 'experience_app.services.brand.pos.fetch_company_logo'
RESOLVE = 'experience_app.views.logo.resolve'
WITH_LOGO = replace(UNTOUCHED_COMPANY, has_logo=True)
PNG = (b'\x89PNG\r\n\x1a\n', 'image/png')


# Falla si ocurre este error: un logo sin nosniff/CSP (un binario que el navegador interprete), sin caché pública, o con el tipo equivocado.
@patch(FETCH, return_value=PNG)
@patch(READ, return_value=WITH_LOGO)
@patch(RESOLVE, return_value=DELIVERY)
def test_logo_streams_the_raster_with_the_same_headers_as_photos(resolve, read, fetch, api_client):
    """Atrapa un logo sin nosniff/CSP (un binario que el navegador interprete), sin caché pública, o con el tipo equivocado."""
    response = api_client.get(f'{LOGO}?v=20260905010203')
    assert response.status_code == 200
    assert response.content == b'\x89PNG\r\n\x1a\n'
    assert response['Content-Type'] == 'image/png'
    assert response['Cache-Control'] == 'public, max-age=86400, immutable'
    assert response['X-Content-Type-Options'] == 'nosniff'
    assert response['Content-Security-Policy'] == "default-src 'none'; sandbox"
    assert response['Content-Disposition'] == 'inline; filename="logo"'
    assert fetch.call_args.args[0].restaurant.slug == DELIVERY.venue_slug


# Falla si ocurre este error: una URL vieja (marca en caché de otro comensal) cacheada un día como si fuera la versión actual.
@patch(FETCH, return_value=PNG)
@patch(READ, return_value=WITH_LOGO)
@patch(RESOLVE, return_value=DELIVERY)
def test_logo_with_a_stale_version_is_served_but_never_promised_immutable(resolve, read, fetch, api_client):
    """Atrapa una URL vieja (marca en caché de otro comensal) cacheada un día como si fuera la versión actual."""
    response = api_client.get(f'{LOGO}?v=19990101000000')
    assert response.status_code == 200
    assert response['Cache-Control'] == 'no-store'


# Falla si ocurre este error: una segunda petición del logo que vuelve al sistema propio (una lectura por comensal).
@patch(FETCH, return_value=PNG)
@patch(READ, return_value=WITH_LOGO)
@patch(RESOLVE, return_value=DELIVERY)
def test_logo_is_served_from_cache_on_the_second_request(resolve, read, fetch, api_client):
    """Atrapa una segunda petición del logo que vuelve al sistema propio (una lectura por comensal)."""
    api_client.get(LOGO)
    assert api_client.get(LOGO).status_code == 200
    assert fetch.call_count == 1 and read.call_count == 1


# Falla si ocurre este error: una ida al sistema propio (o un placeholder suyo) por cada comensal en un restaurante sin logo.
@patch(FETCH)
@patch(READ, return_value=UNTOUCHED_COMPANY)
@patch(RESOLVE, return_value=DELIVERY)
def test_logo_is_404_without_touching_core_when_the_company_has_none(resolve, read, fetch, api_client):
    """Atrapa una ida al sistema propio (o un placeholder suyo) por cada comensal en un restaurante sin logo."""
    response = api_client.get(LOGO)
    assert response.status_code == 404
    assert response.json() == {'detail': 'sin logo'}
    assert fetch.call_count == 0


# Falla si ocurre este error: un SVG servido como logo: el adaptador devuelve None y la ruta debe negarlo, no servir bytes vacíos.
@patch(FETCH, return_value=None)
@patch(READ, return_value=WITH_LOGO)
@patch(RESOLVE, return_value=DELIVERY)
def test_logo_is_404_when_the_binary_is_not_a_raster(resolve, read, fetch, api_client):
    """Atrapa un SVG servido como logo: el adaptador devuelve None y la ruta debe negarlo, no servir bytes vacíos."""
    assert api_client.get(LOGO).status_code == 404
    response = api_client.get(LOGO)
    assert response.status_code == 404
    assert response.json() == {'detail': 'sin logo'}
    assert fetch.call_count == 1


# Falla si ocurre este error: un 500 (o un 503 con JSON) en un <img>: el navegador solo entiende "no hay imagen".
@pytest.mark.parametrize('read_fails,fetch_fails', [
    (OperationalError('down'), None),                 # la marca no llega: no se toca el logo
    (None, OperationalError('down')),                 # marca en caché con "hay logo", el sistema propio se cae al bajar el binario
    (None, DatabaseError('No se pudo leer el logo')),   # ídem con un fallo de lectura
], ids=['brand-read-fails', 'binary-fetch-unavailable', 'binary-fetch-error'])
@patch(FETCH)
@patch(READ)
@patch(RESOLVE, return_value=DELIVERY)
def test_logo_is_404_not_500_when_core_is_down(resolve, read, fetch, read_fails, fetch_fails, api_client):
    """Atrapa un 500 (o un 503 con JSON) en un <img>: el navegador solo entiende "no hay imagen"."""
    read.side_effect = read_fails
    read.return_value = WITH_LOGO
    fetch.side_effect = fetch_fails
    response = api_client.get(LOGO)
    assert response.status_code == 404
    assert response.json() == {'detail': 'sin logo'}
    assert fetch.call_count == (0 if read_fails else 1)
    # El fallo no se cachea: cuando el sistema propio vuelve, el logo sale en la siguiente petición.
    read.side_effect = fetch.side_effect = None
    fetch.return_value = PNG
    assert api_client.get(LOGO).status_code == 200


# Falla si ocurre este error: una marca con la URL del sistema propio en el logo, sin versión, o el logo inicial cuando el sistema propio ya tiene uno.
@pytest.mark.django_db  # la entrada resuelve la plantilla de la sede (Plan H): lee la base
def test_entry_points_the_logo_to_the_experience_route_with_its_version(api_client, table_tenant, catalog_stub, company_brand_stub):
    """Atrapa una marca con la URL del sistema propio en el logo, sin versión, o el logo inicial cuando el sistema propio ya tiene uno."""
    company_brand_stub.return_value = WITH_LOGO
    marca = api_client.get(ENTRY).json()['contexto']['marca']
    assert marca['logo'] == '/api/v1/burger-house/poblado/logo/?v=20260905010203'
    assert marca['color'] == '#7A2E2A'


# Falla si ocurre este error: un logo del onboarding perdido porque el sistema propio dijo "sin logo".
@pytest.mark.django_db
def test_entry_keeps_the_initial_logo_when_core_has_none(api_client, table_tenant, catalog_stub):
    """Atrapa un logo del onboarding perdido porque el sistema propio dijo "sin logo"."""
    tenant = table_tenant
    with patch('experience_app.views.context.resolve', return_value=replace(tenant, brand={**tenant.brand, 'logo': 'https://cdn/logo.png'})):
        marca = api_client.get(ENTRY).json()['contexto']['marca']
    assert marca['logo'] == 'https://cdn/logo.png'
