"""Protocolo MCP (JSON-RPC 2.0 sobre HTTP, modo sin estado del transporte «Streamable HTTP»).

Cada POST trae un mensaje y se responde con JSON en la misma petición: no hay sesiones ni flujos SSE, porque ninguna
herramienta necesita avisar al cliente por su cuenta. Métodos: initialize, ping, tools/list, tools/call; las
notificaciones (sin id) se aceptan sin respuesta.
"""
import json
import logging

from experience_app.adapters.odoo.client import OdooUnavailable
from experience_app.adapters.registry.client import RegistryUnavailable, TenantNotFound
from experience_app.mcp.models import McpKey
from experience_app.mcp.tools import TOOLS, TOOLS_BY_NAME, ToolError

log = logging.getLogger(__name__)
SUPPORTED_VERSIONS = ('2025-06-18', '2025-03-26', '2024-11-05')
SERVER_INFO = {'name': 'waiter', 'title': 'Waiter · configuración del restaurante', 'version': '1.0.0'}
INSTRUCTIONS = ('Herramientas para configurar el menú digital del restaurante al que pertenece esta clave. '
                'Lee antes de cambiar. Los cambios se preparan (vista previa + token) y solo se guardan con confirmar_cambio, '
                'después de que la persona apruebe la vista previa.')

PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS = -32700, -32600, -32601, -32602


def _error(msg_id, code: int, message: str) -> dict:
    return {'jsonrpc': '2.0', 'id': msg_id, 'error': {'code': code, 'message': message}}


def _result(msg_id, result: dict) -> dict:
    return {'jsonrpc': '2.0', 'id': msg_id, 'result': result}


def _text(data) -> list[dict]:
    return [{'type': 'text', 'text': data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2)}]


def call_tool(key: McpKey, params: dict) -> dict:
    tool = TOOLS_BY_NAME.get(params.get('name'))
    if tool is None:
        return {'content': _text(f'No existe la herramienta {params.get("name")!r}.'), 'isError': True}
    args = params.get('arguments') or {}
    if not isinstance(args, dict):
        return {'content': _text('arguments debe ser un objeto.'), 'isError': True}
    try:
        data = tool['handler'](key, args)
    except ToolError as exc:
        return {'content': _text(str(exc)), 'isError': True}
    except TenantNotFound:
        return {'content': _text('El restaurante de esta clave ya no existe en el registro.'), 'isError': True}
    except (RegistryUnavailable, OdooUnavailable):
        return {'content': _text('El restaurante no responde en este momento. Inténtalo de nuevo en un minuto.'), 'isError': True}
    return {'content': _text(data), 'structuredContent': data, 'isError': False}


def handle(message, key: McpKey) -> dict | None:
    """Respuesta a un mensaje JSON-RPC, o None si era una notificación."""
    if not isinstance(message, dict) or message.get('jsonrpc') != '2.0' or not isinstance(message.get('method'), str):
        return _error(message.get('id') if isinstance(message, dict) else None, INVALID_REQUEST, 'Mensaje JSON-RPC 2.0 inválido.')
    method, msg_id, params = message['method'], message.get('id'), message.get('params') or {}
    if 'id' not in message:
        return None  # notificación (p. ej. notifications/initialized): no lleva respuesta
    if not isinstance(params, dict):
        return _error(msg_id, INVALID_PARAMS, 'params debe ser un objeto.')
    if method == 'initialize':
        asked = params.get('protocolVersion')
        return _result(msg_id, {'protocolVersion': asked if asked in SUPPORTED_VERSIONS else SUPPORTED_VERSIONS[0],
                                'capabilities': {'tools': {'listChanged': False}}, 'serverInfo': SERVER_INFO, 'instructions': INSTRUCTIONS})
    if method == 'ping':
        return _result(msg_id, {})
    if method == 'tools/list':
        return _result(msg_id, {'tools': [{k: v for k, v in t.items() if k != 'handler'} for t in TOOLS]})
    if method == 'tools/call':
        return _result(msg_id, call_tool(key, params))
    return _error(msg_id, METHOD_NOT_FOUND, f'Método no soportado: {method}')
