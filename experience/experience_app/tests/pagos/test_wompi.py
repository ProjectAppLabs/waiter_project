"""Contrato HTTP y validación de datos de Wompi sin conexiones externas."""
import hashlib
from unittest.mock import Mock, patch

import pytest
import requests

from experience_app.payments import wompi
from experience_app.payments.crypto import PaymentUnavailable

SECRETO = 'secreto-de-prueba-que-no-debe-salir'


def evento():
    cuerpo = {'data': {'transaction': {'id': 'tx-1', 'status': 'APPROVED', 'amount_in_cents': 12300}},
        'timestamp': 1700000000, 'signature': {'properties': [
            'transaction.id', 'transaction.status', 'transaction.amount_in_cents']}}
    firmar(cuerpo)
    return cuerpo


def firmar(cuerpo):
    valores = []
    for ruta in cuerpo['signature']['properties']:
        valor = cuerpo['data']
        for segmento in ruta.split('.'):
            valor = valor[segmento]
        valores.append(str(valor))
    cuerpo['signature']['checksum'] = hashlib.sha256(
        (''.join(valores) + str(cuerpo['timestamp']) + SECRETO).encode()).hexdigest()


@pytest.mark.parametrize('estado', [200, 201])
@pytest.mark.parametrize('carga', [None, {'reference': 'waiter-prueba'}])
# Falla si la API usa otro método, destino, credencial o límites de espera, o permite redirecciones.
def test_peticion_http_acotada_y_autenticada(estado, carga):
    respuesta = Mock(status_code=estado)
    respuesta.json.return_value = {'data': {'id': 'tx-1'}}
    with patch.object(wompi.requests, 'request', return_value=respuesta) as pedir:
        assert wompi.api('test', '/transactions', SECRETO, carga) == {'id': 'tx-1'}
    pedir.assert_called_once_with('POST' if carga is not None else 'GET',
        'https://sandbox.wompi.co/v1/transactions', headers={'Authorization': f'Bearer {SECRETO}'},
        json=carga, timeout=(4, 12), allow_redirects=False)


@pytest.mark.parametrize('estado,cuerpo', [
    (302, {'data': {'secreto': SECRETO}}), (401, {'error': SECRETO}), (500, {'error': SECRETO}),
    (200, {}), (200, None), (200, {'data': []}), (200, {'data': SECRETO}),
])
# Falla si se acepta una respuesta HTTP inválida o se propagan sus datos sensibles al error público.
def test_respuestas_invalidas_se_traducen_a_error_seguro(estado, cuerpo):
    respuesta = Mock(status_code=estado)
    respuesta.json.return_value = cuerpo
    with patch.object(wompi.requests, 'request', return_value=respuesta), pytest.raises(PaymentUnavailable) as error:
        wompi.api('test', '/transactions', SECRETO)
    assert error.value.status_code == 503
    assert SECRETO not in str(error.value)


@pytest.mark.parametrize('fallo', [requests.Timeout(SECRETO), requests.ConnectionError(SECRETO), ValueError(SECRETO)])
# Falla si un fallo de transporte o JSON se reintenta o filtra el mensaje del proveedor.
def test_errores_de_red_y_json_no_se_reintentan_ni_exponen(fallo):
    respuesta = Mock(status_code=200)
    respuesta.json.side_effect = fallo if isinstance(fallo, ValueError) else None
    with patch.object(wompi.requests, 'request', return_value=respuesta,
            side_effect=None if isinstance(fallo, ValueError) else fallo) as pedir:
        with pytest.raises(PaymentUnavailable) as error:
            wompi.api('test', '/transactions', SECRETO)
    pedir.assert_called_once()
    assert SECRETO not in str(error.value)


# Falla si consultar un comercio pierde la cabecera pública o añade autorización privada a esa petición.
def test_comercio_usa_solo_la_cabecera_publica():
    respuesta = Mock(status_code=200)
    respuesta.json.return_value = {'data': {'name': 'Restaurante'}}
    with patch.object(wompi.requests, 'request', return_value=respuesta) as pedir:
        assert wompi.merchant('prod', 'pub_prod_prueba') == {'name': 'Restaurante'}
    assert pedir.call_args.args == ('GET', 'https://production.wompi.co/v1/merchants/info')
    assert pedir.call_args.kwargs['headers'] == {'x-merchant-public-key': 'pub_prod_prueba'}


@pytest.mark.parametrize('identificador', ['', '../secrets', 'tx?clave=1', 'x' * 101, 'tx/otro'])
# Falla si un identificador manipulado alcanza la API y altera la ruta de consulta.
def test_identificadores_invalidos_no_hacen_peticion(identificador):
    with patch.object(wompi, 'api') as api, pytest.raises(PaymentUnavailable):
        wompi.read('test', {'private_key': SECRETO}, identificador)
    api.assert_not_called()


# Falla si leer una transacción pierde el identificador validado o la credencial privada.
def test_lectura_utiliza_la_credencial_privada():
    with patch.object(wompi, 'api', return_value={'id': 'tx_123-abc'}) as api:
        assert wompi.read('prod', {'private_key': SECRETO}, 'tx_123-abc') == {'id': 'tx_123-abc'}
    api.assert_called_once_with('prod', '/transactions/tx_123-abc', SECRETO)


@pytest.mark.parametrize('alteracion', [
    'sin_firma', 'sin_datos', 'sin_suma', 'suma_invalida', 'suma_no_texto', 'suma_ajena',
    'propiedades_no_lista', 'propiedades_vacias', 'demasiadas_propiedades', 'falta_importe',
    'fecha_texto', 'fecha_booleana', 'ruta_inexistente', 'ruta_no_texto', 'valor_compuesto', 'valor_booleano',
])
# Falla si se valida un evento incompleto, manipulado o con campos firmados de tipos no permitidos.
def test_firmas_invalidas_se_rechazan(alteracion):
    cuerpo = evento()
    firma = cuerpo['signature']
    if alteracion == 'sin_firma': cuerpo.pop('signature')
    elif alteracion == 'sin_datos': cuerpo.pop('data')
    elif alteracion == 'sin_suma': firma.pop('checksum')
    elif alteracion == 'suma_invalida': firma['checksum'] = 'g' * 64
    elif alteracion == 'suma_no_texto': firma['checksum'] = 123
    elif alteracion == 'suma_ajena': firma['checksum'] = '0' * 64
    elif alteracion == 'propiedades_no_lista': firma['properties'] = 'transaction.id'
    elif alteracion == 'propiedades_vacias': firma['properties'] = []
    elif alteracion == 'demasiadas_propiedades': firma['properties'] *= 11
    elif alteracion == 'falta_importe': firma['properties'].remove('transaction.amount_in_cents')
    elif alteracion == 'fecha_texto': cuerpo['timestamp'] = '1700000000'
    elif alteracion == 'fecha_booleana': cuerpo['timestamp'] = True
    elif alteracion == 'ruta_inexistente': firma['properties'].append('transaction.ausente')
    elif alteracion == 'ruta_no_texto': firma['properties'].append(7)
    elif alteracion == 'valor_compuesto': cuerpo['data']['transaction']['status'] = {'estado': 'APPROVED'}
    elif alteracion == 'valor_booleano': cuerpo['data']['transaction']['amount_in_cents'] = True
    assert wompi.verified_event(cuerpo, SECRETO) is False


# Falla si una firma válida depende de un orden fijo o no admite la suma hexadecimal en mayúsculas.
def test_firma_valida_respeta_el_orden_de_propiedades_del_evento():
    cuerpo = evento()
    cuerpo['signature']['properties'].reverse()
    cuerpo['data']['transaction']['currency'] = 'COP'
    cuerpo['signature']['properties'].append('transaction.currency')
    firmar(cuerpo)
    cuerpo['signature']['checksum'] = cuerpo['signature']['checksum'].upper()
    assert wompi.verified_event(cuerpo, SECRETO) is True
    assert wompi.verified_event(cuerpo, 'secreto-ajeno') is False


@pytest.mark.parametrize('qr', [None, '<svg/>', 'a' * 250001], ids=['nulo', 'html', 'demasiado_largo'])
# Falla si los datos del QR aceptan contenido fuera de base64 o exceden el tamaño permitido.
def test_qr_invalido_se_descarta(qr):
    assert wompi.safe_extras({'payment_method': {'extra': {'qr_image': qr}}}) == ('', '')


@pytest.mark.parametrize('url', ['http://banco.test', 'https://usuario:clave@banco.test',
    'https:///sin-dominio', 'https://[invalido', 'https://banco.test/' + 'a' * 2048,
    123],
    ids=['http', 'credenciales', 'sin_dominio', 'mal_formada', 'demasiado_larga', 'numero'])
# Falla si el enlace bancario permite credenciales, HTTP, rutas mal formadas, longitud excesiva o algo que no sea texto
# (antes un número rompía con AttributeError).
def test_redireccion_insegura_se_descarta(url):
    assert wompi.safe_extras({'payment_method': {'extra': {'async_payment_url': url}}}) == ('', '')


@pytest.mark.parametrize('contenido', [None, 'a' * 200001], ids=['nulo', 'demasiado_largo'])
# Falla si el desafío 3DS conserva contenido inválido o una marca de tarjeta desconocida.
def test_desafio_invalido_y_marca_desconocida_se_descartan(contenido):
    assert wompi.challenge({'payment_method': {'extra': {'brand': 'DESCONOCIDA',
        'three_ds_auth': {'three_ds_method_data': contenido}}}}) == ('', '')
