"""Cliente JSON-RPC de Odoo. ÚNICO lugar del bloque 3 que sabe que Odoo existe (regla de dependencia 1).

Portado del cliente TypeScript de pos/ que ya está verificado contra Odoo 19.
"""
from dataclasses import dataclass

import requests
from django.conf import settings


@dataclass(frozen=True)
class OdooCredentials:
    url: str
    db: str
    login: str
    password: str
    pos_config_id: int


class OdooError(Exception):
    """Odoo respondió con un error de negocio (validación, acceso, sesión)."""

    def __init__(self, message: str, data: dict | None = None):
        super().__init__(message)
        self.data = data or {}


class OdooUnavailable(OdooError):
    """Odoo no responde: el carrito se conserva y se reintenta (no se pierde nunca)."""


class OdooClient:
    def __init__(self, creds: OdooCredentials, session: requests.Session | None = None):
        self.creds = creds
        self.http = session or requests.Session()
        self.uid: int | None = None

    def _post(self, path: str, params: dict) -> dict:
        try:
            response = self.http.post(f'{self.creds.url}{path}', json={'jsonrpc': '2.0', 'method': 'call', 'params': params},
                                      timeout=settings.ODOO_TIMEOUT_SECONDS)
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise OdooUnavailable(f'Odoo no responde: {exc}') from exc
        if response.status_code >= 500:
            raise OdooUnavailable(f'Odoo respondió {response.status_code}')
        body = response.json()
        if 'error' in body:
            data = body['error'].get('data', {})
            raise OdooError(data.get('message') or body['error'].get('message', 'error de Odoo'), data)
        return body.get('result')

    def authenticate(self) -> int:
        result = self._post('/web/session/authenticate', {'db': self.creds.db, 'login': self.creds.login, 'password': self.creds.password})
        if not result or not result.get('uid'):
            raise OdooError('credenciales de Odoo rechazadas')
        self.uid = result['uid']
        return self.uid

    def call_kw(self, model: str, method: str, args: list, kwargs: dict | None = None):
        if self.uid is None:
            self.authenticate()
        kwargs = dict(kwargs or {})
        kwargs['context'] = {**kwargs.get('context', {}), 'waiter_config_id': self.creds.pos_config_id}
        params = {'model': model, 'method': method, 'args': args, 'kwargs': kwargs}
        try:
            return self._post('/web/dataset/call_kw', params)
        except OdooError as exc:
            if exc.data.get('name') != 'odoo.http.SessionExpiredException':
                raise
            self.authenticate()
            return self._post('/web/dataset/call_kw', params)
