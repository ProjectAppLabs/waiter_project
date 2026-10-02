import logging
from dataclasses import replace
from unittest.mock import patch

import pytest
from django.conf import settings
from django.urls import reverse

from experience_app.adapters.core.pos import Client
from django.db import DatabaseError, OperationalError
from experience_app.services import brand
from experience_app.tests.conftest import BRAND, DELIVERY, TABLE, UNTOUCHED_COMPANY

READ = 'experience_app.services.brand.pos.read_company_brand'
CLIENT = 'experience_app.services.brand.Client'
# El restaurante lo cambió todo en el sistema propio. Color claro a propósito: la tinta debe salir oscura, no la blanca del tema inicial.
EDITED_COMPANY = replace(UNTOUCHED_COMPANY, name='La Provincia', color='#f2c94c', font='Lora', radius=24, tagline='Cocina de autor',
                         greeting='Buenas noches', waiter_name='Sofía', welcome='Bienvenido a casa', has_logo=True, version='20260906120000')
INVALIDATE = reverse('invalidate-menu', args=['burger-house', 'poblado'])


# Falla si ocurre este error: un color del sistema propio con la tinta calculada para el color inicial (texto blanco ilegible sobre amarillo).
@patch(READ, return_value=EDITED_COMPANY)
@patch(CLIENT)
def test_core_wins_field_by_field_and_the_theme_is_derived_from_its_color(client, read):
    """Atrapa un color del sistema propio con la tinta calculada para el color inicial (texto blanco ilegible sobre amarillo)."""
    view = brand.brand_view(TABLE)
    assert view == {
        'nombre': 'La Provincia', 'lema': 'Cocina de autor', 'saludo': 'Buenas noches', 'mesero': 'Sofía', 'bienvenida': 'Bienvenido a casa',
        'logo': '/api/v1/burger-house/poblado/logo/?v=20260906120000',
        'color': '#F2C94C', 'colorTexto': '#1A1815', 'colorSuave': '#FEFAED', 'fuente': 'Lora', 'radio': 24, 'contraste': 11.16,
    }


# Falla si ocurre este error: un campo vacío en el sistema propio que borre el valor del onboarding (saludo en blanco, color por defecto de Waiter).
@patch(READ, return_value=UNTOUCHED_COMPANY)
@patch(CLIENT)
def test_initial_fills_every_field_the_restaurant_left_empty(client, read):
    """Atrapa un campo vacío en el sistema propio que borre el valor del onboarding (saludo en blanco, color por defecto de Waiter)."""
    view = brand.brand_view(TABLE)
    assert view == {'nombre': 'Burger House', **BRAND, 'contraste': 9.33}


# Falla si ocurre este error: que un solo campo editado en el sistema propio arrastre el resto (el color inicial perdido por cambiar el saludo).
@patch(READ, return_value=replace(UNTOUCHED_COMPANY, greeting='Hola', radius=4))
@patch(CLIENT)
def test_precedence_is_per_field_not_all_or_nothing(client, read):
    """Atrapa que un solo campo editado en el sistema propio arrastre el resto (el color inicial perdido por cambiar el saludo)."""
    view = brand.brand_view(TABLE)
    assert (view['saludo'], view['radio']) == ('Hola', 4)
    assert (view['color'], view['fuente'], view['mesero'], view['lema']) == ('#7A2E2A', 'Fraunces', 'Alex', 'Cocina de barrio')


# Falla si ocurre este error: un comensal sin color, fuente o radio (CSS con variables vacías) en un restaurante recién creado.
@patch(READ, return_value=UNTOUCHED_COMPANY)
@patch(CLIENT)
def test_a_tenant_without_initial_brand_still_gets_a_complete_theme(client, read):
    """Atrapa un comensal sin color, fuente o radio (CSS con variables vacías) en un restaurante recién creado."""
    view = brand.brand_view(DELIVERY)
    assert view['nombre'] == 'Burger House' and view['logo'] is None and view['saludo'] == ''
    assert (view['color'], view['colorTexto'], view['fuente'], view['radio']) == ('#C1873A', '#1A1815', 'Instrument Serif', 14)


# Falla si ocurre este error: un 503 en la entrada del comensal por la marca, o una caída recordada un minuto después de que el sistema propio volvió.
@patch(READ, side_effect=OperationalError('down'))
@patch(CLIENT)
def test_when_core_is_down_the_initial_brand_is_served_and_the_failure_is_not_cached(client, read):
    """Atrapa un 503 en la entrada del comensal por la marca, o una caída recordada un minuto después de que el sistema propio volvió."""
    assert brand.brand_view(TABLE) == {'nombre': 'Burger House', **BRAND, 'contraste': 9.33}
    read.side_effect = None
    read.return_value = replace(UNTOUCHED_COMPANY, name='Ya volvió')
    assert brand.brand_view(TABLE)['nombre'] == 'Ya volvió'
    assert read.call_count == 2


# Falla si ocurre este error: una marca que consulta el sistema propio en cada comensal, o una invalidación que no invalida.
@patch(READ, return_value=EDITED_COMPANY)
@patch(CLIENT)
def test_brand_hits_core_once_until_invalidated(client, read):
    """Atrapa una marca que consulta el sistema propio en cada comensal, o una invalidación que no invalida."""
    brand.brand_view(TABLE)
    brand.brand_view(TABLE)
    assert read.call_count == 1
    brand.invalidate('burger-house', 'poblado')
    brand.brand_view(TABLE)
    assert read.call_count == 2


# Falla si ocurre este error: una marca cacheada con el tiempo de la carta (u otro): el contrato promete un cambio visible en ≤ 1 minuto.
@patch(READ, return_value=EDITED_COMPANY)
@patch(CLIENT)
def test_brand_cache_lives_brand_cache_seconds(client, read):
    """Atrapa una marca cacheada con el tiempo de la carta (u otro): el contrato promete un cambio visible en ≤ 1 minuto."""
    with patch('experience_app.services.brand.cache.set') as cache_set:
        brand.brand_view(TABLE)
    assert cache_set.call_args.args[1:] == (EDITED_COMPANY, settings.BRAND_CACHE_SECONDS)


# Falla si ocurre este error: un aviso de "algo cambió en el sistema propio" que refresque la carta pero deje la marca vieja un minuto más.
@patch(READ, return_value=EDITED_COMPANY)
@patch(CLIENT)
def test_internal_invalidation_of_the_menu_also_drops_the_brand(client, read, api_client, settings):
    """Atrapa un aviso de "algo cambió en el sistema propio" que refresque la carta pero deje la marca vieja un minuto más."""
    settings.EXPERIENCE_INTERNAL_KEY = 'k'
    brand.brand_view(TABLE)
    assert api_client.post(INVALIDATE, HTTP_X_INTERNAL_KEY='k').status_code == 200
    brand.brand_view(TABLE)
    assert read.call_count == 2


# Falla si ocurre este error: un logo que va al sistema propio por cada comensal, o un logo viejo servido bajo la versión nueva.
@patch('experience_app.services.brand.pos.fetch_company_logo', return_value=(b'\x89PNG', 'image/png'))
@patch(CLIENT)
def test_logo_hits_core_once_per_version(client, fetch):
    """Atrapa un logo que va al sistema propio por cada comensal, o un logo viejo servido bajo la versión nueva."""
    assert brand.get_logo(TABLE, EDITED_COMPANY) == (b'\x89PNG', 'image/png')
    brand.get_logo(TABLE, EDITED_COMPANY)
    assert fetch.call_count == 1
    brand.get_logo(TABLE, replace(EDITED_COMPANY, version='20260907000000'))
    assert fetch.call_count == 2


# Falla si ocurre este error: un 5xx en logo/ con la marca ya en caché diciendo "hay logo", o una caída recordada una hora bajo esa versión.
@pytest.mark.parametrize('failure', [OperationalError('down'), DatabaseError('No se pudo leer el logo')])
@patch('experience_app.services.brand.pos.fetch_company_logo')
@patch(CLIENT)
def test_logo_fetch_failure_is_none_and_not_cached(client, fetch, failure, caplog):
    """Atrapa un 5xx en logo/ con la marca ya en caché diciendo "hay logo", o una caída recordada una hora bajo esa versión."""
    fetch.side_effect = failure
    with caplog.at_level(logging.WARNING):
        assert brand.get_logo(TABLE, EDITED_COMPANY) is None
    assert 'logo' in caplog.text
    fetch.side_effect = None
    fetch.return_value = (b'\x89PNG', 'image/png')
    assert brand.get_logo(TABLE, EDITED_COMPANY) == (b'\x89PNG', 'image/png')
    assert fetch.call_count == 2
