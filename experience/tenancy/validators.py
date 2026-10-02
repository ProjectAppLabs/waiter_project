"""Validaciones compartidas del contrato de plataforma y acceso."""
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.exceptions import ValidationError

RESERVED_SLUGS = {'plataforma', 'www', 'api', 'menu', 'admin', 'app'}


def validate_slug(value):
    if not isinstance(value, str) or not 2 <= len(value) <= 40 or not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', value):
        raise ValidationError('El identificador debe tener entre 2 y 40 letras minúsculas, números o guiones.')
    if value in RESERVED_SLUGS:
        raise ValidationError('Este identificador está reservado.')


def validate_username(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z0-9.]{3,32}', value):
        raise ValidationError('El usuario debe tener de 3 a 32 letras minúsculas, números o puntos.')


def validate_timezone(value):
    try:
        ZoneInfo(value)
    except (ValueError, TypeError, ZoneInfoNotFoundError):
        raise ValidationError('Indica una zona horaria válida.')


def validate_restaurant_slug(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', value):
        raise ValidationError('El identificador solo admite minúsculas, números y guiones entre palabras.')
