"""Plan L: contrato descubrible y preparación de marca con HTTP simulado."""
from unittest.mock import patch

import pytest
import requests

from experience_app.diseno import services as design
from experience_app.mcp import keys
from experience_app.mcp.models import McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.tests.conftest import TABLE
from experience_app.tests.mcp.test_mcp import call, rpc

pytestmark = pytest.mark.django_db
FONTS = {'fuentes': ['Barlow Condensed', 'Anton', 'Lato'], 'display': 'Barlow Condensed', 'cuerpo': 'Lato'}


@pytest.fixture
def owner(company_brand_stub, settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'clave-prueba'
    record, raw = keys.create('burger-house', 'poblado', 'Marca de prueba')
    with patch('experience_app.mcp.tools.resolve', return_value=TABLE), \
            patch('experience_app.diseno.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5), \
            patch.object(design.requests, 'get') as get:
        get.return_value.__enter__.return_value.status_code = 200
        yield record, raw, get


# // Falla si herramientas, inventario, contrato público o lectura de componente ocultan las opciones de marca.
def test_brand_contract_is_discoverable(client, owner):
    _, raw, get = owner
    data = call(client, raw, 'leer_design_system')['structuredContent']
    fonts = data['esquema']['properties']['fundamentos']['properties']['tipografia']['properties']
    assert fonts['fuentes']['minItems'] == 0 and fonts['fuentes']['maxItems'] == 3
    assert fonts['fuentes']['default'] == [] and fonts['fuentes']['uniqueItems'] is True
    assert fonts['fuentes']['items']['pattern'] == '^[A-Z][A-Za-z0-9 ]{1,39}$'
    for role in ('display', 'cuerpo'):
        assert 'enum' not in fonts[role] and fonts[role]['anyOf'][1]['pattern'] == fonts['fuentes']['items']['pattern']
    inventory = data['inventario']
    assert inventory['fundamentos']['fundamentos.colores.tintaFondo'] == ['--t-tinta-fondo']
    assert inventory['fundamentos']['fundamentos.tipografia.fuentes'] == ['--ds-fuente-1', '--ds-fuente-2', '--ds-fuente-3']
    assert inventory['variantes']['banners']['atributo'] == 'data-ds-banners'
    for variant in inventory['variantes'].values():
        layer, field = variant['ruta'].split('.')
        rule = data['esquema']['properties'][layer]['properties'][field]
        assert rule['default'] == variant['predeterminada']
        assert rule['enum'] == [option['valor'] for option in variant['opciones']]
        assert all(option['descripcion'] and option['selector'] for option in variant['opciones'])
    screen = call(client, raw, 'describir_pantalla', {'pantalla': 'carta'})['structuredContent']
    banners = next(component for component in screen['secciones'] if component['id'] == 'banners')
    assert 'banners' in banners['opciones']
    component = call(client, raw, 'leer_componente', {'componente': 'plato'})['structuredContent']
    assert component['tipografia'] == data['tema']['fundamentos']['tipografia']
    assert component['utilidades'] == data['plantillas']['utilidades']
    assert any(group['nombre'] == 'Marca' for group in component['utilidades']['grupos'])
    public = client.get('/api/v1/diseno/').json()
    assert public['inventario'] == inventory
    assert public['esquema']['properties']['fundamentos'] == data['esquema']['properties']['fundamentos']
    tools = rpc(client, raw, 'tools/list').json()['result']['tools']
    prepare = next(tool for tool in tools if tool['name'] == 'preparar_tema')
    for term in ('globales', 'Google Fonts', 'ds-fuente-N', 'ds-fuente-1', 'ds-fuente-2', 'ds-fuente-3', 'HTTP 200', 'sin red'):
        assert term in prepare['description']
    get.assert_not_called()


# // Falla si preparar no comprueba todas las fuentes, publica antes de confirmar o pierde marca al leer el borrador y guardarlo.
def test_prepare_preview_confirm_brand_theme(client, owner):
    record, raw, get = owner
    before = templates.settings_view('burger-house', 'poblado')['tema']
    result = call(client, raw, 'preparar_tema', {'tema': {
        'fundamentos': {'tipografia': FONTS, 'colores': {'fondo': '#111111', 'tintaFondo': '#FFFFFF'}},
        'variantes': {'banners': 'tema'},
    }})
    assert not result['isError'], result
    draft = result['structuredContent']
    assert get.call_count == 3
    assert templates.settings_view('burger-house', 'poblado')['tema'] == before
    change = McpPendingChange.objects.get(key=record, pk=draft['token'])
    preview = client.get(f'/api/v1/burger-house/poblado/borradores/{draft["borrador"]}/').json()['plantilla']
    assert preview['tema']['fundamentos']['tipografia'] == FONTS
    assert preview['tema']['fundamentos']['colores']['tintaFondo'] == '#FFFFFF'
    assert preview['tema']['variantes']['banners'] == 'tema'
    assert preview['fuentesGoogle'] == ['Barlow Condensed', 'Lato', 'Anton']
    assert change.payload['tema'] == preview['tema']
    assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    assert templates.settings_view('burger-house', 'poblado')['tema'] == preview['tema']
    component = call(client, raw, 'leer_componente', {'componente': 'plato'})['structuredContent']
    assert component['tipografia'] == FONTS
    assert templates.resolve_template(TABLE)['tema'] == preview['tema']
    assert get.call_count == 3


# // Falla si MCP o la preparación interna guardan borradores con familias inexistentes o sin poder comprobar la red.
@pytest.mark.parametrize('channel', ['mcp', 'interno'])
@pytest.mark.parametrize('failure', ['inexistente', 'sin-red', 'tiempo'])
def test_font_failure_rejects_draft_without_writes(client, owner, channel, failure):
    _, raw, get = owner
    if failure == 'inexistente':
        get.return_value.__enter__.return_value.status_code = 400
        expected = 'HTTP 400'
    else:
        get.side_effect = requests.Timeout if failure == 'tiempo' else requests.ConnectionError
        expected = 'red'
    body = {'tema': {'fundamentos': {'tipografia': FONTS}}}
    if channel == 'mcp':
        result = call(client, raw, 'preparar_tema', body)
        assert result['isError']
        message = result['content'][0]['text']
    else:
        response = client.post('/internal/v1/burger-house/poblado/menu/borradores/',
                               data={'plantilla': 'S1', **body}, content_type='application/json', HTTP_X_INTERNAL_KEY='clave-prueba')
        assert response.status_code == 400
        message = response.json()['detail']
    assert 'Barlow Condensed' in message and expected in message
    assert not McpPendingChange.objects.exists()
    assert templates.settings_view('burger-house', 'poblado')['porDefecto']


# // Falla si preparar un componente o restablecer otra capa evita comprobar las familias globales conservadas.
@pytest.mark.parametrize('tool, arguments', [
    ('preparar_componente', {'componente': 'plato', 'html': None}),
    ('restablecer_tema', {'capa': 'variantes'}),
])
def test_all_draft_preparations_check_existing_global_fonts(client, owner, tool, arguments):
    _, raw, get = owner
    templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'fundamentos': {'tipografia': FONTS}}})
    get.side_effect = requests.ConnectionError
    result = call(client, raw, tool, arguments)
    assert result['isError'] and 'red' in result['content'][0]['text']
    assert not McpPendingChange.objects.exists()


# // Falla si una lista inválida llega a la red o un restablecimiento de fundamentos necesita las fuentes retiradas.
def test_validation_precedes_http_and_reset_removes_fonts(client, owner):
    _, raw, get = owner
    for fonts in (['Anton', 'Anton'], ['Anton; color:red'], ['Anton', 'Oswald', 'Lato', 'Roboto']):
        result = call(client, raw, 'preparar_tema', {'tema': {'fundamentos': {'tipografia': {'fuentes': fonts}}}})
        assert result['isError']
    get.assert_not_called()
    assert not McpPendingChange.objects.exists()
    templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'fundamentos': {'tipografia': FONTS}}})
    get.side_effect = requests.ConnectionError
    result = call(client, raw, 'restablecer_tema', {'capa': 'fundamentos'})
    assert not result['isError'], result
    get.assert_not_called()
