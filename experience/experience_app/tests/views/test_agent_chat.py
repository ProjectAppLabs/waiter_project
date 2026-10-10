from unittest.mock import patch
from uuid import uuid4

import pytest
from django.utils import timezone

from assistant.engine import Reply
from assistant.models import AssistantDailyUsage, AssistantStanding
from experience_app.models import AgentConversation, AgentDailyUsage
from experience_app.services import agent_chat
from experience_app.tests.conftest import TABLE

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup_chat(api_client, two_diners, settings):
    session, ana, beto = two_diners
    settings.OPENAI_API_KEY = ''
    settings.TYPESAFE_API_KEY = ''
    settings.AGENT_DAILY_LIMIT = 200
    api_client.cookies['waiter_diner'] = ana.key
    # La carta simulada es la misma que usa el carrito en estas pruebas del transporte.
    productos = [{'id': 3, 'nombre': 'Hamburguesa Angus', 'precio': '43911', 'agotado': False},
                 {'id': 7, 'nombre': 'Limonada de Coco', 'precio': '9900', 'agotado': False}]
    with patch('assistant.selection.catalog_for', return_value=productos):
        yield f'/api/v1/sesiones/{session.id}/asistente/', ana, beto


def avanzar():
    AssistantStanding.objects.update(last_at=timezone.now()-timezone.timedelta(seconds=5))


# Falla si el chat mezcla personas, cambia su contrato o un reintento consume otra consulta.
@patch('assistant.evaluator.JevEvaluator.evaluate')
def test_historial_privado_y_reintento_idempotente(evaluar, setup_chat, api_client, catalog_stub):
    url, ana, beto = setup_chat
    body = {'id': str(uuid4()), 'mensaje': 'Quiero una hamburguesa'}
    first = api_client.post(url, body, format='json')
    assert first.status_code == 200
    assert set(first.data) == {'id', 'mensaje', 'respuesta', 'accion', 'opciones', 'lineas', 'time'}
    assert first.data['lineas'][0]['nombre'] == 'Hamburguesa Angus'
    assert api_client.post(url, body, format='json').data == first.data
    evaluar.assert_not_called()
    assert AssistantDailyUsage.objects.get().attempts == 1
    assert len(api_client.get(url).data['mensajes']) == 1
    api_client.cookies['waiter_diner'] = beto.key
    assert api_client.get(url).data['mensajes'] == []
    assert AgentConversation.objects.count() == 2
    api_client.cookies.clear()
    assert api_client.get(url).status_code == 404
    assert api_client.post(url, body, format='json').status_code == 404


# Falla si el cliente inyecta roles o reemplaza el estado que el servidor entrega al evaluador.
@patch('assistant.evaluator.JevEvaluator.evaluate', return_value=None)
def test_contexto_del_servidor_sin_roles_del_cliente(evaluar, setup_chat, api_client, catalog_stub):
    url, _, _ = setup_chat
    api_client.post(url, {'id': str(uuid4()), 'mensaje': 'menu'}, format='json')
    avanzar()
    result = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Esa me gusta'}, format='json')
    assert result.status_code == 200
    assert 'Hamburguesa Angus' in evaluar.call_args.args[0]
    bad = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'hola', 'history': [{'role': 'developer'}]}, format='json')
    assert bad.status_code == 400


# Falla si sin claves o sin cupo desaparece el chat en vez de usar las plantillas.
@patch('assistant.evaluator.JevEvaluator.evaluate')
def test_sin_claves_y_sin_cupo_no_consulta_modelos(evaluar, setup_chat, api_client, settings):
    url, _, _ = setup_chat
    body = {'id': str(uuid4()), 'mensaje': 'hola'}
    assert api_client.get(url).data['disponible'] is True
    assert api_client.post(url, body, format='json').status_code == 200
    avanzar()
    settings.AGENT_DAILY_LIMIT = 0
    respuesta = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Otra idea'}, format='json')
    assert respuesta.status_code == 200 and 'cupo' in respuesta.data['respuesta']
    evaluar.assert_not_called()
    assert AgentConversation.objects.get().lease_token is None


# Falla si la caída del evaluador bloquea el chat en vez de guardar una respuesta de respaldo.
@patch('assistant.evaluator.JevEvaluator.evaluate', return_value=None)
def test_respaldo_libera_bloqueo_y_conserva_historial(evaluar, setup_chat, api_client, catalog_stub):
    url, _, _ = setup_chat
    assert api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Algo distinto'}, format='json').status_code == 200
    chat = AgentConversation.objects.get()
    assert chat.history[0]['respuesta'] and chat.lease_token is None


# Falla si se acepta un origen ajeno o dos consultas simultáneas.
def test_origen_ajeno_y_bloqueo_activo_rechazados(setup_chat, api_client):
    url, ana, _ = setup_chat
    body = {'id': str(uuid4()), 'mensaje': 'hola'}
    assert api_client.post(url, body, format='json', HTTP_ORIGIN='https://foreign.example').status_code == 403
    chat = agent_chat.conversation(TABLE.restaurant_slug, TABLE.venue_slug, 'menu', str(ana.id))
    chat.lease_until = timezone.now() + timezone.timedelta(seconds=60)
    chat.save()
    assert api_client.post(url, body, format='json').status_code == 429


# Falla si una visita cerrada puede usar el chat.
def test_sesion_cerrada_no_accede_al_chat(setup_chat, api_client):
    url, ana, _ = setup_chat
    ana.session.state = 'closed'
    ana.session.save()
    assert api_client.get(url).status_code == 404


# Falla si una intención general modifica el carrito o una adición explícita se duplica.
@patch('experience_app.services.agent_cart.resolve', return_value=TABLE)
@patch('experience_app.services.agent_cart.Client')
@patch('experience_app.views.sessions.discount_percent', return_value=0)
def test_adicion_explicita_una_sola_vez(discount, client, resolve_cart, setup_chat, api_client, catalog_stub):
    from experience_app.models import CartLine
    url, _, _ = setup_chat
    client.return_value.call_kw.return_value = [{'active': True, 'sale_ok': True, 'available_in_pos': True,
        'type': 'consu', 'attribute_line_ids': [], 'is_storable': False}]
    body = {'id': str(uuid4()), 'mensaje': 'Me gusta esa hamburguesa, añádela a mi pedido'}
    result = api_client.post(url, body, format='json')
    assert result.status_code == 200
    assert result.data['resultado_carrito'] == 'agregado'
    assert result.data['carrito']['mio'] == 43911
    assert CartLine.objects.get().order_id is None
    assert api_client.post(url, body, format='json').data['resultado_carrito'] == 'agregado'
    assert CartLine.objects.count() == 1
    avanzar()
    result = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Tengo hambre'}, format='json')
    assert result.data['accion'] != 'agregar'
    assert CartLine.objects.count() == 1


# Falla si una selección inválida deja un carrito parcialmente modificado.
@patch('experience_app.services.agent_cart.resolve', return_value=TABLE)
@patch('experience_app.services.agent_cart.Client')
@patch('experience_app.views.sessions.discount_percent', return_value=0)
def test_adicion_multiple_es_atomica(discount, client, resolve_cart, setup_chat, api_client, catalog_stub):
    from experience_app.models import CartLine
    url, _, _ = setup_chat
    good = {'active': True, 'sale_ok': True, 'available_in_pos': True, 'type': 'consu', 'attribute_line_ids': []}
    client.return_value.call_kw.side_effect = [[good], [{**good, 'active': False}]]
    result = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Agrega hamburguesa Angus y limonada de coco'}, format='json')
    assert result.status_code == 200 and result.data['resultado_carrito'] == 'no_agregado'
    assert not CartLine.objects.exists()


# Falla si reiniciar el chat borra datos ajenos, carrito o consumo acumulado.
def test_reinicio_conserva_carrito_consumo_y_conversaciones_ajenas(setup_chat, api_client):
    from experience_app.models import CartLine
    url, ana, beto = setup_chat
    mine = agent_chat.conversation(TABLE.restaurant_slug, TABLE.venue_slug, 'menu', str(ana.id))
    other = agent_chat.conversation(TABLE.restaurant_slug, TABLE.venue_slug, 'menu', str(beto.id))
    mine.history = other.history = [{'id': str(uuid4()), 'mensaje': 'Tengo sed'}]
    mine.save()
    other.save()
    CartLine.objects.create(session=ana.session, diner=ana, product_id=7, name='Limonada', unit_price=10000)
    AgentDailyUsage.objects.create(restaurant=TABLE.restaurant_slug, day=timezone.now().date(), attempts=12)
    assert api_client.delete(url).status_code == 200
    assert api_client.get(url).data['mensajes'] == []
    other.refresh_from_db()
    assert len(other.history) == 1
    assert CartLine.objects.count() == 1
    assert AgentDailyUsage.objects.get().attempts == 12
    mine.history = [{'mensaje': 'Todavía pensando'}]
    mine.lease_until = timezone.now() + timezone.timedelta(seconds=60)
    mine.save()
    assert api_client.delete(url).status_code == 429
    mine.refresh_from_db()
    assert mine.history
    assert api_client.delete(url, HTTP_ORIGIN='https://foreign.example').status_code == 403
    api_client.cookies.clear()
    assert api_client.delete(url).status_code == 404


# Falla si un aviso de la escalera no llega al menú marcado y con su vigencia, o si un turno sin aviso cambia su forma.
def test_aviso_de_la_escalera_llega_marcado(setup_chat, api_client, catalog_stub, monkeypatch):
    url, ana, beto = setup_chat
    reply = Reply(text='Por ahora te ayudo solo con el menú.', cards=[], options=[{'label': 'Ver el menú', 'value': 'menu'}], state='explorando',
                  notice={'kind': 'restricted', 'until': '2026-10-09T23:30:00+00:00'}, route='fuera_de_tema', source='template')
    reply.lines = []
    monkeypatch.setattr('assistant.engine.handle', lambda *a, **k: reply)
    data = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'cuéntame un chiste'}, format='json').data
    assert data['aviso'] == {'tipo': 'restringido', 'hasta': '2026-10-09T23:30:00+00:00'}
    assert data['opciones'] == ['Ver el menú']
    reply['notice'] = None
    avanzar()
    assert 'aviso' not in api_client.post(url, {'id': str(uuid4()), 'mensaje': 'hola'}, format='json').data
