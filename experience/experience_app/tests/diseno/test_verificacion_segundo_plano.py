"""Cierre E: trabajos reales, consultas inmediatas y recuperación sin publicar resultados atrasados."""
import sys
import time
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from experience_app.diseno import borradores
from experience_app.mcp.models import McpPendingChange
from experience_app.tests.diseno.test_plantillas import MINIMAL
from experience_app.tests.diseno.test_verificador_obligatorio import BODY, HEADERS, MENU, prepare
from experience_app.tests.diseno.test_verificador_obligatorio import owner as owner
from experience_app.tests.diseno.verification import wait_for_verification
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db(transaction=True)


def slow_verifier(tmp_path, settings, *, seconds=2, ok='True'):
    marker = tmp_path / 'ejecuciones'
    script = tmp_path / 'verificador_lento.py'
    script.write_text(
        'import json, pathlib, sys, time\n'
        f'with pathlib.Path({str(marker)!r}).open("a") as output: output.write("medición\\n")\n'
        f'time.sleep({seconds})\n'
        f'sys.stdout.write(json.dumps({{"ok": {ok}, "problemas": []}}))\n', encoding='utf-8')
    settings.DESIGN_VERIFIER_CMD = f'{sys.executable} {script}'
    settings.DESIGN_VERIFIER_TIMEOUT = 5
    return marker


def poll(api_client, client, raw, draft, source):
    if source == 'mcp':
        return call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    response = api_client.post(MENU + f'borradores/{draft["borrador"]}/verificar/', {}, format='json', **HEADERS)
    assert response.status_code == 200, response.json()
    assert response['Cache-Control'] == 'no-store'
    return response.json()


def result_after_wait(request):
    return wait_for_verification(lambda: {'structuredContent': request()})['structuredContent']


# // Falla si MCP o POST esperan los 2 s del navegador, duplican el hilo al consultar o permiten publicar mientras mide.
@pytest.mark.parametrize('source', ['mcp', 'pos'])
def test_background_verification_returns_immediately_and_gates_publication(api_client, client, owner, settings, tmp_path, verification_threads, source):
    draft = (call(client, owner[1], 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
             if source == 'mcp' else prepare(api_client))
    marker = slow_verifier(tmp_path, settings)
    def request():
        return poll(api_client, client, owner[1], draft, source)
    with patch.object(borradores, 'close_old_connections', wraps=borradores.close_old_connections) as opened, \
            patch.object(borradores.connections, 'close_all', wraps=borradores.connections.close_all) as closed:
        started = time.monotonic()
        first = request()
        assert time.monotonic() - started < 1.5
        assert first['estado'] == 'en_curso' and first['ok'] is None and first['borrador'] == draft['borrador']
        assert first['inicio'] and 'vuelve a llamar' in first['siguiente']
        pending = McpPendingChange.objects.get(preview_token=draft['borrador'])
        assert pending.payload['verificacion'] == {'estado': 'en_curso', 'ok': None, 'inicio': first['inicio']}
        assert request() == first
        assert len(verification_threads) == 1 and verification_threads[0].daemon
        if source == 'mcp':
            blocked = call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})
            assert blocked['isError'] and 'en curso' in blocked['content'][0]['text']
        response = api_client.put(MENU, {**BODY, 'borrador': draft['borrador']}, format='json', **HEADERS)
        assert response.status_code == 400 and 'en curso' in response.json()['detail']
        pending.refresh_from_db()
        assert pending.applied_at is None
        final = result_after_wait(request)
        assert final['estado'] == 'ok' and final['ok'] is True and final['inicio'] == first['inicio']
        assert request() == final
        assert len(verification_threads) == 1 and marker.read_text().splitlines() == ['medición']
        verification_threads[0].join(timeout=5)
        opened.assert_called_once()
        closed.assert_called_once()
    if source == 'mcp':
        assert not call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})['isError']
    else:
        assert api_client.put(MENU, {**BODY, 'borrador': draft['borrador']}, format='json', **HEADERS).status_code == 200
    pending.refresh_from_db()
    assert pending.applied_at is not None


# // Falla si dos borradores de la misma sede ejecutan navegadores simultáneos o un rechazo deja un trabajo fantasma.
def test_venue_lock_blocks_other_drafts_until_worker_finishes(api_client, client, owner, settings, tmp_path, verification_threads):
    first, second = prepare(api_client), prepare(api_client)
    marker = slow_verifier(tmp_path, settings)
    assert poll(api_client, client, owner[1], first, 'pos')['estado'] == 'en_curso'
    response = api_client.post(MENU + f'borradores/{second["borrador"]}/verificar/', {}, format='json', **HEADERS)
    assert response.status_code == 400 and 'en curso para esta sede' in response.json()['detail']
    assert 'verificacion' not in McpPendingChange.objects.get(preview_token=second['borrador']).payload
    assert len(verification_threads) == 1
    assert result_after_wait(lambda: poll(api_client, client, owner[1], first, 'pos'))['ok'] is True
    verification_threads[0].join(timeout=5)
    assert poll(api_client, client, owner[1], second, 'pos')['estado'] == 'en_curso'
    assert result_after_wait(lambda: poll(api_client, client, owner[1], second, 'pos'))['ok'] is True
    assert len(verification_threads) == 2 and marker.read_text().splitlines() == ['medición', 'medición']


# // Falla si un en_curso abandonado queda pendiente para siempre, reinicia el navegador o libera el cerrojo de otro trabajo.
@pytest.mark.parametrize('source', ['mcp', 'pos'])
@pytest.mark.parametrize('start', ['vencido', 'invalido', 'ausente'])
def test_abandoned_verification_becomes_persisted_error(api_client, client, owner, settings, verification_threads, source, start):
    draft = call(client, owner[1], 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
    change = McpPendingChange.objects.get(pk=draft['token'])
    pending = {'estado': 'en_curso', 'ok': None}
    if start != 'ausente':
        pending['inicio'] = ((timezone.now() - timedelta(seconds=settings.DESIGN_VERIFIER_TIMEOUT + 6)).isoformat()
                             if start == 'vencido' else 'no-es-fecha')
    change.payload['verificacion'] = pending
    change.save(update_fields=['payload'])
    lock = borradores._verification_lock(change)
    cache.set(lock, 'otro-trabajo', timeout=30)
    result = poll(api_client, client, owner[1], draft, source)
    assert result['estado'] == 'error' and result['ok'] is None and 'interrumpió' in result['mensaje']
    change.refresh_from_db()
    assert change.payload['verificacion']['estado'] == 'error'
    assert poll(api_client, client, owner[1], draft, source) == result
    assert cache.get(lock) == 'otro-trabajo' and not verification_threads
    assert call(client, owner[1], 'confirmar_cambio', {'token': draft['token']})['isError']


# // Falla si una excepción inesperada del hilo deja en_curso, filtra datos internos o conserva el cerrojo.
def test_worker_failure_is_reported_and_releases_lock(api_client, client, owner, verification_threads):
    draft = prepare(api_client)
    with patch.object(borradores, 'verify', side_effect=RuntimeError('/ruta/interna/privada')):
        assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'en_curso'
        result = result_after_wait(lambda: poll(api_client, client, owner[1], draft, 'pos'))
        verification_threads[0].join(timeout=5)
    assert result['estado'] == 'error' and result['ok'] is None and '/ruta' not in result['mensaje']
    assert cache.get('verificacion:burger-house/poblado') is None


# // Falla si no poder arrancar el hilo deja una verificación bloqueada indefinidamente.
def test_thread_start_failure_becomes_error(api_client, client, owner):
    draft = prepare(api_client)
    with patch.object(borradores.threading, 'Thread', side_effect=RuntimeError('sin hilos')):
        assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'en_curso'
    assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'error'
    assert cache.get('verificacion:burger-house/poblado') is None


# // Falla si se arranca el hilo antes del commit, cuando su conexión aún no puede leer el en_curso persistido.
def test_worker_starts_after_transaction_commits(api_client, owner):
    draft = prepare(api_client)
    change = McpPendingChange.objects.get(preview_token=draft['borrador'])
    with patch.object(borradores, '_launch_verification') as launch:
        with transaction.atomic():
            assert borradores.start_verification(change)['estado'] == 'en_curso'
            launch.assert_not_called()
        launch.assert_called_once()


# // Falla si un resultado tardío revive un borrador con error o borra el cerrojo de otro trabajo.
def test_late_worker_cannot_replace_recovered_error(api_client, client, owner, settings):
    draft = prepare(api_client)
    with patch.object(borradores, '_launch_verification'):
        assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'en_curso'
    change = McpPendingChange.objects.get(preview_token=draft['borrador'])
    with patch.object(borradores, '_verification_expired', return_value=True):
        assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'error'
    cache.set(borradores._verification_lock(change), 'nuevo-trabajo', timeout=30)
    borradores._save_verification(change, {'estado': 'ok', 'ok': True, 'problemas': []})
    borradores._release_verification(change)
    change.refresh_from_db()
    assert change.payload['verificacion']['estado'] == 'error'
    assert cache.get(borradores._verification_lock(change)) == 'nuevo-trabajo'


# // Falla si el límite del subproceso desaparece al pasar a segundo plano o si un error dispara reintentos al consultar.
def test_subprocess_timeout_is_cached_without_restarting(api_client, client, owner, settings, tmp_path, verification_threads):
    draft = prepare(api_client)
    marker = slow_verifier(tmp_path, settings)
    settings.DESIGN_VERIFIER_TIMEOUT = 1
    assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'en_curso'
    result = result_after_wait(lambda: poll(api_client, client, owner[1], draft, 'pos'))
    assert result['estado'] == 'error' and 'tiempo máximo' in result['mensaje']
    assert poll(api_client, client, owner[1], draft, 'pos') == result
    assert len(verification_threads) == 1 and marker.read_text().splitlines() == ['medición']


# // Falla si no_disponible, problemas o verde dejan de ser resultados estables al consultar el mismo borrador.
@pytest.mark.parametrize('state, ok', [('no_disponible', None), ('problemas', 'False'), ('ok', 'True')])
def test_terminal_results_are_reused(api_client, client, owner, settings, tmp_path, verification_threads, state, ok):
    draft = prepare(api_client)
    if ok is not None:
        slow_verifier(tmp_path, settings, seconds=0, ok=ok)
    assert poll(api_client, client, owner[1], draft, 'pos')['estado'] == 'en_curso'
    final = result_after_wait(lambda: poll(api_client, client, owner[1], draft, 'pos'))
    assert final['estado'] == state
    assert poll(api_client, client, owner[1], draft, 'pos') == final
    assert len(verification_threads) == 1
