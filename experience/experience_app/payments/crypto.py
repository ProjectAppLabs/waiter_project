"""Cifrado de las credenciales de pago.

v2 (actual): cifrado de sobre con AES-256-GCM. Cada valor lleva su propia llave de datos aleatoria; esa llave va cifrada
con la llave maestra del servidor (`PAYMENTS_MASTER_KEYS`, nunca en la base de datos). El contexto (por ejemplo, la sede
y el ambiente de la pasarela) va autenticado: un cifrado copiado a otra sede no abre. Las llaves maestras tienen un
identificador para rotarlas sin perder lo guardado (`rotar_cifrado_pagos`).

v1 (anterior): Fernet con `PAYMENTS_FERNET_KEY`. Se sigue leyendo y se reemplaza al volver a guardar o al rotar.
"""
import base64
import json
import os
import re

from cryptography.exceptions import InvalidTag
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from rest_framework.exceptions import APIException

KID = re.compile(r'[A-Za-z0-9]{1,16}')


class PaymentUnavailable(APIException):
    status_code = 503
    default_detail = 'No pudimos contactar el servicio de pagos. Conservamos tu operación; consulta su estado antes de volver a pagar.'


def _b64(data):
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def _unb64(text):
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def master_keys():
    """{id: llave de 32 bytes}, la primera es la vigente. Sin `PAYMENTS_MASTER_KEYS` (desarrollo), se deriva una de la
    llave Fernet anterior para no dejar el cifrado sin llave."""
    keys = {}
    for item in filter(None, (part.strip() for part in settings.PAYMENTS_MASTER_KEYS.split(','))):
        kid, _, encoded = item.partition(':')
        try:
            key = _unb64(encoded)
        except ValueError:
            key = b''
        if not KID.fullmatch(kid) or len(key) != 32:
            raise PaymentUnavailable('La llave maestra de pagos del servidor no es válida.')
        keys[kid] = key
    if not keys and settings.PAYMENTS_FERNET_KEY:
        keys['f0'] = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b'waiter-pagos-v2').derive(settings.PAYMENTS_FERNET_KEY.encode())
    if not keys:
        raise PaymentUnavailable('Falta configurar el cifrado de credenciales de pago en el servidor.')
    return keys


def current_kid():
    return next(iter(master_keys()))


def encrypt(value, context=''):
    kid, master = next(iter(master_keys().items()))
    data_key = AESGCM.generate_key(bit_length=256)
    wrap_nonce, nonce = os.urandom(12), os.urandom(12)
    wrapped = AESGCM(master).encrypt(wrap_nonce, data_key, f'waiter-llave:{kid}'.encode())
    body = AESGCM(data_key).encrypt(nonce, json.dumps(value).encode(), f'waiter-pagos:{context}'.encode())
    return f'v2.{kid}.{_b64(wrap_nonce + wrapped)}.{_b64(nonce + body)}'


def decrypt(value, context=''):
    if not value:
        return {}
    if value.startswith('v2.'):
        try:
            _, kid, wrapped, body = value.split('.')
            master = master_keys()[kid]
            raw_wrapped, raw_body = _unb64(wrapped), _unb64(body)
            data_key = AESGCM(master).decrypt(raw_wrapped[:12], raw_wrapped[12:], f'waiter-llave:{kid}'.encode())
            return json.loads(AESGCM(data_key).decrypt(raw_body[:12], raw_body[12:], f'waiter-pagos:{context}'.encode()))
        except (ValueError, KeyError, InvalidTag):
            raise PaymentUnavailable('No se pudieron abrir las credenciales de pago.') from None
    try:
        return json.loads(Fernet(settings.PAYMENTS_FERNET_KEY.encode()).decrypt(value.encode()))
    except (InvalidToken, ValueError, TypeError):
        raise PaymentUnavailable('No se pudieron abrir las credenciales de pago.') from None


def needs_rotation(value):
    """Si el valor está en el formato anterior o con una llave maestra que ya no es la vigente."""
    return bool(value) and not value.startswith(f'v2.{current_kid()}.')


def gateway_context(gateway):
    """El contexto que ata las credenciales a su sede, proveedor y ambiente."""
    return f'pasarela:{gateway.restaurant_slug}/{gateway.venue_slug}/{gateway.provider}/{gateway.environment}'
