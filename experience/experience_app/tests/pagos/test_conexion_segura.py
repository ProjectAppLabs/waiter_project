"""Conexión con Wompi: cifrado de sobre, entrada con código al correo y verificación de llaves (sin red real)."""
import base64
import hashlib
import json
import os
import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.management import call_command
from django.utils import timezone

from experience_app.models import PaymentAccess, PaymentGateway
from experience_app.payments import wompi
from experience_app.payments.crypto import PaymentUnavailable, decrypt, encrypt, gateway_context, needs_rotation
from experience_app.tests.test_core import admin_client, core  # noqa: F401  (fixture)

pytestmark = pytest.mark.django_db
PATH = '/api/pos/v1/admin/payment_gateways'
KEYS = {'public_key': 'pub_test_AbCdEf123456', 'private_key': 'prv_test_ZyXwVu987654', 'events': 'test_events_Ev3ntS3cr3t',
        'integrity': 'test_integrity_Int3gr1ty9'}
PASTED = f"Llave pública: {KEYS['public_key']}\nLlave privada {KEYS['private_key']}\nEventos\t{KEYS['events']}\n{KEYS['integrity']}"
MERCHANT = {'name': 'Burger House', 'legal_name': 'Burger House S.A.S.', 'presigned_acceptance': {'acceptance_token': 'acc'},
            'presigned_personal_data_auth': {'acceptance_token': 'per'}}


def key():
    return base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=')


@pytest.fixture
# Falla si las pruebas usan la llave maestra del entorno de desarrollo en vez de una propia.
def llaves(settings):
    settings.PAYMENTS_MASTER_KEYS = f'k1:{key()}'
    return settings


def owner_with_access(core, settings):
    org, venue, owner, *_ = core
    owner.email = 'duena@example.invalid'
    owner.save()
    client = admin_client(core)
    assert client.post(PATH, {'action': 'access_request'}, format='json').status_code == 200
    code = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    response = client.post(PATH, {'action': 'access_verify', 'code': code}, format='json')
    assert response.status_code == 200, response.data
    return client, response.data['acceso']


# Falla si el cifrado deja el secreto legible, abre con otro contexto (otra sede o ambiente), acepta un cifrado alterado,
# deja de leer lo guardado con el cifrado anterior o la rotación no pasa todo a la llave maestra vigente.
def test_cifrado_de_sobre_y_rotacion(llaves, core):
    secreto = {'private_key': KEYS['private_key']}
    cifrado = encrypt(secreto, 'pasarela:a/b/wompi/test')
    assert cifrado.startswith('v2.k1.') and KEYS['private_key'] not in cifrado
    assert decrypt(cifrado, 'pasarela:a/b/wompi/test') == secreto
    with pytest.raises(PaymentUnavailable):
        decrypt(cifrado, 'pasarela:otra/b/wompi/test')
    partes = cifrado.split('.')
    alterado = '.'.join(partes[:3] + [partes[3][:-2] + ('AA' if partes[3][-2:] != 'AA' else 'BB')])
    with pytest.raises(PaymentUnavailable):
        decrypt(alterado, 'pasarela:a/b/wompi/test')
    assert encrypt(secreto, 'x') != encrypt(secreto, 'x')
    # Lo guardado con Fernet se sigue leyendo y la rotación lo pasa al sobre con la llave vigente.
    from cryptography.fernet import Fernet
    llaves.PAYMENTS_FERNET_KEY = Fernet.generate_key().decode()
    pasarela = PaymentGateway.objects.create(restaurant_slug='la-casa', venue_slug='centro', public_key=KEYS['public_key'])
    pasarela.secrets_cipher = Fernet(llaves.PAYMENTS_FERNET_KEY.encode()).encrypt(json.dumps(secreto).encode()).decode()
    pasarela.save()
    assert needs_rotation(pasarela.secrets_cipher)
    nueva = key()
    llaves.PAYMENTS_MASTER_KEYS = f'k2:{nueva},k1:{llaves.PAYMENTS_MASTER_KEYS.split(":", 1)[1]}'
    assert needs_rotation(cifrado)
    call_command('rotar_cifrado_pagos')
    pasarela.refresh_from_db()
    assert pasarela.secrets_cipher.startswith('v2.k2.')
    llaves.PAYMENTS_MASTER_KEYS = f'k2:{nueva}'
    assert decrypt(pasarela.secrets_cipher, gateway_context(pasarela)) == secreto


# Falla si el código no llega al correo, se guarda legible, se puede pedir otro de inmediato, admite más de cinco intentos,
# o si el acceso que da no vence o sirve para más de un cambio.
def test_codigo_al_correo_de_un_solo_uso(llaves, core):
    client, acceso = owner_with_access(core, llaves)
    owner = core[2]
    row = PaymentAccess.objects.get(account=owner)
    assert row.code_hash == '' and row.grant_hash and acceso not in row.grant_hash
    assert 'duena@example.invalid' == mail.outbox[0].to[0] and 'vence en 10 minutos' in mail.outbox[0].body
    assert client.post(PATH, {'action': 'access_request'}, format='json').status_code == 429
    assert client.post(PATH, {'action': 'get'}, format='json').status_code == 403
    vista = client.post(PATH, {'action': 'get', 'access': acceso}, format='json')
    assert vista.status_code == 200 and 'public_key' not in vista.data['configurations'][0]
    # Cinco intentos con un código nuevo; el quinto equivocado lo anula.
    PaymentAccess.objects.filter(account=owner).update(code_sent_at=timezone.now() - timedelta(minutes=2))
    client.post(PATH, {'action': 'access_request'}, format='json')
    for intento in range(4):
        respuesta = client.post(PATH, {'action': 'access_verify', 'code': '000000'}, format='json')
        assert respuesta.status_code == 400 and f'Te quedan {4 - intento}' in respuesta.data['message']
    assert 'Pide un código nuevo' in client.post(PATH, {'action': 'access_verify', 'code': '000000'}, format='json').data['message']
    codigo = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    assert client.post(PATH, {'action': 'access_verify', 'code': codigo}, format='json').status_code == 400
    # El acceso vence a los 15 minutos.
    PaymentAccess.objects.filter(account=owner).update(grant_expires=timezone.now() - timedelta(seconds=1))
    assert client.post(PATH, {'action': 'get', 'access': acceso}, format='json').status_code == 403


# Falla si conectar no verifica el comercio, la llave privada y la firma con Wompi, si guarda llaves que fallaron, si
# alguna respuesta devuelve una llave, si el mismo acceso sirve para un segundo cambio o si el aviso de Wompi del pago de
# verificación no confirma (o rechaza) el secreto de eventos.
def test_conectar_wompi_verifica_y_nunca_devuelve_llaves(llaves, core):
    client, acceso = owner_with_access(core, llaves)
    with patch.object(wompi, 'merchant', return_value=MERCHANT), patch.object(wompi, 'probe', return_value=(401, {})):
        fallo = client.post(PATH, {'action': 'connect', 'environment': 'test', 'keys': PASTED, 'access': acceso}, format='json')
    assert fallo.status_code == 200 and fallo.data['ok'] is False and fallo.data['checks']['llave_privada'] == 'fallo'
    assert not PaymentGateway.objects.exists()
    with patch.object(wompi, 'merchant', return_value=MERCHANT), patch.object(wompi, 'probe', return_value=(422, {'error': {'messages': {'signature': ['inválida']}}})):
        firma = client.post(PATH, {'action': 'connect', 'environment': 'test', 'keys': PASTED, 'access': acceso}, format='json')
    assert firma.data['checks']['integridad'] == 'fallo' and not PaymentGateway.objects.exists()
    with patch.object(wompi, 'merchant', return_value=MERCHANT), patch.object(wompi, 'probe', return_value=(201, {'data': {'id': 't1'}})) as probe:
        listo = client.post(PATH, {'action': 'connect', 'environment': 'test', 'keys': PASTED, 'access': acceso, 'enable': True}, format='json')
    assert listo.status_code == 200 and listo.data['ok'], listo.data
    assert listo.data['merchant_name'] == 'Burger House S.A.S.'
    assert listo.data['checks'] == {'comercio': 'ok', 'llave_privada': 'ok', 'integridad': 'ok', 'eventos': 'pendiente'}
    texto = json.dumps(listo.data, ensure_ascii=False)
    assert not any(valor in texto for valor in KEYS.values()) and 'pub_test_…3456' in texto
    enviado = probe.call_args.args[4]
    assert enviado['signature'] == hashlib.sha256(f"{enviado['reference']}150000COP{KEYS['integrity']}".encode()).hexdigest()
    pasarela = PaymentGateway.objects.get()
    assert pasarela.enabled and decrypt(pasarela.secrets_cipher, gateway_context(pasarela)) == {k: KEYS[k] for k in ('private_key', 'events', 'integrity')}
    # El acceso ya se gastó en este cambio.
    assert client.post(PATH, {'action': 'disconnect', 'environment': 'test', 'access': acceso}, format='json').status_code == 403
    # El aviso de Wompi del pago de verificación confirma el secreto de eventos (y uno con otra firma lo rechaza).
    def aviso(secreto):
        datos = {'transaction': {'id': 't1', 'status': 'APPROVED', 'amount_in_cents': 150000, 'reference': pasarela.verify_reference}}
        firma = hashlib.sha256(f't1APPROVED150000{1700000000}{secreto}'.encode()).hexdigest()
        return {'event': 'transaction.updated', 'environment': 'test', 'timestamp': 1700000000, 'data': datos,
                'signature': {'properties': ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], 'checksum': firma}}
    url = '/api/v1/pagos/webhooks/wompi/la-casa/centro/test/'
    assert client.post(url, aviso('otro'), format='json').status_code == 403
    assert PaymentGateway.objects.get().checks['eventos'] == 'fallo'
    assert client.post(url, aviso(KEYS['events']), format='json').status_code == 200
    assert PaymentGateway.objects.get().checks['eventos'] == 'ok'


# Falla si lo pegado no se reconoce en cualquier orden, si llaves de otro ambiente o incompletas pasan sin un mensaje
# claro, o si en producción se intenta cobrar para verificar en vez de solo consultar con la llave privada.
def test_llaves_pegadas_y_produccion(llaves, core):
    from experience_app.services.payment_settings import parse_keys
    from rest_framework.exceptions import ValidationError
    assert parse_keys(PASTED, 'test') == KEYS
    for texto, mensaje in [(PASTED, 'ambiente de pruebas'), (KEYS['public_key'], 'Falta: llave privada'),
                           (PASTED + ' pub_test_OtraLlave99999', 'dos llave públicas')]:
        with pytest.raises(ValidationError) as error:
            parse_keys(texto, 'prod' if mensaje == 'ambiente de pruebas' else 'test')
        assert mensaje in str(error.value.detail['detail'])
    client, acceso = owner_with_access(core, llaves)
    produccion = PASTED.replace('_test_', '_prod_').replace('test_', 'prod_')
    with patch.object(wompi, 'merchant', return_value=MERCHANT), patch.object(wompi, 'probe', return_value=(200, {'data': []})) as probe:
        listo = client.post(PATH, {'action': 'connect', 'environment': 'prod', 'keys': produccion, 'access': acceso}, format='json')
    assert listo.data['ok'] and listo.data['checks'] == {'comercio': 'ok', 'llave_privada': 'ok', 'integridad': 'pendiente', 'eventos': 'pendiente'}
    assert probe.call_args.args[1] == 'GET'
