"""Borradores de solo lectura y contrato público del sistema de diseño; el POS prepara por su pasarela interna."""
from copy import deepcopy

from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.registry.client import resolve
from experience_app.diseno import borradores
from experience_app.diseno import services as design
from experience_app.plantillas import services as templates
from experience_app.views.internal import INVALID_KEY, key_is_valid


def no_store(data, status=200):
    response = Response(data, status=status)
    response['Cache-Control'] = 'no-store'
    response['Referrer-Policy'] = 'no-referrer'
    return response


# J5: la página viva del comensal lee el esquema y el inventario para describir cada componente y opción.
# No depende de la sede ni de una clave: es el mismo contrato versionado que sirve el MCP.
@api_view(['GET'])
def contract(request):
    response = Response({'version': design.SCHEMA['properties']['version']['const'],
                         'esquema': deepcopy(design.SCHEMA), 'inventario': deepcopy(design.INVENTORY)})
    response['Cache-Control'] = 'public, max-age=3600'
    return response


@api_view(['GET'])
def preview(request, restaurant, venue, token):
    try:
        return no_store(borradores.read(restaurant, venue, token))
    except borradores.InvalidDraft as exc:
        return no_store({'detail': str(exc)}, status=404)


@api_view(['POST'])
def prepare(request, restaurant, venue):
    if not key_is_valid(request):
        return no_store(INVALID_KEY, status=401)
    if not isinstance(request.data, dict) or set(request.data) - {'plantilla', 'tema', 'paleta', 'tipografia'}:
        return no_store({'detail': 'Envía solo los ajustes del menú.'}, status=400)
    try:
        _, _, _, theme = templates.prepare(restaurant, venue, request.data)
    except templates.InvalidSettings as exc:
        return no_store({'detail': str(exc)}, status=400)
    change = borradores.create(resolve(restaurant, venue), theme)
    return no_store(borradores.result(change), status=201)
