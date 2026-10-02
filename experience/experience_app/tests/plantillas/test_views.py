"""Endpoints de plantillas: catálogo público, miniatura, ajustes internos y la plantilla en el contexto de entrada."""
from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.diseno import services as design
from experience_app.models import VenueMenuSettings
from experience_app.tests.conftest import TABLE

CATALOG = reverse('template-catalog')
SETTINGS = reverse('venue-menu-settings', args=['burger-house', 'poblado'])
PERCENT = 'experience_app.services.discount.percent_for'


@pytest.mark.django_db
def test_public_catalog_is_cacheable_and_carries_thumbnails(api_client):
    # // Falla si el catálogo pierde la caché pública o vuelve a anunciar diseños retirados.
    response = api_client.get(CATALOG)
    assert response.status_code == 200
    assert response['Cache-Control'] == 'public, max-age=3600'
    body = response.json()
    assert body['familias'] == {'B': 'Smart Menu'}
    assert [spec['codigo'] for spec in body['plantillas']] == ['S1']
    assert body['plantillas'][0]['miniatura'] is None
    assert 'resumen' not in body['plantillas'][0]['pantallas']['carrito']


# Falla si ocurre este error: una miniatura sin caché inmutable, mal tipada, o una ruta que lea fuera de la carpeta de miniaturas.
def test_thumbnail_is_a_png_with_long_cache_and_404_when_missing(api_client):
    """Atrapa una miniatura sin caché inmutable, mal tipada, o una ruta que lea fuera de la carpeta de miniaturas."""
    response = api_client.get(reverse('template-thumbnail', args=['B1']))
    assert response.status_code == 200
    assert response['Content-Type'] == 'image/png'
    assert response['Cache-Control'] == 'public, max-age=86400, immutable'
    assert response.content.startswith(b'\x89PNG')
    assert api_client.get(reverse('template-thumbnail', args=['Z9'])).status_code == 404
    assert api_client.get('/api/v1/plantillas/../miniatura/').status_code == 404


# Falla si ocurre este error: ajustes de sede legibles o escribibles sin la clave interna (las integraciones requieren autenticación interna).
@pytest.mark.django_db
def test_internal_settings_require_the_key(api_client, settings):
    """Atrapa ajustes de sede legibles o escribibles sin la clave interna (las integraciones requieren autenticación interna)."""
    settings.EXPERIENCE_INTERNAL_KEY = 'k'
    assert api_client.get(SETTINGS).status_code == 401
    assert api_client.put(SETTINGS, {'plantilla': 'A1'}, format='json', HTTP_X_INTERNAL_KEY='nope').status_code == 401
    settings.EXPERIENCE_INTERNAL_KEY = ''
    assert api_client.get(SETTINGS, HTTP_X_INTERNAL_KEY='').status_code == 401
    assert VenueMenuSettings.objects.count() == 0


@pytest.mark.django_db
def test_internal_get_returns_raw_settings_and_put_returns_the_resolved_template(api_client, settings, company_brand_stub):
    # // Falla si GET omite el tema editable o PUT no devuelve el diseño que verá el comensal.
    settings.EXPERIENCE_INTERNAL_KEY = 'k'
    before = api_client.get(SETTINGS, HTTP_X_INTERNAL_KEY='k').json()
    assert before == {'plantilla': 'S1', 'paleta': {}, 'tipografia': {}, 'actualizado': None, 'porDefecto': True, 'tema': design.defaults()}
    body = {'plantilla': 'S1', 'paleta': {'acento': '#2f7a4f'}, 'tipografia': {'display': 'Lora'}}
    with patch('experience_app.plantillas.views.resolve', return_value=TABLE), patch(PERCENT, return_value=7.5):
        response = api_client.put(SETTINGS, body, format='json', HTTP_X_INTERNAL_KEY='k')
    assert response.status_code == 200
    resolved = response.json()['plantilla']
    assert (resolved['codigo'], resolved['tokens']['acento'], resolved['tokens']['acentoTinta'], resolved['tokens']['displayFont']) == ('S1', '#2F7A4F', '#FFFFFF', 'Lora')
    assert resolved['descuento'] == {'porcentaje': 7.5, 'activo': True}
    after = api_client.get(SETTINGS, HTTP_X_INTERNAL_KEY='k').json()
    assert (after['plantilla'], after['paleta'], after['tipografia'], after['porDefecto']) == ('S1', {'acento': '#2F7A4F'}, {'display': 'Lora'}, False)


@pytest.mark.django_db
def test_internal_put_rejects_what_the_catalog_does_not_allow(api_client, settings):
    # // Falla si se guardan diseños retirados o colores sin contraste.
    settings.EXPERIENCE_INTERNAL_KEY = 'k'
    response = api_client.put(SETTINGS, {'plantilla': 'Z9'}, format='json', HTTP_X_INTERNAL_KEY='k')
    assert response.status_code == 400 and 'no está en el catálogo' in response.json()['detail']
    response = api_client.put(SETTINGS, {'plantilla': 'S1', 'paleta': {'acento': '#808080'}}, format='json', HTTP_X_INTERNAL_KEY='k')
    assert response.status_code == 400 and 'no contrasta' in response.json()['detail']
    assert VenueMenuSettings.objects.count() == 0


@pytest.mark.django_db
def test_entry_context_carries_the_resolved_template(api_client, table_tenant, catalog_stub):
    # // Falla si la entrada omite el tema Smart o aplica la marca del catálogo retirado.
    plantilla = api_client.get(reverse('entry-table', args=['burger-house', 'poblado', '8H2KQ7'])).json()['contexto']['plantilla']
    assert plantilla['codigo'] == 'S1'
    assert plantilla['tema'] == design.defaults()
    assert plantilla['layouts']['menu'] == 'S1'
    assert plantilla['tokens']['acento'] == '#6755A0'
    assert plantilla['descuento'] == {'porcentaje': 5.0, 'activo': True}  # pos.config no lo fijó: el 5 % del diseño


# Falla si una clave interna no ASCII provoca un error del servidor en lugar de rechazo.
@pytest.mark.django_db
def test_non_ascii_internal_key_is_unauthorized_not_server_error(api_client, settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'secret'
    assert api_client.get(SETTINGS, HTTP_X_INTERNAL_KEY='ñ').status_code == 401


@pytest.mark.django_db
def test_catalog_for_venue_matches_saved_brand_and_hides_implementation_notes(api_client):
    # // Falla si el catálogo de sede omite sus tokens resueltos o filtra notas internas.
    from experience_app.models import MenuTemplate
    from experience_app.plantillas.services import final_tokens
    inputs = {'color': '#000000', 'fuente': 'Lora', 'radio': 24}
    with patch('experience_app.plantillas.views.resolve', return_value=TABLE), patch('experience_app.plantillas.views.brand.brand_inputs', return_value=inputs):
        response = api_client.get(CATALOG, {'restaurante': 'burger-house', 'sede': 'poblado'})
    assert response['Cache-Control'] == 'no-store'
    for spec in response.json()['plantillas']:
        original = MenuTemplate.objects.get(code=spec['codigo']).spec
        assert spec['tokens'] == final_tokens(original, inputs, {}, {})
        for screen in spec['pantallas'].values():
            assert not {'resumen', 'estructura', 'motivo', 'reconstruido'}.intersection(screen)
