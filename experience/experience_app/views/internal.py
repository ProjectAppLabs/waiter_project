"""Rutas internas (X-Internal-Key): para integraciones autorizadas, nunca para el comensal."""
import hmac

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.plantillas import services as templates
from experience_app.services import brand, catalog

INVALID_KEY = {'detail': 'clave interna inválida'}


def key_is_valid(request) -> bool:
    key = request.headers.get('X-Internal-Key', '')
    return bool(settings.EXPERIENCE_INTERNAL_KEY) and hmac.compare_digest(key.encode('utf-8'), settings.EXPERIENCE_INTERNAL_KEY.encode('utf-8'))


@api_view(['POST'])
def invalidate_menu(request, restaurant, venue):
    if not key_is_valid(request):
        return Response(INVALID_KEY, status=401)
    catalog.invalidate(restaurant, venue)
    # La marca y la plantilla caen con la carta: quien avisa "algo cambió en el sistema propio" no tiene que distinguir qué.
    brand.invalidate(restaurant, venue)
    templates.invalidate(restaurant, venue)
    return Response({'invalidada': f'{restaurant}/{venue}'})
