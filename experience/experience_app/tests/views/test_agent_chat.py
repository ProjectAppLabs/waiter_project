from unittest.mock import patch
from uuid import uuid4

import pytest
from django.utils import timezone

from experience_app.models import AgentConversation, AgentDailyUsage
from experience_app.services import agent_chat
from experience_app.services.waiter_agent import AgentUnavailable
from experience_app.tests.conftest import TABLE

pytestmark = pytest.mark.django_db
PLAN = {'accion': 'recomendar', 'pregunta': 'ninguna', 'lineas': [{'producto': 3, 'cantidad': 1}]}


@pytest.fixture
def setup_chat(api_client, two_diners, settings):
    session, ana, beto = two_diners
    settings.OPENAI_API_KEY = 'test-placeholder'
    settings.WA_AGENT_MODEL = 'test-model'
    settings.AGENT_DAILY_LIMIT = 200
    api_client.cookies['waiter_diner'] = ana.key
    return f'/api/v1/sesiones/{session.id}/asistente/', ana, beto


# Falla si el chat mezcla personas o un reintento consume otra consulta.
@patch('experience_app.views.agent_chat.resolve', return_value=TABLE)
@patch('experience_app.services.waiter_agent.propose', return_value=PLAN)
def test_history_is_owner_scoped_and_retry_does_not_consume_again(propose, resolve, setup_chat, api_client, catalog_stub):
    url, ana, beto = setup_chat
    body = {'id': str(uuid4()), 'mensaje': 'Quiero una hamburguesa'}
    first = api_client.post(url, body, format='json')
    assert first.status_code == 200
    assert first.data['lineas'][0]['nombre'] == 'Hamburguesa Angus'
    assert api_client.post(url, body, format='json').data == first.data
    assert propose.call_count == 1
    assert AgentDailyUsage.objects.get().attempts == 1
    assert len(api_client.get(url).data['mensajes']) == 1
    api_client.cookies['waiter_diner'] = beto.key
    assert api_client.get(url).data['mensajes'] == []
    assert AgentConversation.objects.count() == 2
    api_client.cookies.clear()
    assert api_client.get(url).status_code == 404
    assert api_client.post(url, body, format='json').status_code == 404


# Falla si el cliente puede inyectar roles o reemplazar el historial del servidor.
@patch('experience_app.views.agent_chat.resolve', return_value=TABLE)
@patch('experience_app.services.waiter_agent.propose', return_value=PLAN)
def test_server_history_is_used_without_customer_supplied_roles(propose, resolve, setup_chat, api_client, catalog_stub):
    url, _, _ = setup_chat
    api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Tengo hambre'}, format='json')
    chat = AgentConversation.objects.get()
    chat.history[-1]['time'] -= 5
    chat.save()
    result = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Esa me gusta'}, format='json')
    assert result.status_code == 200
    assert propose.call_args.kwargs['history'][0]['cliente'] == 'Tengo hambre'
    bad = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'hola', 'history': [{'role': 'developer'}]}, format='json')
    assert bad.status_code == 400


# Falla si se consulta al proveedor con el chat desactivado o sin cupo.
@patch('experience_app.services.waiter_agent.propose')
def test_disabled_and_quota_make_no_provider_calls(propose, setup_chat, api_client, settings):
    url, _, _ = setup_chat
    settings.OPENAI_API_KEY = ''
    body = {'id': str(uuid4()), 'mensaje': 'hola'}
    assert api_client.get(url).data['disponible'] is False
    assert api_client.post(url, body, format='json').status_code == 503
    settings.OPENAI_API_KEY = 'test-placeholder'
    settings.AGENT_DAILY_LIMIT = 0
    assert api_client.post(url, body, format='json').status_code == 429
    propose.assert_not_called()
    assert AgentConversation.objects.get().lease_token is None


# Falla si un fallo bloquea el chat o inventa mensajes de historial.
@patch('experience_app.views.agent_chat.resolve', return_value=TABLE)
@patch('experience_app.services.waiter_agent.propose', side_effect=AgentUnavailable('Intenta más tarde.'))
def test_failure_releases_lease_and_does_not_invent_history(propose, resolve, setup_chat, api_client, catalog_stub):
    url, _, _ = setup_chat
    assert api_client.post(url, {'id': str(uuid4()), 'mensaje': 'hola'}, format='json').status_code == 503
    chat = AgentConversation.objects.get()
    assert chat.history == [] and chat.lease_token is None


# Falla si se acepta un origen ajeno o dos consultas simultáneas.
def test_invalid_origin_and_busy_lease_are_rejected(setup_chat, api_client):
    url, ana, _ = setup_chat
    body = {'id': str(uuid4()), 'mensaje': 'hola'}
    assert api_client.post(url, body, format='json', HTTP_ORIGIN='https://foreign.example').status_code == 403
    chat = agent_chat.conversation(TABLE.restaurant_slug, TABLE.venue_slug, 'menu', str(ana.id))
    chat.lease_until = timezone.now() + timezone.timedelta(seconds=60)
    chat.save()
    assert api_client.post(url, body, format='json').status_code == 429


# Falla si una visita cerrada puede usar el chat.
def test_closed_session_cannot_access_chat(setup_chat, api_client):
    url, ana, _ = setup_chat
    ana.session.state = 'closed'
    ana.session.save()
    assert api_client.get(url).status_code == 404


# Falla si una intención general modifica el carrito o una adición explícita se duplica.
@patch('experience_app.services.agent_cart.resolve', return_value=TABLE)
@patch('experience_app.views.agent_chat.resolve', return_value=TABLE)
@patch('experience_app.services.agent_cart.Client')
@patch('experience_app.views.sessions.discount_percent', return_value=0)
@patch('experience_app.services.waiter_agent.propose')
def test_explicit_add_updates_cart_once_and_general_desire_never_writes(propose, discount, client, resolve, resolve_cart, setup_chat, api_client, catalog_stub):
    from experience_app.models import CartLine
    url, _, _ = setup_chat
    propose.return_value = {**PLAN, 'accion': 'agregar', 'respuesta': 'Revisando tu selección.', 'opciones': []}
    client.return_value.call_kw.return_value = [{'active': True, 'sale_ok': True, 'available_in_pos': True,
        'type': 'consu', 'attribute_line_ids': [], 'is_storable': False}]
    body = {'id': str(uuid4()), 'mensaje': 'Me gusta esa hamburguesa, añádela a mi pedido'}
    result = api_client.post(url, body, format='json')
    assert result.status_code == 200
    assert result.data['resultado_carrito'] == 'agregado'
    assert result.data['carrito']['mio'] == 43911
    assert CartLine.objects.get().order_id is None
    assert api_client.post(url, body, format='json').data['resultado_carrito'] == 'agregado'
    assert CartLine.objects.count() == 1 and propose.call_count == 1
    chat = AgentConversation.objects.get()
    chat.history[-1]['time'] -= 5
    chat.save()
    result = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Tengo hambre'}, format='json')
    assert result.data['accion'] == 'cotizar'
    assert CartLine.objects.count() == 1


# Falla si una selección inválida deja un carrito parcialmente modificado.
@patch('experience_app.services.agent_cart.resolve', return_value=TABLE)
@patch('experience_app.views.agent_chat.resolve', return_value=TABLE)
@patch('experience_app.services.agent_cart.Client')
@patch('experience_app.views.sessions.discount_percent', return_value=0)
@patch('experience_app.services.waiter_agent.propose')
def test_batch_add_is_all_or_nothing(propose, discount, client, resolve, resolve_cart, setup_chat, api_client, catalog_stub):
    from experience_app.models import CartLine
    url, _, _ = setup_chat
    propose.return_value = {**PLAN, 'accion': 'agregar', 'lineas': [
        {'producto': 3, 'cantidad': 1}, {'producto': 7, 'cantidad': 1}]}
    good = {'active': True, 'sale_ok': True, 'available_in_pos': True, 'type': 'consu', 'attribute_line_ids': []}
    client.return_value.call_kw.side_effect = [[good], [{**good, 'active': False}]]
    result = api_client.post(url, {'id': str(uuid4()), 'mensaje': 'Agrega los dos al pedido'}, format='json')
    assert result.status_code == 200 and result.data['resultado_carrito'] == 'no_agregado'
    assert not CartLine.objects.exists()


# Falla si reiniciar el chat borra datos ajenos, carrito o consumo acumulado.
def test_new_conversation_clears_only_own_history_and_keeps_cart_and_usage(setup_chat, api_client):
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
