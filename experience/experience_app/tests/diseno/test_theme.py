"""Tema v2: contrato, resolución segura, persistencia y compatibilidad con el POS/MCP."""
from copy import deepcopy
from dataclasses import replace
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.apps import apps
from django.db import connection
from django.urls import reverse

from experience_app.diseno import services as design
from experience_app.plantillas import services
from experience_app.plantillas.defaults import FALLBACK_SPEC
from experience_app.tests.conftest import TABLE


def theme(**foundation):
    return {'version': 2, 'fundamentos': foundation}


# // Falla si J2 cambia los colores, las fuentes o las escalas del diseño predeterminado.
def test_defaults_preserve_j1_and_do_not_share_mutable_state():
    original = deepcopy(FALLBACK_SPEC['tokens'])
    resolved = services.build(FALLBACK_SPEC, {}, {}, {}, 5)
    assert resolved['tokens'] == original
    assert resolved['tema'] == design.defaults()
    assert resolved['fuentesGoogle'] == ['DM Sans', 'Mulish']
    customized = design.validate(theme(forma={'tarjeta': 0}, densidad=.75, texto=1.25))
    assert customized['fundamentos']['forma']['tarjeta'] == 0
    assert design.defaults()['fundamentos']['forma']['tarjeta'] == 1
    assert FALLBACK_SPEC['tokens'] == original


# // Falla si se aceptan tipos ambiguos, campos libres, escalas ilegibles o fuentes fuera del catálogo.
@pytest.mark.parametrize('body, message', [
    ([], 'objeto'), (None, 'objeto'), ({'version': 1}, 'versión'), ({'version': True}, 'número'),
    ({'css': 'body{}'}, 'desconocido'), (theme(forma={'otro': 2}), 'desconocido'),
    (theme(densidad=True), 'número'), (theme(densidad=float('nan')), 'finito'),
    (theme(texto=float('inf')), 'finito'), (theme(texto=.99), 'mínimo'),
    (theme(titulo=.9), 'mínimo'), (theme(densidad=.74), 'mínimo'),
    (theme(forma={'boton': 2.1}), 'máximo'), (theme(forma={'boton': -1}), 'mínimo'),
    (theme(tipografia={'cuerpo': 'Comic Sans'}), 'lista'),
    (theme(colores={'acento': '#FFFFFF\n'}), '#RRGGBB'),
    (theme(colores={'tinta': '#FFFFFF'}), 'tintaFondo sobre fondo'),
    (theme(colores={'tinta': '#727272'}), 'tinta sobre acentoSuave'),
    (theme(colores={'tintaSuave': '#BBBBBB'}), 'tintaSuave sobre superficie'),
    (theme(colores={'superficie': '#32324D'}), 'tinta sobre superficie'),
])
def test_invalid_themes_are_rejected(body, message):
    with pytest.raises(design.InvalidTheme, match=message):
        design.validate(body)


# // Falla si un tema oscuro pierde contraste, usa derivados del tema claro o cambia la fuente de títulos al editar cuerpo.
def test_dark_theme_and_independent_fonts():
    body = theme(colores={'fondo': '#111111', 'superficie': '#222222', 'tinta': '#FFFFFF',
                         'tintaSuave': '#CCCCCC', 'acento': '#dddddd'},
                 tipografia={'cuerpo': 'Lato'})
    clean = design.validate(body)
    foundation = clean['fundamentos']
    assert foundation['colores']['acento'] == '#DDDDDD'
    assert foundation['colores']['acentoTinta'] == '#1A1815'
    assert foundation['colores']['acentoSuave'] == '#353535'
    assert foundation['tipografia'] == {'display': 'DM Sans', 'cuerpo': 'Lato', 'fuentes': []}
    assert design.validate(clean) == clean
    assert body['fundamentos']['colores']['acento'] == '#dddddd'


# // Falla si un tema dañado impide abrir la carta o contamina el tema predeterminado.
@pytest.mark.parametrize('broken', [[], 'roto', {'version': 99}, theme(texto=0)])
def test_corrupt_saved_theme_falls_back(broken):
    assert design.resolve(broken, FALLBACK_SPEC['tokens']) == design.defaults()


# // Falla si un cambio de sede se filtra a otra, no invalida la caché o el guardado viejo borra fundamentos nuevos.
@pytest.mark.django_db
def test_save_cache_isolation_and_legacy_compatibility(company_brand_stub):
    with patch('experience_app.services.discount.percent_for', return_value=5):
        before = services.resolve_template(TABLE)
        row = services.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': theme(
            densidad=.8, texto=1.2, forma={'tarjeta': 0}, tipografia={'cuerpo': 'Lato'})})
        resolved = services.resolve_template(TABLE)
        assert resolved['tema']['fundamentos']['densidad'] == .8
        assert resolved['tokens']['cuerpoFont'] == 'Lato'
        assert 'Lato' in resolved['fuentesGoogle']
        assert services.resolve_template(replace(TABLE, venue_slug='otra')) == before
        services.save('burger-house', 'poblado', {'plantilla': 'S1', 'paleta': {'acento': '#123456'},
                                               'tipografia': {'display': 'Fraunces'}})
        after = services.resolve_template(TABLE)
        assert after['tema']['fundamentos']['densidad'] == .8
        assert after['tema']['fundamentos']['forma']['tarjeta'] == 0
        assert after['tokens']['cuerpoFont'] == 'Lato'
        assert after['tokens']['displayFont'] == 'Fraunces'
        assert after['tokens']['acento'] == '#123456'
        assert services.get_settings('burger-house', 'poblado').pk == row.pk


# // Falla si el endpoint admite temas sin autorización, persiste temas inválidos o pierde el tema en la respuesta pública.
@pytest.mark.django_db
def test_internal_endpoint_validates_before_writing(api_client, settings, company_brand_stub):
    settings.EXPERIENCE_INTERNAL_KEY = 'clave-prueba'
    url = reverse('venue-menu-settings', args=['burger-house', 'poblado'])
    payload = {'plantilla': 'S1', 'tema': theme(texto=1.2)}
    assert api_client.put(url, payload, format='json').status_code == 401
    with patch('experience_app.plantillas.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5):
        response = api_client.put(url, payload, format='json', HTTP_X_INTERNAL_KEY='clave-prueba')
        assert response.status_code == 200
        assert response.json()['plantilla']['tema']['fundamentos']['texto'] == 1.2
        previous = services.get_settings('burger-house', 'poblado').theme
        for bad in [theme(texto=.5), None, {'version': 3}]:
            response = api_client.put(url, {'plantilla': 'S1', 'tema': bad}, format='json', HTTP_X_INTERNAL_KEY='clave-prueba')
            assert response.status_code == 400
            assert services.get_settings('burger-house', 'poblado').theme == previous
        raw = api_client.get(url, HTTP_X_INTERNAL_KEY='clave-prueba').json()
        assert raw['tema'] == previous


# // Falla si migrar altera la apariencia de S1, elimina datos anteriores o reactiva plantillas retiradas.
@pytest.mark.django_db
def test_data_migration_preserves_legacy_customization():
    template = services.MenuTemplate.objects.get(pk='S1')
    row = services.VenueMenuSettings.objects.create(restaurant_slug='uno', venue_slug='sede', template=template,
        palette={'acento': '#123456', 'tintaTerciaria': '#ffaa22'}, typography={'display': 'Lora'})
    legacy = services.VenueMenuSettings.objects.create(restaurant_slug='otro', venue_slug='sede', template_id='B1')
    expected = services.final_tokens(template.spec, {}, row.palette, row.typography)
    migration = import_module('experience_app.migrations.0025_venue_menu_theme')
    migration.migrate_themes(apps, SimpleNamespace(connection=connection))
    row.refresh_from_db()
    legacy.refresh_from_db()
    # El Plan L recalcula el acento suave sobre superficie; los demás tokens migrados se conservan.
    expected['acentoSuave'] = '#E7EBEE'
    assert services.build(template.spec, {}, row.palette, row.typography, 5, row.theme)['tokens'] == expected
    assert row.palette == {'acento': '#123456', 'tintaTerciaria': '#ffaa22'}
    assert row.typography == {'display': 'Lora'}
    assert row.theme['version'] == 2
    assert legacy.theme == {}


# // Falla si el MCP prepara un cambio antiguo que queda ilegible al combinarse con colores exclusivos del tema v2.
@pytest.mark.django_db
def test_legacy_mcp_validates_against_current_theme_before_creating_draft():
    from experience_app.mcp import keys, tools
    from experience_app.mcp.models import McpPendingChange
    chosen = services.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': theme(colores={
        'fondo': '#111111', 'superficie': '#222222', 'tinta': '#FFFFFF', 'tintaSuave': '#AAAAAA',
    })})
    key, _ = keys.create('burger-house', 'poblado', 'Prueba v2')
    with pytest.raises(tools.ToolError, match='tintaFondo sobre fondo'):
        tools.preparar_diseno_menu(key, {'colores': {'fondo': '#FFFFFF', 'superficie': '#FFFFFF', 'tinta': '#000000'}})
    assert McpPendingChange.objects.count() == 0
    assert services.get_settings('burger-house', 'poblado').theme == chosen.theme
