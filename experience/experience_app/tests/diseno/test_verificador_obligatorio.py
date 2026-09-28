"""Cierre A: ninguna publicación de plantillas propias elude la verificación del mismo borrador."""
import uuid
from copy import deepcopy
from unittest.mock import patch

import pytest
from django.utils import timezone

from experience_app.diseno import borradores
from experience_app.mcp import keys
from experience_app.mcp.models import McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.plantillas.models import VenueMenuSettings
from experience_app.tests.conftest import TABLE
from experience_app.tests.diseno.test_plantillas import MINIMAL, verifier
from experience_app.tests.diseno.verification import verify_mcp, wait_for_verification
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db(transaction=True)
MENU = '/internal/v1/burger-house/poblado/menu/'
HEADERS = {'HTTP_X_INTERNAL_KEY': 'interna'}
BODY = {'plantilla': 'S1', 'tema': {'componentes': {'plato': {'version': 1, 'html': MINIMAL}}}}


@pytest.fixture
def owner(company_brand_stub, settings, verification_threads):
    settings.DESIGN_VERIFIER_REQUIRED = True
    settings.DESIGN_VERIFIER_CMD = ''
    settings.EXPERIENCE_INTERNAL_KEY = 'interna'
    record, raw = keys.create('burger-house', 'poblado', 'Diseño de prueba')
    with patch('experience_app.mcp.tools.resolve', return_value=TABLE), \
            patch('experience_app.diseno.views.resolve', return_value=TABLE), \
            patch('experience_app.plantillas.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5):
        yield record, raw


def prepare(api_client):
    response = api_client.post(MENU + 'borradores/', BODY, format='json', **HEADERS)
    assert response.status_code == 201, response.json()
    return response.json()


def verify(api_client, draft):
    return wait_for_verification(lambda: api_client.post(MENU + f'borradores/{draft["borrador"]}/verificar/', {}, format='json', **HEADERS))


# // Falla si el valor predeterminado permite publicar sin una medición en verde.
def test_verification_is_required_by_default(monkeypatch):
    import runpy
    from pathlib import Path

    monkeypatch.delenv('DESIGN_VERIFIER_REQUIRED', raising=False)
    with patch('dotenv.load_dotenv'):
        defaults = runpy.run_path(str(Path(__file__).resolve().parents[3] / 'experience_project/settings.py'))
    assert defaults['DESIGN_VERIFIER_REQUIRED'] is True


# // Falla si el modo estricto confirma sin medir, con infraestructura caída o con problemas, incluso al editar una plantilla existente.
@pytest.mark.parametrize('existing', [False, True])
@pytest.mark.parametrize('state, message', [('pendiente', 'Falta'), ('no_disponible', 'configurada'),
                                         ('error', 'error'), ('problemas', 'problemas'), ('ok', None)])
def test_strict_mcp_requires_latest_green(client, owner, settings, tmp_path, state, message, existing):
    if existing:
        templates.save('burger-house', 'poblado', BODY)
    draft = call(client, owner[1], 'preparar_componente', {'componente': 'plato', 'html': '<p>Nuevo</p>' + MINIMAL})['structuredContent']
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    if state == 'no_disponible':
        settings.DESIGN_VERIFIER_CMD = ''
    elif state == 'error':
        settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'None')
    elif state == 'problemas':
        settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False', ['desborde'])
    if state != 'pendiente':
        result = verify_mcp(client, owner[1], draft['borrador'])['structuredContent']
        assert result['estado'] == state
    before = templates.settings_view('burger-house', 'poblado')
    confirmation = call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})
    assert confirmation['isError'] is (state != 'ok')
    if message:
        assert message in confirmation['content'][0]['text']
        assert templates.settings_view('burger-house', 'poblado') == before
    assert bool(McpPendingChange.objects.get(pk=draft['token']).applied_at) is (state == 'ok')


# // Falla si false cambia la puerta anterior: MCP exige verde solo con comando y el PUT sigue libre de borrador.
@pytest.mark.parametrize('configured', [False, True])
def test_optional_mode_preserves_previous_behavior(api_client, client, owner, settings, tmp_path, configured):
    settings.DESIGN_VERIFIER_REQUIRED = False
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False') if configured else ''
    draft = call(client, owner[1], 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
    assert call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})['isError'] is configured
    assert api_client.put(MENU, BODY, format='json', **HEADERS).status_code == 200


# // Falla si el POST interno no verifica ambos tipos de borrador con el mismo contrato del MCP, o publica al medir.
@pytest.mark.parametrize('source', ['preview', 'theme'])
def test_internal_verification_matches_mcp_and_put_consumes_draft(api_client, client, owner, settings, tmp_path, source):
    draft = prepare(api_client) if source == 'preview' else call(
        client, owner[1], 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    response = verify(api_client, draft)
    assert response.status_code == 200 and response['Cache-Control'] == 'no-store'
    assert response.json()['ok'] is True and response.json()['borrador'] == draft['borrador']
    assert 'token' not in response.json()
    if source == 'theme':
        assert response.json() == verify_mcp(client, owner[1], draft['borrador'])['structuredContent']
    assert not VenueMenuSettings.objects.exists()
    change = McpPendingChange.objects.get(preview_token=draft['borrador'])
    response = api_client.put(MENU, {**BODY, 'borrador': draft['borrador']}, format='json', **HEADERS)
    assert response.status_code == 200, response.json()
    assert response.json()['plantilla']['tema'] == change.payload['tema']
    change.refresh_from_db()
    assert change.applied_at is not None
    assert verify(api_client, draft).status_code == 400
    assert client.get(f'/api/v1/burger-house/poblado/borradores/{draft["borrador"]}/').status_code == 404
    assert api_client.put(MENU, {**BODY, 'borrador': draft['borrador']}, format='json', **HEADERS).status_code == 400
    if source == 'theme':
        assert call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})['isError']


def invalidate_draft(change, reason):
    if reason == 'otra-organizacion':
        change.restaurant_slug = 'otra-organizacion'
    elif reason == 'otro-restaurante':
        change.restaurant_slug = 'otro'
    elif reason == 'caducado':
        change.created_at = timezone.now() - borradores.TTL
    elif reason == 'aplicado':
        change.applied_at = timezone.now()
    elif reason == 'revocado':
        change.key, _ = keys.create('burger-house', 'poblado', 'Revocada')
        keys.revoke('burger-house', 'poblado', change.key_id)
    elif reason == 'otro-kind':
        change.kind = 'design'
    change.save()


# // Falla si se ejecuta el verificador sin clave interna, fuera de la sede, con tokens inválidos o borradores no vigentes.
@pytest.mark.parametrize('reason', ['sin-clave', 'otra-organizacion', 'otro-restaurante', 'caducado', 'aplicado',
                                  'revocado', 'otro-kind', 'confirmacion', 'invalido', 'desconocido'])
def test_internal_verification_authorization_and_scope(api_client, owner, reason):
    draft = prepare(api_client)
    change = McpPendingChange.objects.get(preview_token=draft['borrador'])
    invalidate_draft(change, reason)
    token = {'confirmacion': str(change.pk), 'invalido': 'invalido', 'desconocido': str(uuid.uuid4())}.get(reason, draft['borrador'])
    with patch('experience_app.diseno.borradores.verify') as run:
        response = api_client.post(MENU + f'borradores/{token}/verificar/', {}, format='json',
                                   **({} if reason == 'sin-clave' else HEADERS))
        assert response.status_code == (401 if reason == 'sin-clave' else 400)
        run.assert_not_called()


# // Falla si el PUT acepta cambios de componentes sin un borrador propio, vigente y verificado del tema completo.
@pytest.mark.parametrize('reason', ['ausente', 'invalido', 'desconocido', 'otra-organizacion', 'otro-restaurante', 'caducado',
                                  'aplicado', 'revocado', 'otro-kind', 'confirmacion', 'sin-verificar', 'error',
                                  'problemas', 'no_disponible', 'otro-tema', 'verde-anterior', 'verde-ajeno', 'ok-texto'])
def test_put_rejects_unverified_or_mismatched_drafts(api_client, owner, settings, tmp_path, reason):
    draft = prepare(api_client)
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    if reason in ('error', 'problemas', 'no_disponible', 'ok-texto'):
        expression = {'error': 'None', 'problemas': 'False', 'ok-texto': repr('false')}.get(reason)
        settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, expression) if expression else ''
        assert verify(api_client, draft).json()['ok'] is not True
    elif reason != 'sin-verificar':
        assert verify(api_client, draft).json()['ok'] is True
    change = McpPendingChange.objects.get(preview_token=draft['borrador'])
    if reason == 'verde-anterior':
        # La puerta debe usar el último estado guardado aunque antes hubiera una medición aprobada.
        change.payload['verificacion'] = {'estado': 'problemas', 'ok': False, 'problemas': ['desborde']}
    invalidate_draft(change, reason)
    body = {**deepcopy(BODY), 'borrador': draft['borrador']}
    if reason == 'ausente':
        body.pop('borrador')
        body['verificacion'] = {'ok': True}
    elif reason == 'invalido':
        body['borrador'] = {'ok': True}
    elif reason == 'desconocido':
        body['borrador'] = str(uuid.uuid4())
    elif reason == 'confirmacion':
        body['borrador'] = str(change.pk)
    elif reason == 'otro-tema':
        body['tema']['fundamentos'] = {'texto': 1.2}
    elif reason == 'verde-ajeno':
        body['borrador'] = prepare(api_client)['borrador']
    response = api_client.put(MENU, body, format='json', **HEADERS)
    assert response.status_code == 400 and response.json()['detail']
    assert not VenueMenuSettings.objects.exists()
    change.refresh_from_db()
    assert bool(change.applied_at) is (reason == 'aplicado')


# // Falla si no tocar componentes exige borrador o si restablecerlos por PUT evita la puerta estricta.
def test_put_preserves_legacy_edits_and_gates_factory_reset(api_client, owner):
    templates.save('burger-house', 'poblado', BODY)
    original = templates.settings_view('burger-house', 'poblado')['tema']
    for body in ({'plantilla': 'S1', 'paleta': {'acento': '#234567'}},
                 {'plantilla': 'S1', 'tema': {**original, 'variantes': {'boton': 'suave'}}}):
        response = api_client.put(MENU, body, format='json', **HEADERS)
        assert response.status_code == 200
        assert response.json()['plantilla']['tema']['componentes'] == original['componentes']
    assert api_client.put(MENU, {'plantilla': 'S1', 'tema': {}}, format='json', **HEADERS).status_code == 400


# // Falla si un error de guardado consume el borrador o deja ajustes parciales, impidiendo reintentar.
def test_failed_save_rolls_back_draft_and_settings(api_client, owner, settings, tmp_path):
    draft = prepare(api_client)
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    assert verify(api_client, draft).json()['ok'] is True
    with patch('experience_app.plantillas.services.save', side_effect=templates.InvalidSettings('No se pudo guardar.')):
        assert api_client.put(MENU, {**BODY, 'borrador': draft['borrador']}, format='json', **HEADERS).status_code == 400
    assert McpPendingChange.objects.get(preview_token=draft['borrador']).applied_at is None
    assert not VenueMenuSettings.objects.exists()
