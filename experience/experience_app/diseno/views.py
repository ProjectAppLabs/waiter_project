"""Borradores de solo lectura y contrato público del sistema de diseño; el POS prepara por su pasarela interna."""
from copy import deepcopy

from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.registry.client import resolve
from experience_app.diseno import borradores, decoraciones, plantillas
from experience_app.diseno import services as design
from experience_app.plantillas import services as templates
from experience_app.utils.images import image_response
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
                         'esquema': design.public_schema(), 'inventario': deepcopy(design.INVENTORY),
                         'plantillas': plantillas.contract()})
    response['Cache-Control'] = 'public, max-age=3600'
    return response


# ---- K4: galería de decoraciones de la sede ------------------------------------------------------------------------
@api_view(['GET'])
def decorations(request, restaurant, venue):
    """Lista pública de solo lectura: ids, nombres, tamaños y rutas. No lleva binarios."""
    response = Response({'decoraciones': decoraciones.listing(restaurant, venue), 'fabrica': plantillas.DECORATIONS['fabrica']})
    response['Cache-Control'] = 'no-store'
    return response


@api_view(['GET'])
def decoration(request, restaurant, venue, slug):
    found = decoraciones.get(restaurant, venue, slug)
    if found is None:
        return Response({'detail': 'sin decoración'}, status=404)
    requested = request.GET.get('v')
    current = decoraciones.file_path(found).rsplit('v=', 1)[1]
    return image_response(bytes(found.data), found.content_type, immutable=not requested or requested == current,
                          filename=f'{found.slug}.{decoraciones.TYPES[found.content_type]}')


@api_view(['GET', 'POST'])
def internal_decorations(request, restaurant, venue):
    if not key_is_valid(request):
        return no_store(INVALID_KEY, status=401)
    if request.method == 'GET':
        return no_store({'decoraciones': decoraciones.listing(restaurant, venue), 'fabrica': plantillas.DECORATIONS['fabrica'],
                         'limites': {'peso': decoraciones.MAX_BYTES, 'lado': decoraciones.MAX_SIDE, 'cantidad': decoraciones.MAX_PER_VENUE}})
    body = request.data if isinstance(request.data, dict) else {}
    try:
        created = decoraciones.create(restaurant, venue, body.get('nombre'), body.get('imagen'), str(body.get('creadaPor') or ''))
    except decoraciones.InvalidDecoration as exc:
        return no_store({'detail': str(exc)}, status=400)
    return no_store(decoraciones.view(created), status=201)


@api_view(['DELETE'])
def internal_decoration(request, restaurant, venue, slug):
    if not key_is_valid(request):
        return no_store(INVALID_KEY, status=401)
    if not decoraciones.remove(restaurant, venue, slug):
        return no_store({'detail': 'La decoración no existe.'}, status=404)
    # Las plantillas que la usaban vuelven a fábrica al releerse (el validador ya no la encuentra); la caché debe soltarlas.
    templates.invalidate(restaurant, venue)
    return no_store({'eliminada': slug})


@api_view(['GET'])
def preview(request, restaurant, venue, token):
    try:
        return no_store(borradores.read(restaurant, venue, token))
    except borradores.InvalidDraft as exc:
        return no_store({'detail': str(exc)}, status=404)


@api_view(['POST'])
def verify(request, restaurant, venue, token):
    if not key_is_valid(request):
        return no_store(INVALID_KEY, status=401)
    try:
        change = borradores.get(restaurant, venue, token)
        result = borradores.start_verification(change)
        return no_store(borradores.verification_result(change, result))
    except borradores.InvalidDraft as exc:
        return no_store({'detail': str(exc)}, status=400)


@api_view(['POST'])
def prepare(request, restaurant, venue):
    if not key_is_valid(request):
        return no_store(INVALID_KEY, status=401)
    if not isinstance(request.data, dict) or set(request.data) - {'plantilla', 'tema', 'paleta', 'tipografia'}:
        return no_store({'detail': 'Envía solo los ajustes del menú.'}, status=400)
    try:
        _, _, _, theme = templates.prepare(restaurant, venue, request.data)
        change = borradores.create(resolve(restaurant, venue), theme)
    except (templates.InvalidSettings, design.InvalidTheme) as exc:
        return no_store({'detail': str(exc)}, status=400)
    return no_store(borradores.result(change), status=201)
