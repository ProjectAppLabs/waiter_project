import json
from unittest.mock import patch

import pytest

from experience_app.mcp import keys
from experience_app.mcp.models import McpKey
from experience_app.plantillas import services as templates
from experience_app.tests.conftest import TABLE, UNTOUCHED_COMPANY

pytestmark = pytest.mark.django_db
BANNER = {'layout': 'notice', 'title': 'Hoy abrimos', 'subtitle': '', 'button': '', 'target': 'none', 'targetId': None, 'image': '', 'theme': 'amber', 'active': True}


class FakeOdoo:
    """El Odoo de la sede: banners guardados y lo que se le pidió (para ver dry_run y write_brand)."""

    def __init__(self):
        self.banners = [{**BANNER, 'image': 'data:image/png;base64,AAAA'}]
        self.calls = []

    def __call__(self, credentials):
        return self

    def call_kw(self, model, method, args, kwargs=None):
        self.calls.append((model, method, args, kwargs or {}))
        if method == 'waiter_banner_settings':
            return {'configured': True, 'banners': self.banners}
        if method == 'waiter_banner_settings_integration':
            clean = [{**b, 'title': b['title'].strip()} for b in args[1]]
            if not kwargs['dry_run']:
                self.banners = clean
            return {'configured': True, 'banners': clean}
        if method == 'write_brand':
            return True
        if method == 'search_read':
            return [{'id': 3, 'name': 'Hamburguesa Angus', 'lst_price': 36900.0, 'pos_categ_ids': [2]}] if model == 'product.product' else [{'id': 2, 'name': 'Hamburguesas'}]
        raise AssertionError(f'llamada inesperada {model}.{method}')


@pytest.fixture
def odoo():
    fake = FakeOdoo()
    with patch('experience_app.mcp.tools.resolve', return_value=TABLE) as resolve, patch('experience_app.mcp.tools.OdooClient', fake), \
            patch('experience_app.services.brand.pos.read_company_brand', return_value=UNTOUCHED_COMPANY), \
            patch('experience_app.services.discount.percent_for', return_value=0):
        fake.resolve = resolve
        yield fake


@pytest.fixture
def key():
    record, raw = keys.create('burger-house', 'poblado', 'Claude de prueba')
    return raw


def rpc(client, raw, method, params=None, msg_id=1, url='/mcp/'):
    body = {'jsonrpc': '2.0', 'method': method, **({'id': msg_id} if msg_id is not None else {}), **({'params': params} if params is not None else {})}
    return client.post(url, data=json.dumps(body), content_type='application/json', **({'HTTP_AUTHORIZATION': f'Bearer {raw}'} if raw else {}))


def call(client, raw, name, arguments=None):
    return rpc(client, raw, 'tools/call', {'name': name, 'arguments': arguments or {}}).json()['result']


# Falla si la clave se guardara en claro, si una revocada siguiera entrando o si revocar tocara la clave de otra sede.
def test_keys_are_stored_as_hashes_revoked_per_venue_and_shown_once(key):
    record = McpKey.objects.get()
    assert key.startswith('wtr_') and key not in (record.key_hash, record.prefix) and record.prefix == key[:10]
    assert keys.authenticate(key) == record
    assert 'clave' not in keys.listing('burger-house', 'poblado')[0]
    assert keys.revoke('otro-restaurante', 'poblado', record.id) is False
    assert keys.authenticate(key) == record
    assert keys.revoke('burger-house', 'poblado', record.id) is True
    assert keys.authenticate(key) is None


# Falla si el servidor no responde el saludo MCP, si deja entrar sin clave, o si la clave en la URL no sirve (claude.ai).
def test_protocol_handshake_auth_and_url_key(client, key):
    assert rpc(client, None, 'initialize').status_code == 401
    assert rpc(client, 'wtr_inventada', 'initialize').status_code == 401
    init = rpc(client, key, 'initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 't', 'version': '1'}}).json()['result']
    assert init['protocolVersion'] == '2025-06-18' and init['capabilities'] == {'tools': {'listChanged': False}}
    assert rpc(client, key, 'notifications/initialized', msg_id=None).status_code == 202
    names = [t['name'] for t in rpc(client, None, 'tools/list', url=f'/mcp/{key}/').json()['result']['tools']]
    assert names == ['leer_diseno_menu', 'preparar_diseno_menu', 'leer_banners', 'preparar_banners', 'listar_catalogo', 'confirmar_cambio']
    assert client.get('/mcp/').status_code == 405
    assert rpc(client, key, 'metodo/raro').json()['error']['code'] == -32601


# Falla si la IA pudiera elegir otro restaurante pasándolo en los argumentos: la sede sale SIEMPRE de la clave.
def test_the_venue_comes_from_the_key_never_from_the_client(client, odoo):
    _, raw = keys.create('otro-restaurante', 'centro', 'Clave de otro')
    call(client, raw, 'leer_banners', {'restaurante': 'burger-house', 'sede': 'poblado'})
    odoo.resolve.assert_called_with('otro-restaurante', 'centro')


# Falla si preparar guardara algo, si un color sin contraste pasara, o si confirmar no aplicara (o aplicara dos veces).
def test_design_is_prepared_then_confirmed_once(client, key, odoo):
    bad = call(client, key, 'preparar_diseno_menu', {'colores': {'tinta': '#EEEEEE', 'fondo': '#FFFFFF'}})
    assert bad['isError'] and 'no se lee' in bad['content'][0]['text']
    ready = call(client, key, 'preparar_diseno_menu', {'colores': {'acento': '#7A2E2A'}, 'tipografia': 'Fraunces', 'saludo': 'Bienvenidos a Burger House'})
    assert not ready['isError']
    preview = ready['structuredContent']['vista_previa']
    assert preview['colores']['acento']['despues'] == '#7A2E2A' and preview['saludo']['despues'] == 'Bienvenidos a Burger House'
    assert templates.settings_view('burger-house', 'poblado')['porDefecto'] is True
    assert not [c for c in odoo.calls if c[1] == 'write_brand']
    token = ready['structuredContent']['token']
    done = call(client, key, 'confirmar_cambio', {'token': token})
    assert not done['isError']
    saved = templates.settings_view('burger-house', 'poblado')
    assert saved['paleta'] == {'acento': '#7A2E2A'} and saved['tipografia'] == {'display': 'Fraunces'}
    assert ('res.company', 'write_brand', [{'brand_greeting': 'Bienvenidos a Burger House'}], {}) in odoo.calls
    assert call(client, key, 'confirmar_cambio', {'token': token})['isError']


# Falla si el token de una clave sirviera con otra clave (otra persona u otro restaurante confirmando lo ajeno).
def test_a_change_can_only_be_confirmed_by_the_key_that_prepared_it(client, key, odoo):
    token = call(client, key, 'preparar_diseno_menu', {'saludo': 'Hola'})['structuredContent']['token']
    _, other = keys.create('burger-house', 'poblado', 'Otra clave')
    assert call(client, other, 'confirmar_cambio', {'token': token})['isError']
    assert call(client, key, 'confirmar_cambio', {'token': 'no-es-un-token'})['isError']


# Falla si preparar banners guardara (sin dry_run), si confirmar no guardara, o si «conservar la imagen» la perdiera.
def test_banners_validate_in_odoo_as_dry_run_and_keep_existing_images(client, key, odoo):
    ready = call(client, key, 'preparar_banners', {'banners': [
        {'layout': 'product', 'title': '  La Angus  ', 'target': 'product', 'targetId': 3, 'theme': 'dark', 'imagen_de_banner': 0},
        {'layout': 'notice', 'title': 'Domingos 2x1', 'target': 'none', 'theme': 'amber'}]})
    assert not ready['isError']
    dry = [c for c in odoo.calls if c[1] == 'waiter_banner_settings_integration']
    assert dry[-1][3]['dry_run'] is True and dry[-1][2][1][0]['image'] == 'data:image/png;base64,AAAA'
    assert odoo.banners[0]['title'] == 'Hoy abrimos'
    call(client, key, 'confirmar_cambio', {'token': ready['structuredContent']['token']})
    assert [b['title'] for b in odoo.banners] == ['La Angus', 'Domingos 2x1'] and odoo.banners[0]['image']
    missing = call(client, key, 'preparar_banners', {'banners': [{'layout': 'notice', 'title': 'x', 'target': 'none', 'theme': 'amber', 'imagen_de_banner': 7}]})
    assert missing['isError']


# Falla si las rutas internas de claves respondieran sin la clave interna, o si la clave en claro volviera a salir.
def test_internal_key_routes(api_client, settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'interna'
    url = '/internal/v1/burger-house/poblado/mcp/claves/'
    assert api_client.post(url, {'nombre': 'x'}, format='json').status_code == 401
    created = api_client.post(url, {'nombre': 'Claude de Gustavo', 'creadaPor': 'Laura'}, format='json', HTTP_X_INTERNAL_KEY='interna')
    assert created.status_code == 201 and created.json()['clave'].startswith('wtr_')
    listed = api_client.get(url, HTTP_X_INTERNAL_KEY='interna').json()['claves']
    assert listed[0]['nombre'] == 'Claude de Gustavo' and 'clave' not in listed[0]
    revoke = f"{url}{created.json()['id']}/revocar/"
    assert api_client.post(revoke, HTTP_X_INTERNAL_KEY='interna').status_code == 200
    assert api_client.post(revoke, HTTP_X_INTERNAL_KEY='interna').status_code == 404
