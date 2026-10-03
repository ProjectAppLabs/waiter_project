"""Emisión medida y continuación de facturas en contingencia."""
from unittest.mock import patch

import pytest

from billing.tests.helpers import configured, emit, paid
from sales.tests.helpers import call
from tenancy.models import UsageRecord
from tenancy.modules import set_module

pytestmark = pytest.mark.django_db


# Falla si el proveedor simulado no mide documentos emitidos o cuenta un reintento dos veces.
def test_documento_emitido_se_mide_una_vez(setup):
    datos = configured(setup)
    pedido = paid(datos)
    documento = emit(datos, pedido)
    call(datos['client'], 'post', f"documents/{documento['id']}/retry")
    fila = UsageRecord.objects.get(module='facturacion')
    assert fila.quantity == 1 and fila.detail['type'] == documento['kind']
    assert fila.restaurant_id == datos['r1'].pk


# Falla si apagar facturación impide terminar un documento en contingencia.
def test_contingencia_termina_tras_apagar_modulo(setup):
    datos = configured(setup)
    pedido = paid(datos)
    with patch('billing.providers.simulated.SimulatedProvider.issue', side_effect=TimeoutError):
        documento = emit(datos, pedido)
    assert documento['state'] == 'contingency'
    assert not UsageRecord.objects.exists()
    set_module(None, datos['org'], 'facturacion', False, datos['r1'])
    resultado = call(datos['client'], 'post', f"documents/{documento['id']}/retry")
    assert resultado['document']['state'] == 'issued'
    assert UsageRecord.objects.get().quantity == 1
