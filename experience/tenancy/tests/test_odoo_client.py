"""El transporte de Odoo queda disponible únicamente para importar y conciliar."""
from unittest.mock import Mock

import pytest
import requests

from tenancy.odoo_migration.client import OdooClient, OdooCredentials, OdooError, OdooUnavailable

CREDS = OdooCredentials('http://origen.invalid', 'origen', 'migracion', 'secreto', 7)


def response(result=None, *, error=None, status=200):
    return Mock(status_code=status, json=Mock(return_value={'error': error} if error else {'result': result}))


# Falla si la migración pierde la autenticación, el contexto de sede o el timeout independiente del comensal.
def test_authenticated_read_preserves_context_and_timeout():
    http = Mock()
    http.post.side_effect = [response({'uid': 4}), response([{'id': 12}])]
    client = OdooClient(CREDS, http, timeout=45)
    assert client.call_kw('product.product', 'search_read', [[]], {'context': {'active_test': False}}) == [{'id': 12}]
    call = http.post.call_args.kwargs
    assert call['timeout'] == 45
    assert call['json']['params']['kwargs']['context'] == {'active_test': False, 'waiter_config_id': 7}


# Falla si una sesión vencida impide continuar una importación o se reintenta indefinidamente.
def test_expired_session_authenticates_again_once():
    expired = response(error={'data': {'name': 'odoo.http.SessionExpiredException', 'message': 'Sesión vencida'}})
    http = Mock()
    http.post.side_effect = [response({'uid': 4}), expired, response({'uid': 5}), response([])]
    client = OdooClient(CREDS, http)
    assert client.call_kw('res.company', 'search_read', [[]]) == []
    assert client.uid == 5 and http.post.call_count == 4
    http.post.side_effect = [expired, response({'uid': 6}), expired]
    with pytest.raises(OdooError):
        client.call_kw('res.company', 'search_read', [[]])
    assert http.post.call_count == 7


# Falla si una caída de red se confunde con una validación de los datos que se migran.
@pytest.mark.parametrize('error', [requests.ConnectionError('Sin conexión'), requests.Timeout('Sin respuesta')])
def test_network_failure_is_unavailable(error):
    http = Mock()
    http.post.side_effect = error
    with pytest.raises(OdooUnavailable):
        OdooClient(CREDS, http).authenticate()


# Falla si un servidor caído o unas credenciales inválidas permiten continuar la migración.
@pytest.mark.parametrize(('reply', 'error'), [(response(status=503), OdooUnavailable), (response(False), OdooError)])
def test_failed_authentication_is_reported(reply, error):
    http = Mock()
    http.post.return_value = reply
    with pytest.raises(error):
        OdooClient(CREDS, http).authenticate()
