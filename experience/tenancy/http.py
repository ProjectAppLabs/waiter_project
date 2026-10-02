"""Respuestas y validación comunes, sin cambiar la API del comensal."""
from datetime import date, datetime, timezone as datetime_timezone
from decimal import Decimal
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView


class Problem(Exception):
    def __init__(self, code, message, status=400, **extra):
        self.status = status
        self.body = {'error': code, 'message': message, **extra}


def require(condition, message='No tienes permiso para esta acción.', code='forbidden', status=403):
    if not condition:
        raise Problem(code, message, status)


def payload(data, allowed, required=()):
    if not isinstance(data, dict) or set(data) - set(allowed) or not set(required) <= data.keys():
        raise Problem('invalid_data', 'Revisa los campos enviados y completa los obligatorios.')
    return dict(data)


def json_value(value):
    if isinstance(value, datetime):
        return value.astimezone(datetime_timezone.utc).isoformat().replace('+00:00', 'Z')
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def model_dict(obj, fields):
    return {field: json_value(getattr(obj, field)) for field in fields}


def save_valid(obj):
    obj.full_clean()
    obj.save()
    return obj


def trusted_origin(origin, request):
    """El POS, la plataforma, los orígenes de CORS y el propio servidor. Como cada organización entra por su subdominio
    (`frisby.localhost:3000`, `frisby.waiter.projectapp.co`), también vale cualquier subdominio del POS."""
    origin = origin.rstrip('/')
    trusted = {settings.POS_URL, settings.PLATFORM_URL, *settings.CORS_ALLOWED_ORIGINS, f'{request.scheme}://{request.get_host()}'}
    if origin in trusted:
        return True
    scheme, _, host = origin.partition('://')
    pos_scheme, _, pos_host = settings.POS_URL.partition('://')
    return scheme == pos_scheme and host.endswith('.' + pos_host)


class ContractView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Las cookies no autorizan escrituras desde un origen ajeno, incluidos otros subdominios.
        origin = request.headers.get('Origin')
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and origin:
            require(trusted_origin(origin, request), 'El origen de la petición no está permitido.', 'invalid_origin')

    def handle_exception(self, exc):
        if isinstance(exc, Problem):
            return Response(exc.body, status=exc.status)
        if isinstance(exc, ValidationError):
            return Response({'error': 'invalid_data', 'message': ' '.join(exc.messages)}, status=400)
        if isinstance(exc, IntegrityError):
            return Response({'error': 'conflict', 'message': 'El usuario, correo o identificador ya existe.'}, status=409)
        if isinstance(exc, APIException):
            return Response({'error': 'invalid_data', 'message': 'La petición no es válida.'}, status=exc.status_code)
        return super().handle_exception(exc)


class NotFoundView(ContractView):
    def initial(self, request, *args, **kwargs):
        raise Problem('not_found', 'La ruta no existe.', 404)
