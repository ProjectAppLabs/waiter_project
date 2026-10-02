"""Logo del restaurante, servido por la experiencia: el comensal recibe solo los datos públicos.

GET /api/v1/<rest>/<sede>/logo/?v=<versión>
- `v` llega en `contexto.marca.logo` (write_date de la compañía, compactado): cambia cuando cambia el logo, por eso
  la caché pública puede ser larga e inmutable. Si `v` no coincide con la versión que conoce la marca en caché, se
  sirve igual pero con `no-store`: nunca se promete inmutabilidad sobre una versión que no es la actual.
- 404 `sin logo` si la compañía no tiene logo, el sistema propio no responde, o el binario no es PNG/JPEG/GIF (un SVG jamás sale).
Mismas cabeceras que fotos/ (utils/images.py).
"""
from tenancy.http import Problem
from rest_framework.decorators import api_view
from rest_framework.response import Response

from django.db import DatabaseError
from experience_app.adapters.core.pos import resolve
from experience_app.services import brand
from experience_app.utils.images import image_response

NO_LOGO = {'detail': 'sin logo'}


@api_view(['GET'])
def logo(request, restaurant, venue):
    tenant = resolve(restaurant, venue)
    company = brand.get_company_brand(tenant)
    # La marca (en caché) ya sabe si hay logo: sin él no se consulta la base propia ni la caché del logo.
    if company is None or not company.has_logo:
        return Response(NO_LOGO, status=404)
    try:
        found = brand.get_logo(tenant, company)
    except (DatabaseError, Problem):
        # El servicio ya lo captura; esta es la promesa de la ruta: jamás un 5xx en un <img> por culpa del sistema propio.
        found = None
    if found is None:
        return Response(NO_LOGO, status=404)
    data, content_type = found
    requested = request.GET.get('v')
    return image_response(data, content_type, immutable=not requested or requested == company.version, filename='logo')
