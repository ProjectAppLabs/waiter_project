"""Foto de un plato, servida por la experiencia: el comensal recibe solo los datos públicos.

GET /api/v1/<rest>/<sede>/fotos/<id>/?v=<versión>&tam=tarjeta|plato
- `v` llega en la URL `foto` de la carta (versión de la plantilla): cambia cuando cambia la foto, por eso la caché
  pública puede ser larga e inmutable. Si `v` no coincide con la versión que conoce la carta en caché (carta vieja o
  URL vieja), se sirve igual pero con `no-store`: nunca se promete inmutabilidad sobre una versión que no es la actual.
- `tam`: `tarjeta` (por defecto, para la carta) o `plato` (más grande, para la pantalla del plato). Otro valor → 400.
- 404 `sin foto` si el producto no está en la carta, no tiene foto, o el sistema propio ya no la tiene.
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.core.pos import resolve
from experience_app.services import catalog
from experience_app.utils.errors import ProductNotFound
from experience_app.utils.images import image_response

NO_PHOTO = {'detail': 'sin foto'}
BAD_SIZE = {'detail': f"tamaño de foto inválido; usa {' o '.join(sorted(catalog.PHOTO_SIZES))}"}


@api_view(['GET'])
def photo(request, restaurant, venue, product_id):
    size = request.GET.get('tam', catalog.DEFAULT_PHOTO_SIZE)
    if size not in catalog.PHOTO_SIZES:
        return Response(BAD_SIZE, status=400)
    tenant = resolve(restaurant, venue)
    try:
        product = catalog.find_product(tenant, product_id)
    except ProductNotFound:
        return Response(NO_PHOTO, status=404)
    # La carta (en caché) ya sabe si hay foto: sin ella no se consulta la base propia ni la caché de fotos.
    if not product.has_image:
        return Response(NO_PHOTO, status=404)
    found = catalog.get_photo(tenant, product, size)
    if found is None:
        return Response(NO_PHOTO, status=404)
    data, content_type = found
    requested = request.GET.get('v')
    return image_response(data, content_type, immutable=not requested or requested == product.image_version, filename='foto')


@api_view(['GET'])
def gallery_photo(request, restaurant, venue, product_id, photo_id):
    """GET /api/v1/<rest>/<sede>/fotos/<producto>/galeria/<foto>/?v=<versión>."""
    tenant = resolve(restaurant, venue)
    try:
        product = catalog.find_product(tenant, product_id)
    except ProductNotFound:
        return Response(NO_PHOTO, status=404)
    photo = next((p for p in product.gallery if p['id'] == photo_id), None)
    if photo is None:
        return Response(NO_PHOTO, status=404)
    found = catalog.get_gallery_photo(tenant, product, photo_id)
    if found is None:
        return Response(NO_PHOTO, status=404)
    data, content_type = found
    requested = request.GET.get('v')
    return image_response(data, content_type, immutable=not requested or requested == photo['version'], filename='foto')
