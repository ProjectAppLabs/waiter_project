from unittest.mock import patch
from uuid import uuid4

import pytest

from django.db import OperationalError
from experience_app.models import ChannelOrder
from experience_app.tests.conftest import DELIVERY

pytestmark = pytest.mark.django_db
BASE = '/internal/v1/burger-house/poblado/whatsapp/'
QUOTE = {'cotizacion': 'a' * 64, 'total': 12000, 'impuestos': 0, 'moneda': 'COP', 'lineas': []}
RESULT = {'id': 42, 'referencia': 'TA042', 'estado': 'draft', 'pagado': 0, 'total': 12000}


@pytest.fixture
def channel(api_client, settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'channel-test-key'
    api_client.credentials(HTTP_X_INTERNAL_KEY='channel-test-key')
    with patch('experience_app.services.channel_orders.resolve', return_value=DELIVERY), \
         patch('experience_app.services.channel_orders.Client') as cls:
        cls.return_value.call_kw.return_value = QUOTE
        yield api_client, cls.return_value.call_kw


def payload():
    return {'idempotencia': str(uuid4()), 'cliente': {'nombre': 'Ana', 'telefono': '+573001234567'},
            'lineas': [{'producto': 3, 'cantidad': 1, 'nota': ''}]}


# Falla si una petición sin clave resuelve una sede.
def test_authentication_is_required_before_any_resolution(api_client):
    with patch('experience_app.services.channel_orders.resolve') as resolve:
        response = api_client.post(BASE + 'pedidos/', payload(), format='json')
    assert response.status_code == 401
    resolve.assert_not_called()


# Falla si un reintento duplica la cotización o reutiliza una clave con otro contenido.
def test_quote_retry_and_conflicting_reuse(channel):
    client, rpc = channel
    data = payload()
    first = client.post(BASE + 'pedidos/', data, format='json')
    assert first.status_code == 201
    assert first.data['estado'] == 'borrador'
    assert first.data['pedido_pos'] is None
    retry = client.post(BASE + 'pedidos/', data, format='json')
    assert retry.status_code == 200 and retry.data['id'] == first.data['id']
    assert rpc.call_count == 1
    data['lineas'][0]['cantidad'] = 2
    assert client.post(BASE + 'pedidos/', data, format='json').status_code == 409
    assert ChannelOrder.objects.count() == 1


# Falla si se confirma otra cotización o se duplica el pedido al reintentar.
def test_confirmation_requires_acceptance_of_exact_quote_and_stays_idempotent(channel):
    client, rpc = channel
    order = client.post(BASE + 'pedidos/', payload(), format='json').data
    url = BASE + f"pedidos/{order['id']}/confirmar/"
    rpc.reset_mock()
    assert client.post(url, {'confirmado': False, 'cotizacion': 'a' * 64}, format='json').status_code == 400
    assert client.post(url, {'confirmado': True, 'cotizacion': 'b' * 64}, format='json').status_code == 409
    rpc.assert_not_called()
    rpc.return_value = RESULT
    for _ in range(2):
        response = client.post(url, {'confirmado': True, 'cotizacion': 'a' * 64}, format='json')
        assert response.status_code == 200 and response.data['pedido_pos']['pagado'] == 0
    assert rpc.call_count == 1
    assert rpc.call_args.args[1] == 'waiter_whatsapp_confirm'
    assert rpc.call_args.args[2][1] == order['id']


# Falla si un timeout cambia la identidad del pedido al reintentar.
def test_timeout_preserves_same_remote_uuid_for_retry(channel):
    client, rpc = channel
    order = client.post(BASE + 'pedidos/', payload(), format='json').data
    url = BASE + f"pedidos/{order['id']}/confirmar/"
    rpc.side_effect = [OperationalError('timeout'), RESULT]
    body = {'confirmado': True, 'cotizacion': 'a' * 64}
    assert client.post(url, body, format='json').status_code == 503
    assert ChannelOrder.objects.get(id=order['id']).result is None
    assert client.post(url, body, format='json').status_code == 200
    assert rpc.call_args_list[-1] == rpc.call_args_list[-2]


# Falla si una sede consulta o confirma pedidos de otra.
def test_other_venue_cannot_access_or_confirm_order(channel):
    client, rpc = channel
    order = client.post(BASE + 'pedidos/', payload(), format='json').data
    wrong = BASE.replace('poblado', 'otra') + f"pedidos/{order['id']}/"
    rpc.reset_mock()
    assert client.get(wrong).status_code == 404
    assert client.post(wrong + 'confirmar/', {'confirmado': True, 'cotizacion': 'a' * 64}, format='json').status_code == 404
    rpc.assert_not_called()


# Falla si el canal acepta precios del cliente o entradas inválidas.
@pytest.mark.parametrize('change', ['precio', 'empty', 'phone', 'quantity'])
def test_rejects_untrusted_prices_and_invalid_input(channel, change):
    client, rpc = channel
    data = payload()
    if change == 'precio':
        data['lineas'][0]['precio'] = 1
    elif change == 'empty':
        data['lineas'] = []
    elif change == 'phone':
        data['cliente']['telefono'] = '3001234567'
    else:
        data['lineas'][0]['cantidad'] = -1
    assert client.post(BASE + 'pedidos/', data, format='json').status_code == 400
    rpc.assert_not_called()
