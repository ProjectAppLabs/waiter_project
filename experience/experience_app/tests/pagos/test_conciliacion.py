"""Conciliación por comando con persistencia real y pasarela simulada."""
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command, CommandError

from experience_app.models import PaymentAttempt
from experience_app.payments import wompi
from experience_app.payments.crypto import PaymentUnavailable
from experience_app.services import online_payments as servicio
from experience_app.tests.views.test_online_payments import attempt as crear_intento, remote as transaccion, SECRETS as SECRETOS

pytestmark = pytest.mark.django_db


def ejecutar(**opciones):
    salida, errores = StringIO(), StringIO()
    call_command('reconcile_payments', stdout=salida, stderr=errores, **opciones)
    return salida.getvalue(), errores.getvalue()


@pytest.mark.parametrize('estado', ['APPROVED', 'DECLINED', 'PENDING'])
# Falla si conciliar no actualiza el estado remoto o repite la aplicación de un pago aprobado al ejecutar dos veces.
def test_concilia_aprobado_rechazado_y_pendiente_sin_duplicar(escenario, estado):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-123', payment_method_id=2)
    intento.gateway.environment = 'prod'
    intento.gateway.save()
    with patch.object(wompi, 'read', return_value=transaccion(intento, estado)) as leer, \
            patch.object(wompi, 'create') as cobrar, patch.object(servicio, 'Client') as cliente:
        cliente.return_value.call_kw.return_value = {'paid': True}
        salida, errores = ejecutar()
        segunda_salida, segundos_errores = ejecutar()
    intento.refresh_from_db()
    intento.session.refresh_from_db()
    assert intento.status == estado
    assert intento.reconciled is (estado == 'APPROVED')
    assert intento.needs_review is False
    assert (intento.session.state == 'paid') is (estado == 'APPROVED')
    assert str(intento.id) in salida and estado in salida
    assert errores == segundos_errores == ''
    assert bool(segunda_salida) is (estado == 'PENDING')
    assert leer.call_count == (2 if estado == 'PENDING' else 1)
    cobrar.assert_not_called()
    if estado == 'APPROVED':
        cliente.return_value.call_kw.assert_called_once_with('pos.order', 'waiter_gateway_paid',
            [[77], 2, intento.amount_in_cents, intento.reference])
    else:
        cliente.assert_not_called()
    assert PaymentAttempt.objects.count() == 1


# Falla si un error de red borra el intento, filtra secretos o impide continuar con el siguiente pago.
def test_error_de_red_conserva_el_intento_y_continua(escenario, crear_anticipo):
    primero = crear_intento(escenario, status='PENDING', provider_id='tx-123')
    segundo = crear_anticipo(status='PENDING', provider_id='tx-456')
    remoto = {**transaccion(segundo, 'DECLINED'), 'id': 'tx-456'}
    with patch.object(wompi, 'read', side_effect=[PaymentUnavailable(str(SECRETOS)), remoto]) as leer, \
            patch.object(wompi, 'create') as cobrar:
        salida, errores = ejecutar()
    primero.refresh_from_db()
    segundo.refresh_from_db()
    assert primero.status == 'PENDING' and not primero.reconciled
    assert segundo.status == 'DECLINED'
    assert primero.checked_at is not None
    assert str(segundo.id) in salida
    assert errores == f'{primero.id}: no se pudo conciliar; conservado para revisión.\n'
    assert all(secreto not in salida + errores for secreto in SECRETOS.values())
    assert leer.call_count == 2
    cobrar.assert_not_called()


# Falla si se permite asociar una transacción sin indicar el intento de pago.
def test_transaccion_requiere_identificar_el_pago():
    with pytest.raises(CommandError, match='--transaction requiere --payment'):
        ejecutar(transaction='tx-123')


@pytest.mark.parametrize('estado,conciliado,proveedor', [
    ('APPROVED', True, 'tx-123'), ('UNKNOWN', False, ''), ('CREATING', False, ''),
    ('DECLINED', False, 'tx-123'), ('ERROR', False, 'tx-123'), ('VOIDED', False, 'tx-123'),
])
# Falla si el barrido consulta pagos terminados o intentos sin identificador remoto.
def test_barrido_omite_pagos_no_consultables(escenario, estado, conciliado, proveedor):
    crear_intento(escenario, status=estado, reconciled=conciliado, provider_id=proveedor)
    with patch.object(wompi, 'read') as leer:
        assert ejecutar() == ('', '')
    leer.assert_not_called()


# Falla si seleccionar un pago consulta otros intentos o vuelve a aplicar un pago ya conciliado.
def test_seleccion_explicita_consulta_solo_el_pago_indicado(escenario, crear_anticipo):
    intento = crear_intento(escenario, status='APPROVED', reconciled=True, provider_id='tx-123')
    crear_anticipo(status='PENDING', provider_id='tx-456')
    with patch.object(wompi, 'read', return_value=transaccion(intento, 'APPROVED')) as leer, \
            patch.object(servicio, 'Client') as cliente:
        salida, errores = ejecutar(payment=str(intento.id))
    assert str(intento.id) in salida and errores == ''
    leer.assert_called_once()
    cliente.assert_not_called()


@pytest.mark.parametrize('proveedor', ['', 'tx-123'])
# Falla si recuperar un intento no conserva la transacción verificada o repetir la recuperación genera otro cobro.
def test_recupera_transaccion_verificada_de_forma_idempotente(escenario, proveedor):
    intento = crear_intento(escenario, status='UNKNOWN', provider_id=proveedor)
    with patch.object(wompi, 'read', return_value=transaccion(intento)) as leer, patch.object(wompi, 'create') as cobrar:
        for _ in range(2):
            salida, errores = ejecutar(payment=str(intento.id), transaction='tx-123')
            assert str(intento.id) in salida and errores == ''
    intento.refresh_from_db()
    assert (intento.provider_id, intento.status) == ('tx-123', 'PENDING')
    assert leer.call_count == 4
    cobrar.assert_not_called()
    assert PaymentAttempt.objects.count() == 1


@pytest.mark.parametrize('cambio', [{'reference': 'ajena'}, {'currency': 'USD'}, {'amount_in_cents': 1}])
# Falla si se asocia manualmente una transacción de otra referencia, moneda o importe.
def test_recuperacion_rechaza_transacciones_ajenas(escenario, cambio):
    intento = crear_intento(escenario, status='UNKNOWN')
    with patch.object(wompi, 'read', return_value={**transaccion(intento), **cambio}) as leer:
        salida, errores = ejecutar(payment=str(intento.id), transaction='tx-123')
    intento.refresh_from_db()
    assert (intento.provider_id, intento.status) == ('', 'UNKNOWN')
    assert salida == '' and 'no se pudo conciliar' in errores
    leer.assert_called_once()


# Falla si la recuperación permite sustituir una transacción ya asociada.
def test_recuperacion_no_sustituye_transaccion_existente(escenario):
    intento = crear_intento(escenario, status='PENDING', provider_id='tx-original')
    with patch.object(wompi, 'read') as leer:
        salida, errores = ejecutar(payment=str(intento.id), transaction='tx-otra')
    intento.refresh_from_db()
    assert intento.provider_id == 'tx-original'
    assert salida == '' and 'no se pudo conciliar' in errores
    leer.assert_not_called()


# Falla si el barrido supera cien consultas o deja de priorizar los pagos revisados hace más tiempo.
def test_barrido_limita_y_ordena_las_consultas(crear_anticipo):
    from datetime import timedelta
    from django.utils import timezone

    ahora = timezone.now()
    intentos = [crear_anticipo(status='PENDING', provider_id=f'tx-{indice}',
        checked_at=ahora - timedelta(minutes=indice)) for indice in range(101)]
    por_id = {intento.provider_id: intento for intento in intentos}
    def leer_remoto(ambiente, credenciales, identificador):
        return {**transaccion(por_id[identificador]), 'id': identificador}
    with patch.object(wompi, 'read', side_effect=leer_remoto) as leer:
        salida, errores = ejecutar()
    assert errores == '' and len(salida.splitlines()) == 100
    assert [llamada.args[2] for llamada in leer.call_args_list] == [f'tx-{indice}' for indice in range(100, 0, -1)]
    intentos[0].refresh_from_db()
    assert intentos[0].checked_at == ahora
