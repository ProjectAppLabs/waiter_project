"""El registro real de Gunicorn mantiene diagnóstico sin publicar credenciales."""
import json
import shlex
import sys
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from gunicorn.app.wsgiapp import WSGIApplication
from gunicorn.glogging import Logger

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('status', ['200 OK', '401 Unauthorized'])
def test_access_log_no_publica_credenciales_y_conserva_resultado(caplog, monkeypatch, status):
    # Falla si una clave de URL, consulta o cabecera acaba en el registro, o se pierde el resultado de la petición.
    root = Path(__file__).resolve().parents[3]
    command = next(line for line in (root / 'deploy/experience.Dockerfile').read_text().splitlines()
                   if line.startswith('CMD '))
    arguments = shlex.split(json.loads(command[4:])[2])
    monkeypatch.chdir(root / 'experience')
    monkeypatch.setattr(sys, 'argv', ['gunicorn', *arguments[arguments.index('gunicorn') + 1:]])
    # Sólo se carga la configuración del comando de producción, sin migrar ni arrancar un servidor.
    logger = Logger(WSGIApplication().cfg)
    logger.access_log.addHandler(caplog.handler)
    secret = 'credencial-sintetica-r2'
    response = SimpleNamespace(status=status, sent=123, headers=[('Set-Cookie', secret)])
    environ = {
        'REQUEST_METHOD': 'POST', 'RAW_URI': f'/mcp/{secret}/?token={secret}',
        'PATH_INFO': f'/mcp/{secret}/', 'QUERY_STRING': f'token={secret}',
        'SERVER_PROTOCOL': 'HTTP/1.1', 'HTTP_REFERER': f'https://example.test/{secret}',
        'HTTP_COOKIE': secret, 'HTTP_AUTHORIZATION': f'Bearer {secret}',
    }
    try:
        with caplog.at_level('INFO', logger='gunicorn.access'):
            logger.access(response, [('Authorization', secret)], environ, timedelta(microseconds=456))
    finally:
        logger.access_log.removeHandler(caplog.handler)
    assert len(caplog.records) == 1
    record = caplog.records[0].getMessage()
    assert secret not in record
    assert f'metodo=POST estado={status[:3]} bytes=123 duracion_us=456' in record
