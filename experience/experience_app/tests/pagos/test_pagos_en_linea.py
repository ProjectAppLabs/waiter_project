"""Validación de notificaciones, estados y credenciales con datos persistidos."""
from dataclasses import replace
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import IntegrityError, OperationalError
from django.utils import timezone

from experience_app.models import CartLine, PaymentAttempt
from experience_app.payments import wompi
from experience_app.services import online_payments as servicio
from experience_app.tests.conftest import ANGUS
from experience_app.tests.views.test_online_payments import (
    attempt as crear_intento, data as datos, endpoint as ruta_pagos, event as evento,
    remote as transaccion, SECRETS as SECRETOS,
)

pytestmark = pytest.mark.django_db
WEBHOOK = '/api/v1/pagos/webhooks/wompi/burger-house/poblado/test/'


def sin_secretos(respuesta, intento=None):
    texto = respuesta.content.decode()
    for secreto in SECRETOS.values():
        assert secreto not in texto
    if intento:
        assert intento.credentials_cipher not in texto
        assert intento.gateway.secrets_cipher not in texto


@pytest.mark.parametrize('cambio', [
    {'amount_in_cents': 1}, {'amount_in_cents': 5105100.0}, {'amount_in_cents': '5105100'},
    {'amount_in_cents': True}, {'currency': 'USD'}, {'payment_method_type': 'NEQUI'},
])
# Falla si un evento con importe, moneda o medio distinto aprueba la cuenta o aplica efectos contables.
def test_evento_con_datos_discordantes_no_modifica_pago(api_client, escenario, cambio):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    with patch.object(wompi, 'read', return_value={**transaccion(intento, 'APPROVED'), **cambio}), \
            patch.object(servicio, 'Client') as cliente:
        respuesta = api_client.post(WEBHOOK, evento(intento), format='json')
    assert respuesta.status_code == 409
    sin_secretos(respuesta, intento)
    intento.refresh_from_db()
    assert (intento.status, intento.reconciled, intento.needs_review) == ('PENDING', False, False)
    cliente.assert_not_called()


@pytest.mark.parametrize('estado', ['DESCONOCIDO', '', None])
# Falla si un estado remoto desconocido se acepta como pago o altera el intento pendiente.
def test_estado_remoto_desconocido_conserva_intento(api_client, escenario, estado):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    with patch.object(wompi, 'read', return_value=transaccion(intento, estado)):
        respuesta = api_client.post(WEBHOOK, evento(intento), format='json')
    assert respuesta.status_code == 503
    sin_secretos(respuesta, intento)
    intento.refresh_from_db()
    assert intento.status == 'PENDING' and not intento.reconciled


@pytest.mark.parametrize('cambio,codigo', [
    ({'event': 'otro.evento'}, 400), ({'data': {}}, 400),
    ({'data': {'transaction': {'reference': 'waiter-invalido'}}}, 400),
    ({'data': {'transaction': {'reference': 7}}}, 200),
    ({'data': {'transaction': {'reference': 'otro-comercio'}}}, 200),
])
# Falla si un evento mal formado o ajeno llega a la pasarela o cambia el estado local.
def test_eventos_no_aplicables_no_consultan_pasarela(api_client, escenario, cambio, codigo):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    with patch.object(wompi, 'read') as leer:
        respuesta = api_client.post(WEBHOOK, {**evento(intento), **cambio}, format='json')
    assert respuesta.status_code == codigo
    leer.assert_not_called()
    intento.refresh_from_db()
    assert intento.status == 'PENDING'


# Falla si una firma inválida provoca consultas remotas o revela credenciales en la respuesta.
def test_firma_invalida_se_rechaza_antes_de_consultar(api_client, escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    cuerpo = evento(intento)
    cuerpo['signature']['checksum'] = '0' * 64
    with patch.object(wompi, 'read') as leer:
        respuesta = api_client.post(WEBHOOK, cuerpo, format='json')
    assert respuesta.status_code == 403
    leer.assert_not_called()
    sin_secretos(respuesta, intento)
    intento.refresh_from_db()
    assert intento.status == 'PENDING'


# Falla si una notificación reemplaza la transacción previamente asociada al pago.
def test_evento_no_reemplaza_identificador_remoto(api_client, escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-original')
    with patch.object(wompi, 'read', return_value=transaccion(intento, 'APPROVED')):
        respuesta = api_client.post(WEBHOOK, evento(intento), format='json')
    assert respuesta.status_code == 409
    intento.refresh_from_db()
    assert (intento.provider_id, intento.status) == ('tx-original', 'PENDING')


# Falla si repetir un webhook aprobado aplica el cobro o cierra la visita más de una vez.
def test_evento_repetido_en_produccion_no_duplica_efectos(api_client, escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123', payment_method_id=2)
    intento.gateway.environment = 'prod'
    intento.gateway.save()
    with patch.object(wompi, 'read', return_value=transaccion(intento, 'APPROVED')) as leer, \
            patch.object(servicio, 'Client') as cliente, patch.object(servicio, 'close_paid') as cerrar:
        cliente.return_value.call_kw.return_value = {'paid': True}
        for _ in range(2):
            respuesta = api_client.post(WEBHOOK.replace('/test/', '/prod/'), evento(intento), format='json')
            assert respuesta.status_code == 200
    assert leer.call_count == 2
    cliente.return_value.call_kw.assert_called_once()
    cerrar.assert_called_once()
    intento.refresh_from_db()
    assert intento.status == 'APPROVED' and intento.reconciled and not intento.needs_review


# Falla si una anulación posterior a la aprobación se ignora o no queda señalada para revisión.
def test_anulacion_posterior_requiere_revision(escenario):
    intento = crear_intento(escenario, status='APPROVED', provider_id='tx-123')
    resultado = servicio.apply_remote(intento, transaccion(intento, 'VOIDED'))
    assert resultado.status == 'VOIDED' and resultado.needs_review
    assert servicio.apply_remote(resultado, transaccion(intento, 'PENDING')).status == 'VOIDED'


# Falla si consultar reiteradamente un pago ignora el intervalo mínimo y vuelve a llamar a Wompi.
def test_consulta_reciente_no_repite_peticion_y_consulta_vencida_si(escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123', checked_at=timezone.now())
    with patch.object(wompi, 'read', return_value=transaccion(intento)) as leer:
        assert servicio.refresh(intento).status == 'PENDING'
        leer.assert_not_called()
        PaymentAttempt.objects.filter(pk=intento.pk).update(checked_at=timezone.now() - timedelta(seconds=5))
        assert servicio.refresh(intento).status == 'PENDING'
        leer.assert_called_once()


@pytest.mark.parametrize('remoto', [{}, {'id': None}, {'id': 123}, {'id': ''}])
# Falla si una creación sin identificador remoto válido se pierde o permite volver a enviar el cobro.
def test_creacion_sin_identificador_conserva_intento_desconocido(api_client, escenario, remoto):
    cuerpo = datos()
    with patch.object(wompi, 'create', return_value=remoto) as crear, patch.object(wompi, 'read') as leer:
        for _ in range(2):
            respuesta = api_client.post(ruta_pagos(escenario[0]), cuerpo, format='json')
            assert respuesta.status_code == 200 and respuesta.json()['status'] == 'UNKNOWN'
            sin_secretos(respuesta)
    crear.assert_called_once()
    leer.assert_not_called()
    assert PaymentAttempt.objects.count() == 1


@pytest.mark.parametrize('caso', ['deshabilitada', 'produccion_bloqueada', 'medio_no_admitido',
    'sesion_ocupada', 'platos_pendientes', 'sin_pedido', 'saldo_pagado', 'tarjeta_otro_ambiente'])
# Falla si se reserva o envía un cobro cuando la cuenta, el medio o la configuración impiden pagar.
def test_condiciones_previas_impiden_crear_cobros(escenario, caso):
    sesion, comensal, _, pedido, pasarela = escenario
    cuerpo = datos()
    if caso == 'deshabilitada':
        pasarela.enabled = False
        pasarela.save()
    elif caso == 'produccion_bloqueada':
        pasarela.environment = 'prod'
        pasarela.save()
    elif caso == 'sesion_ocupada':
        sesion.confirming = True
        sesion.save()
    elif caso == 'platos_pendientes':
        from experience_app.services.sessions import add_line
        add_line(sesion, comensal, ANGUS, qty=1)
        assert sesion.lines.filter(status=CartLine.OPEN).exists()
    elif caso == 'sin_pedido':
        pedido.delete()
    elif caso == 'tarjeta_otro_ambiente':
        cuerpo.update(method='CARD', token='tok_prod_12345678')
    with patch.object(wompi, 'create') as crear:
        if caso == 'medio_no_admitido':
            wompi.merchant.return_value = {'accepted_payment_methods': []}
        if caso == 'saldo_pagado':
            servicio.pos.read_order.return_value = replace(servicio.pos.read_order.return_value, paid=51051)
        from rest_framework.exceptions import ValidationError
        with pytest.raises((servicio.PaymentConflict, ValidationError)):
            servicio.create(sesion, comensal, cuerpo)
    crear.assert_not_called()
    assert not PaymentAttempt.objects.exists()
    sesion.refresh_from_db()
    assert sesion.confirming is (caso == 'sesion_ocupada')


# Falla si una colisión al reservar el intento no devuelve conflicto o deja la sesión bloqueada.
def test_colision_al_reservar_libera_la_sesion(escenario):
    sesion, comensal, *_ = escenario
    with patch.object(PaymentAttempt.objects, 'create', side_effect=IntegrityError('colisión')), \
            patch.object(wompi, 'create') as crear, pytest.raises(servicio.PaymentConflict):
        servicio.create(sesion, comensal, datos())
    sesion.refresh_from_db()
    assert not sesion.confirming
    crear.assert_not_called()


@pytest.mark.parametrize('resultado', [{'paid': False}, OperationalError('sin conexión')])
# Falla si una conciliación fallida se marca pagada o deja de señalarse para revisión.
def test_conciliacion_fallida_de_cuenta_y_reserva_requiere_revision(escenario, crear_anticipo, resultado):
    cuenta = crear_intento(escenario, status='APPROVED', provider_id='tx-123')
    anticipo = crear_anticipo(status='APPROVED', provider_id='tx-reserva')
    cuenta.gateway.environment = 'prod'
    cuenta.gateway.save()
    for intento in (cuenta, anticipo):
        intento.refresh_from_db()
        with patch.object(servicio, 'Client') as cliente:
            if isinstance(resultado, Exception):
                cliente.return_value.call_kw.side_effect = resultado
            else:
                cliente.return_value.call_kw.return_value = resultado
            actualizado = servicio.reconcile(intento)
        assert actualizado.needs_review and not actualizado.reconciled


@pytest.mark.parametrize('cambio', ['comensal', 'medio'])
# Falla si reutilizar el identificador de un intento con otro pagador o medio devuelve el pago existente.
def test_identificador_existente_no_admite_cambiar_pagador_o_medio(escenario, cambio):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    sesion, comensal, otro, *_ = escenario
    cuerpo = {**datos(), 'id': intento.id}
    if cambio == 'comensal':
        comensal = otro
    else:
        cuerpo['method'] = 'NEQUI'
    with patch.object(wompi, 'create') as crear, pytest.raises(servicio.PaymentConflict):
        servicio.create(sesion, comensal, cuerpo)
    crear.assert_not_called()
    assert PaymentAttempt.objects.count() == 1


# Falla si crear un pago real omite validar el saldo contable antes de contactar a Wompi.
def test_produccion_valida_contabilidad_antes_de_crear(escenario, settings):
    sesion, comensal, _, _, pasarela = escenario
    settings.PAYMENTS_LIVE_ENABLED = True
    pasarela.environment = 'prod'
    pasarela.payment_method_id = 2
    pasarela.save()
    with patch.object(servicio, 'Client') as cliente, patch.object(wompi, 'create', return_value={}) as crear:
        def enviar(*argumentos):
            cliente.return_value.call_kw.assert_called_once_with('pos.order', 'waiter_gateway_check', [[77], 2, 5105100])
            return {}
        crear.side_effect = enviar
        intento = servicio.create(sesion, comensal, datos())
    assert intento.status == 'UNKNOWN'
    assert intento.payment_method_id == 2
    crear.assert_called_once()


# Falla si aplicar una consulta remota permite cambiar el identificador de transacción del intento.
def test_consulta_remota_con_otro_identificador_se_rechaza(escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-original')
    with pytest.raises(servicio.PaymentConflict):
        servicio.apply_remote(intento, transaccion(intento, 'APPROVED'))
    intento.refresh_from_db()
    assert intento.status == 'PENDING' and intento.provider_id == 'tx-original'


# Falla si consultar un intento sin identificador remoto contacta a Wompi o pierde su estado desconocido.
def test_consulta_sin_identificador_remoto_no_hace_peticion(escenario):
    intento = crear_intento(escenario, status='UNKNOWN')
    with patch.object(wompi, 'read') as leer:
        resultado = servicio.refresh(intento, force=True)
    assert resultado.pk == intento.pk and resultado.status == 'UNKNOWN'
    leer.assert_not_called()
    intento.refresh_from_db()
    assert intento.checked_at is None
