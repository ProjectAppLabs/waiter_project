"""Traslados del salón protegidos por el módulo del local del pedido."""
import pytest

from sales.models import Order
from sales.tests.helpers import open_shift, order
from tables.models import Table
from tenancy.modules import set_module

pytestmark = pytest.mark.django_db


# Falla si trasladar un pedido cambia su mesa cuando Salón está apagado en ese local.
def test_traslado_requiere_salon_del_pedido(setup):
    datos = setup
    open_shift(datos)
    piso = datos['r1'].floors.get()
    primera = Table.objects.create(floor=piso, number=1)
    segunda = Table.objects.create(floor=piso, number=2)
    pedido = order(datos, service='dine_in', table_id=primera.pk)
    set_module(None, datos['org'], 'salon', False, datos['r1'])
    respuesta = datos['client'].patch(f"/api/pos/v1/orders/{pedido['id']}", {'table_id': segunda.pk}, format='json')
    assert respuesta.status_code == 403 and respuesta.json()['module'] == 'salon'
    assert Order.objects.get(pk=pedido['id']).table_id == primera.pk
