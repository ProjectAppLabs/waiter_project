"""Respuestas públicas e internas de pagos sin exposición de secretos."""
from unittest.mock import patch

import pytest
from django.db import IntegrityError

from experience_app.models import PaymentGateway
from experience_app.payments import wompi
from experience_app.tests.views.test_online_payments import (
    attempt as crear_intento, data as datos, endpoint as ruta_pagos, remote as transaccion,
    MERCHANT as COMERCIO, SECRETS as SECRETOS,
)

pytestmark = pytest.mark.django_db
CONFIGURACION = '/internal/v1/burger-house/poblado/pasarelas/'
CABECERAS = {'HTTP_X_INTERNAL_KEY': 'internal-test'}


def verificar_secretos(respuesta, pasarela=None):
    texto = respuesta.content.decode()
    assert all(secreto not in texto for secreto in SECRETOS.values())
    if pasarela:
        assert pasarela.secrets_cipher not in texto


@pytest.mark.parametrize('cuerpo', [{}, [], {'environment': 'desconocido'},
    {'environment': 'test', 'private_key': SECRETOS['private_key']}])
# Falla si probar una configuración admite cuerpos inválidos o devuelve secretos aportados por el cliente.
def test_prueba_de_configuracion_rechaza_cuerpo_invalido(api_client, cuerpo):
    with patch.object(wompi, 'merchant') as comercio:
        respuesta = api_client.post(CONFIGURACION, cuerpo, format='json', **CABECERAS)
    assert respuesta.status_code == 400
    comercio.assert_not_called()
    verificar_secretos(respuesta)


# Falla si comprobar la pasarela devuelve datos privados del comercio o pierde la prohibición de caché.
def test_prueba_de_configuracion_solo_expone_resumen(api_client, escenario):
    pasarela = escenario[4]
    with patch.object(wompi, 'merchant', return_value={**COMERCIO, **SECRETOS, 'datos_internos': SECRETOS}) as comercio:
        respuesta = api_client.post(CONFIGURACION, {'environment': 'test'}, format='json', **CABECERAS)
    assert respuesta.status_code == 200
    assert set(respuesta.json()) == {'ok', 'name', 'methods', 'detail'}
    assert respuesta.json()['ok'] is True
    assert respuesta.json()['name'] == COMERCIO['name']
    assert respuesta.json()['methods'] == COMERCIO['accepted_payment_methods']
    assert respuesta['Cache-Control'] == 'no-store'
    verificar_secretos(respuesta, pasarela)
    comercio.assert_called_once_with('test', pasarela.public_key)


# Falla si comprobar una configuración inexistente llama a Wompi en vez de devolver 404.
def test_prueba_de_configuracion_inexistente_no_consulta_pasarela(api_client):
    with patch.object(wompi, 'merchant') as comercio:
        respuesta = api_client.post(CONFIGURACION, {'environment': 'test'}, format='json', **CABECERAS)
    assert respuesta.status_code == 404
    comercio.assert_not_called()


# Falla si una actualización concurrente devuelve el error de base de datos con secretos en vez de un conflicto seguro.
def test_colision_de_configuracion_devuelve_conflicto_seguro(api_client, escenario):
    pasarela = escenario[4]
    anterior = pasarela.secrets_cipher
    with patch('experience_app.views.payment_gateways.payment_settings.save', side_effect=IntegrityError(str(SECRETOS))):
        respuesta = api_client.put(CONFIGURACION, {'environment': 'test'}, format='json', **CABECERAS)
    assert respuesta.status_code == 409
    assert 'Otro administrador' in respuesta.json()['detail']
    verificar_secretos(respuesta, pasarela)
    pasarela.refresh_from_db()
    assert pasarela.secrets_cipher == anterior


@pytest.mark.parametrize('campo', ['public_key', 'private_key', 'integrity', 'events'])
# Falla si se activa una pasarela sin la llave pública o alguno de los tres secretos y quedan cambios parciales.
def test_activacion_sin_credenciales_completas_es_atomica(api_client, campo):
    cuerpo = {'environment': 'test', 'enabled': True, 'public_key': 'pub_test_12345678', **SECRETOS}
    cuerpo.pop(campo)
    respuesta = api_client.put(CONFIGURACION, cuerpo, format='json', **CABECERAS)
    assert respuesta.status_code == 400
    assert 'Completa la llave pública' in respuesta.json()['detail']
    assert not PaymentGateway.objects.exists()
    verificar_secretos(respuesta)


@pytest.mark.parametrize('caso', ['sin_clave_cifrado', 'cifrado_corrupto'])
# Falla si credenciales inaccesibles producen cobros o revelan el cifrado en la respuesta de error.
def test_credenciales_inaccesibles_no_crean_cobros(api_client, escenario, settings, caso):
    pasarela = escenario[4]
    if caso == 'sin_clave_cifrado':
        settings.PAYMENTS_FERNET_KEY = settings.PAYMENTS_MASTER_KEYS = ''
    else:
        pasarela.secrets_cipher = 'cifrado-invalido-sensible'
        pasarela.save()
    with patch.object(wompi, 'create') as crear:
        respuesta = api_client.post(ruta_pagos(escenario[0]), datos(), format='json')
    assert respuesta.status_code == 503
    verificar_secretos(respuesta, pasarela)
    crear.assert_not_called()
    assert not escenario[0].payments.exists()


@pytest.mark.parametrize('medio,extra', [('CARD', {}), ('CARD', {'token': 'tok_test_12345678'}), ('NEQUI', {})])
# Falla si la API permite pagar con tarjeta sin token o datos del navegador, o con Nequi sin celular.
def test_campos_obligatorios_por_medio_impiden_envio(api_client, escenario, medio, extra):
    with patch.object(wompi, 'create') as crear:
        respuesta = api_client.post(ruta_pagos(escenario[0]), {**datos(medio), **extra}, format='json')
    assert respuesta.status_code == 400
    crear.assert_not_called()
    assert not escenario[0].payments.exists()


@pytest.mark.parametrize('cuerpo,ambiente', [([], 'test'), ({}, 'desconocido')])
# Falla si el webhook acepta cuerpos no estructurados o ambientes inexistentes.
def test_webhook_rechaza_formato_y_ambiente_invalidos(api_client, cuerpo, ambiente):
    with patch.object(wompi, 'read') as leer:
        respuesta = api_client.post(f'/api/v1/pagos/webhooks/wompi/burger-house/poblado/{ambiente}/', cuerpo, format='json')
    assert respuesta.status_code == 400
    leer.assert_not_called()


# Falla si contexto, detalle o configuración exponen secretos del comercio, del intento o de las credenciales cifradas.
def test_respuestas_exponen_solo_campos_publicos(api_client, escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    with patch.object(wompi, 'merchant', return_value={**COMERCIO, **SECRETOS}), \
            patch.object(wompi, 'read', return_value={**transaccion(intento), **SECRETOS}):
        contexto = api_client.get(ruta_pagos(escenario[0]))
        detalle = api_client.get(ruta_pagos(escenario[0]) + f'{intento.id}/')
        configuracion = api_client.get(CONFIGURACION, **CABECERAS)
    for respuesta in (contexto, detalle, configuracion):
        assert respuesta.status_code == 200
        assert respuesta['Cache-Control'] == 'no-store'
        verificar_secretos(respuesta, intento.gateway)
        assert intento.credentials_cipher not in respuesta.content.decode()
    assert contexto.json()['public_key'] == intento.gateway.public_key
    assert set(detalle.json()) == {'id', 'reference', 'status', 'method', 'amount_in_cents', 'environment',
        'order_id', 'reconciled', 'needs_review', 'challenge_html', 'card_brand', 'qr_image', 'redirect_url'}
    assert configuracion.json()['configurations'][0]['configured'] == {campo: True for campo in SECRETOS}


# Falla si deshabilitar una pasarela sigue ofreciendo contexto de pago o permite iniciar un cobro.
def test_sin_pasarela_no_se_ofrece_pago(api_client, escenario):
    escenario[4].enabled = False
    escenario[4].save()
    respuesta = api_client.get(ruta_pagos(escenario[0]))
    assert respuesta.status_code == 200
    assert respuesta.json() == {'available': False, 'attempt': None, 'other_payment_pending': False}
    with patch.object(wompi, 'create') as crear:
        assert api_client.post(ruta_pagos(escenario[0]), datos(), format='json').status_code == 409
    crear.assert_not_called()


# Falla si consultar un anticipo no actualiza el estado verificado, permite otro token o filtra las credenciales.
def test_detalle_de_anticipo_actualiza_estado_y_respeta_token(api_client, crear_anticipo):
    intento = crear_anticipo(status='PENDING', provider_id='tx-123')
    ruta = f'/api/v1/burger-house/poblado/reservas/{intento.reservation_token}/pagos/{intento.id}/'
    with patch.object(wompi, 'read', return_value=transaccion(intento)) as leer:
        respuesta = api_client.get(ruta)
        assert respuesta.status_code == 200 and respuesta.json()['status'] == 'PENDING'
        assert respuesta['Cache-Control'] == 'no-store'
        verificar_secretos(respuesta, intento.gateway)
        assert intento.credentials_cipher not in respuesta.content.decode()
        assert api_client.get(ruta.replace(intento.reservation_token, 'otro-token-inexistente')).status_code == 404
        assert api_client.get(ruta, HTTP_ORIGIN='https://ajeno.test').status_code == 403
    leer.assert_called_once()


@pytest.mark.parametrize('ambiente,estado,codigo', [
    ('test', 'APPROVED', 200), ('test', 'PENDING', 400), ('prod', 'APPROVED', 400),
])
# Falla si finalizar una prueba elimina el anticipo o permite dar por terminado un pago pendiente o real.
def test_finalizacion_de_anticipo_solo_admite_prueba_aprobada(api_client, crear_anticipo, ambiente, estado, codigo):
    intento = crear_anticipo(status=estado, provider_id='tx-123')
    intento.gateway.environment = ambiente
    intento.gateway.save()
    ruta = f'/api/v1/burger-house/poblado/reservas/{intento.reservation_token}/pagos/{intento.id}/'
    with patch.object(wompi, 'read') as leer:
        respuesta = api_client.delete(ruta)
    assert respuesta.status_code == codigo
    intento.refresh_from_db()
    assert intento.status == ('TEST_COMPLETED' if codigo == 200 else estado)
    leer.assert_not_called()
