"""J4 de punta a punta: MCP → borrador público → confirmación; POS por el mismo contrato."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from experience_app.diseno import services as design
from experience_app.mcp import keys
from experience_app.mcp.models import McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.tests.conftest import TABLE
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner(company_brand_stub, settings):
    settings.DINER_PUBLIC_URL = 'https://menu.test'
    record, raw = keys.create('burger-house', 'poblado', 'Diseño de prueba')
    with patch('experience_app.mcp.tools.resolve', return_value=TABLE), \
            patch('experience_app.diseno.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5):
        yield record, raw


def prepare(client, raw, theme):
    result = call(client, raw, 'preparar_tema', {'tema': theme})
    assert not result['isError'], result
    return result['structuredContent']


def url(draft, venue='poblado'):
    return f'/api/v1/burger-house/{venue}/borradores/{draft["borrador"]}/'


# // Falla si la IA no puede descubrir campos, rangos y componentes reales en el orden de cada pantalla.
def test_read_contract_and_describe_screens(client, owner):
    _, raw = owner
    data = call(client, raw, 'leer_design_system')['structuredContent']
    assert data['esquema'] == design.SCHEMA and data['inventario'] == design.INVENTORY
    for screen, ids in design.INVENTORY['pantallas'].items():
        described = call(client, raw, 'describir_pantalla', {'pantalla': screen})['structuredContent']
        assert [s['id'] for s in described['secciones']] == ids
        assert described['tema'] == design.defaults()
    assert call(client, raw, 'describir_pantalla', {'pantalla': 'inventada'})['isError']
    assert call(client, raw, 'leer_design_system', {'sede': 'otra'})['isError']
    assert data['pagina'] == 'https://menu.test/burger-house/poblado/design-system'


# // Falla si la página viva no puede leer el mismo contrato que el MCP sin clave, o si el endpoint admite escrituras.
def test_public_contract_matches_mcp_and_is_read_only(client):
    response = client.get('/api/v1/diseno/')
    assert response.status_code == 200 and response['Cache-Control'] == 'public, max-age=3600'
    data = response.json()
    assert set(data) == {'version', 'esquema', 'inventario', 'plantillas'}
    assert data['version'] == 2 and data['esquema'] == design.SCHEMA and data['inventario'] == design.INVENTORY
    for method in (client.post, client.put, client.delete):
        assert method('/api/v1/diseno/', {}, content_type='application/json').status_code == 405


# // Falla si preparar publica, pierde campos no enviados, filtra el token de confirmación o no invalida la caché al confirmar.
def test_read_prepare_preview_confirm_end_to_end(client, owner):
    record, raw = owner
    templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'fundamentos': {'texto': 1.25}, 'variantes': {'imagen': '4:3'}}})
    before = templates.resolve_template(TABLE)
    draft = prepare(client, raw, {'variantes': {'boton': 'contorno'}, 'distribucion': {'carta': 'lista'}})
    assert draft['token'] != draft['borrador']
    assert draft['url'] == f'https://menu.test/burger-house/poblado/carta?borrador={draft["borrador"]}'
    assert draft['url_design_system'] == f'https://menu.test/burger-house/poblado/design-system?borrador={draft["borrador"]}'
    assert {v['campo'] for v in draft['vista_previa']} == {'variantes.boton', 'distribucion.carta'}
    assert templates.resolve_template(TABLE) == before
    response = client.get(url(draft))
    assert response.status_code == 200 and response['Cache-Control'] == 'no-store'
    preview = response.json()
    assert set(preview) == {'plantilla', 'caduca'}
    theme = preview['plantilla']['tema']
    assert theme['fundamentos']['texto'] == 1.25 and theme['variantes']['imagen'] == '4:3'
    assert theme['variantes']['boton'] == 'contorno' and theme['distribucion']['carta'] == 'lista'
    assert call(client, raw, 'confirmar_cambio', {'token': draft['borrador']})['isError']
    assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    assert templates.resolve_template(TABLE) == preview['plantilla']
    assert call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    assert client.get(url(draft)).status_code == 404
    assert McpPendingChange.objects.get(key=record).applied_at


# // Falla si un borrador admite otra sede/clave, sobrevive a la revocación/caducidad o permite métodos de escritura públicos.
@pytest.mark.parametrize('reason', ['otra-sede', 'otra-clave', 'revocada', 'caducada', 'token-invalido', 'escritura'])
def test_draft_scope_and_lifetime(client, owner, reason):
    record, raw = owner
    draft = prepare(client, raw, {'variantes': {'boton': 'suave'}})
    if reason == 'otra-sede':
        assert client.get(url(draft, 'otra')).status_code == 404
    elif reason == 'otra-clave':
        _, other = keys.create('otro', 'salon', 'Otra')
        assert call(client, other, 'confirmar_cambio', {'token': draft['token']})['isError']
    elif reason == 'revocada':
        keys.revoke('burger-house', 'poblado', record.pk)
        assert client.get(url(draft)).status_code == 404
    elif reason == 'caducada':
        McpPendingChange.objects.filter(pk=draft['token']).update(created_at=timezone.now() - timedelta(minutes=30))
        assert client.get(url(draft)).status_code == 404
        assert call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    elif reason == 'token-invalido':
        assert client.get(url({'borrador': 'ninguno'})).status_code == 404
    else:
        for method in [client.post, client.put, client.patch, client.delete]:
            assert method(url(draft)).status_code == 405
    assert templates.settings_view('burger-house', 'poblado')['porDefecto']


# // Falla si el cambio parcial acepta campos, versiones, tipos, CSS o derivados que no se pueden editar.
@pytest.mark.parametrize('theme', [None, [], {}, {'variantes': None}, {'variantes': {'boton': 'display:none'}},
    {'distribucion': {'pago': 'oculto'}}, {'fundamentos': {'texto': .5}}, {'fundamentos': {'texto': True}},
    {'fundamentos': {'colores': {'acentoTinta': '#FFFFFF'}}}, {'version': 3},
    {'fundamentos': {'colores': {'tinta': '#FFFFFF'}}}])
def test_invalid_partial_themes_do_not_create_drafts(client, owner, theme):
    assert call(client, owner[1], 'preparar_tema', {'tema': theme})['isError']
    assert not McpPendingChange.objects.exists()


# // Falla si restablecer una capa borra las otras o si publica antes de confirmar.
@pytest.mark.parametrize('layer', ['todo', 'fundamentos', 'variantes', 'distribucion'])
def test_reset_whole_theme_or_layer(client, owner, layer):
    _, raw = owner
    templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {
        'fundamentos': {'texto': 1.25}, 'variantes': {'boton': 'contorno'}, 'distribucion': {'carta': 'lista'}}})
    before = templates.settings_view('burger-house', 'poblado')['tema']
    draft = call(client, raw, 'restablecer_tema', {'capa': layer})['structuredContent']
    assert templates.settings_view('burger-house', 'poblado')['tema'] == before
    after = client.get(url(draft)).json()['plantilla']['tema']
    assert after == (design.defaults() if layer == 'todo' else {**before, layer: design.defaults()[layer]})
    assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    assert templates.settings_view('burger-house', 'poblado')['tema'] == after


# // Falla si confirmar un borrador viejo sobrescribe una edición posterior del POS o de otra clave.
def test_stale_draft_cannot_overwrite_a_new_theme(client, owner):
    draft = prepare(client, owner[1], {'variantes': {'boton': 'contorno'}})
    templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'fundamentos': {'texto': 1.5}}})
    result = call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})
    assert result['isError'] and 'cambió' in result['content'][0]['text']
    assert templates.settings_view('burger-house', 'poblado')['tema']['fundamentos']['texto'] == 1.5
    assert McpPendingChange.objects.get(pk=draft['token']).applied_at is None


# // Falla si el POS crea borradores sin autorización, publica al previsualizar o pierde las variantes elegidas por MCP.
def test_pos_uses_same_public_preview_without_mcp_confirmation(api_client, client, owner, settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'interna'
    endpoint = '/internal/v1/burger-house/poblado/menu/borradores/'
    body = {'plantilla': 'S1', 'paleta': {'acento': '#234567'}, 'tipografia': {}}
    assert api_client.post(endpoint, body, format='json').status_code == 401
    templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'variantes': {'boton': 'suave'}}})
    before = templates.resolve_template(TABLE)
    response = api_client.post(endpoint, body, format='json', HTTP_X_INTERNAL_KEY='interna')
    assert response.status_code == 201 and response['Cache-Control'] == 'no-store'
    draft = response.json()
    assert 'token' not in draft
    assert draft['url_design_system'].endswith(f'/design-system?borrador={draft["borrador"]}')
    change = McpPendingChange.objects.get(preview_token=draft['borrador'])
    assert change.key_id is None and change.kind == 'preview'
    preview = client.get(url(draft)).json()['plantilla']
    assert preview['tema']['variantes']['boton'] == 'suave' and preview['tokens']['acento'] == '#234567'
    assert templates.resolve_template(TABLE) == before
    assert call(client, owner[1], 'confirmar_cambio', {'token': str(change.id)})['isError']
    bad = {**body, 'sede': 'otra'}
    assert api_client.post(endpoint, bad, format='json', HTTP_X_INTERNAL_KEY='interna').status_code == 400
