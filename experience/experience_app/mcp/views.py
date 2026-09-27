"""Rutas del MCP.

Pública (la llaman los clientes MCP, p. ej. Claude):
- POST /mcp/                 clave en «Authorization: Bearer wtr_…» (Claude Code y clientes que permiten cabeceras)
- POST /mcp/<clave>/         clave en la ruta, para conectores que solo aceptan una URL (p. ej. claude.ai)

Internas (X-Internal-Key; las llama el addon de Odoo desde /waiter/admin/mcp_keys, con el administrador del POS):
- GET  /internal/v1/<rest>/<sede>/mcp/claves/                  lista (sin las claves: solo nombre, prefijo y fechas)
- POST /internal/v1/<rest>/<sede>/mcp/claves/                  crea una; la respuesta trae la clave en claro UNA vez
- POST /internal/v1/<rest>/<sede>/mcp/claves/<id>/revocar/     revoca una clave de esa sede
"""
import json

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.mcp import keys, protocol
from experience_app.views.internal import INVALID_KEY, key_is_valid

MAX_BODY = 1_000_000


def _bearer(request) -> str | None:
    header = request.headers.get('Authorization', '')
    return header[7:].strip() if header.lower().startswith('bearer ') else None


@csrf_exempt
def endpoint(request, raw_key: str | None = None):
    if request.method != 'POST':
        # Sin flujo SSE ni sesiones: el transporte permite responder 405 al GET y al DELETE.
        return HttpResponse(status=405, headers={'Allow': 'POST'})
    key = keys.authenticate(raw_key or _bearer(request))
    if key is None:
        return JsonResponse(protocol._error(None, -32001, 'Clave MCP inválida o revocada. Genera una en el POS: Configuración › Integraciones IA.'),
                            status=401, headers={'WWW-Authenticate': 'Bearer'})
    if len(request.body) > MAX_BODY:
        return JsonResponse(protocol._error(None, protocol.INVALID_REQUEST, 'Mensaje demasiado grande.'), status=413)
    try:
        message = json.loads(request.body)
    except ValueError:
        return JsonResponse(protocol._error(None, protocol.PARSE_ERROR, 'El cuerpo no es JSON.'), status=400)
    if isinstance(message, list):
        return JsonResponse(protocol._error(None, protocol.INVALID_REQUEST, 'No se admiten lotes: envía un mensaje por petición.'), status=400)
    response = protocol.handle(message, key)
    return HttpResponse(status=202) if response is None else JsonResponse(response)


@api_view(['GET', 'POST'])
def internal_keys(request, restaurant, venue):
    if not key_is_valid(request):
        return Response(INVALID_KEY, status=401)
    if request.method == 'GET':
        return Response({'claves': keys.listing(restaurant, venue)})
    name = request.data.get('nombre') if isinstance(request.data, dict) else None
    if not isinstance(name, str) or not name.strip():
        return Response({'detail': 'Ponle un nombre a la clave (por ejemplo, «Claude de Gustavo»).'}, status=400)
    try:
        key, raw = keys.create(restaurant, venue, name, str(request.data.get('creadaPor') or ''))
    except keys.KeyLimit as exc:
        return Response({'detail': str(exc)}, status=400)
    return Response({'clave': raw, **keys.view(key)}, status=201)


@api_view(['POST'])
def internal_revoke(request, restaurant, venue, key_id):
    if not key_is_valid(request):
        return Response(INVALID_KEY, status=401)
    if not keys.revoke(restaurant, venue, key_id):
        return Response({'detail': 'La clave no existe o ya estaba revocada.'}, status=404)
    return Response({'revocada': key_id})
