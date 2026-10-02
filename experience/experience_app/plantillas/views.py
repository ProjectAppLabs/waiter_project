"""Endpoints de plantillas (Contrato 3 del Plan H).

Públicos (los lee el POS por el navegador y el comensal):
- GET /api/v1/plantillas/                      catálogo con miniaturas, sin las notas de implementación (resumen, estructura)
- GET /api/v1/plantillas/<codigo>/miniatura/   PNG del menú de la plantilla, caché larga (cambia solo con un despliegue)

Internos de compatibilidad (X-Internal-Key):
- GET /internal/v1/<rest>/<sede>/menu/         ajustes crudos de la sede (plantilla, paleta, tipografia)
- PUT /internal/v1/<rest>/<sede>/menu/         valida contra el catálogo, guarda, invalida caché y devuelve la plantilla resuelta
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.core.pos import resolve
from experience_app.plantillas import services
from experience_app.plantillas.seed import thumbnail_path
from experience_app.services import brand
from experience_app.utils.images import image_response
from experience_app.views.internal import INVALID_KEY, key_is_valid

# El catálogo cambia solo con un despliegue: una hora de caché pública basta y evita releer 30 specs por visita del POS.
CATALOG_CACHE_CONTROL = 'public, max-age=3600'


@api_view(['GET'])
def catalog(request):
    data = services.catalog_view()
    restaurant, venue = request.query_params.get('restaurante'), request.query_params.get('sede')
    if restaurant and venue:
        inputs = brand.brand_inputs(resolve(restaurant, venue))
        for spec in data['plantillas']:
            spec['tokens'] = services.final_tokens(spec, inputs, {}, {})
    response = Response(data)
    response['Cache-Control'] = 'no-store' if restaurant and venue else CATALOG_CACHE_CONTROL
    return response


@api_view(['GET'])
def thumbnail(request, code):
    path = thumbnail_path(code)
    if path is None:
        return Response({'detail': 'sin miniatura'}, status=404)
    return image_response(path.read_bytes(), 'image/png', immutable=True, filename=f'{code}.png')


@api_view(['GET', 'PUT'])
def venue_settings(request, restaurant, venue):
    if not key_is_valid(request):
        return Response(INVALID_KEY, status=401)
    if request.method == 'GET':
        return Response(services.settings_view(restaurant, venue))
    # Orden: validar (400 sin tocar nada) → resolver la sede en la base propia (si no responde, no se persiste nada y el
    # POS recibe el 404/503 sin ajustes a medias) → guardar. La plantilla resuelta necesita la marca (el sistema propio) y el descuento.
    try:
        services.prepare(restaurant, venue, request.data)
    except services.InvalidSettings as exc:
        return Response({'detail': str(exc)}, status=400)
    tenant = resolve(restaurant, venue)
    try:
        services.save_verified(restaurant, venue, request.data)
    except services.InvalidSettings as exc:
        return Response({'detail': str(exc)}, status=400)
    return Response({'plantilla': services.resolve_template(tenant)})
