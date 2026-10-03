"""Consumo aislado e idempotente por organización."""
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from freezegun import freeze_time

from tenancy.http import Problem
from tenancy.models import UsageRecord
from tenancy.usage import record_usage, usage_summary
from .helpers import organization, restaurant, account, pos_client, platform_client, platform_user

pytestmark = pytest.mark.django_db


# Falla si un reintento duplica consumo o la colación confunde mayúsculas.
def test_uso_idempotente_y_exacto():
    org = organization()
    local = restaurant(org)
    primero = record_usage(org, local, 'facturacion', 'documento', key='Abc')
    assert record_usage(org, local, 'facturacion', 'documento', key='Abc') == primero
    record_usage(org, local, 'facturacion', 'documento', key='abc')
    assert UsageRecord.objects.count() == 2
    with pytest.raises(Problem):
        record_usage(org, local, 'facturacion', 'documento', 2, key='Abc')


# Falla si el periodo usa UTC o el resumen mezcla organizaciones o locales ajenos.
def test_periodo_local_y_aislamiento():
    org = organization()
    local = restaurant(org)
    ajena = organization('ajena')
    otro = restaurant(ajena)
    with patch('django.utils.timezone.now', return_value=datetime(2026, 11, 1, 2, tzinfo=timezone.utc)):
        record_usage(org, local, 'asistente_whatsapp', 'pedido_asistente', 3, key='pedido')
        record_usage(ajena, otro, 'asistente_whatsapp', 'pedido_asistente', 9, key='pedido')
    resumen = usage_summary(org, '2026-10')
    assert resumen['totals'] == [{'module': 'asistente_whatsapp', 'unit': 'pedido_asistente', 'quantity': 3}]
    assert resumen['rows'][0]['restaurant_id'] == local.pk
    with pytest.raises(Problem):
        record_usage(org, otro, 'facturacion', 'documento', key='ajeno')


# Falla si una cookie del dueño lee el consumo de plataforma o se omite validar el periodo.
def test_api_consumo_plataforma():
    org = organization()
    path = f'/api/platform/v1/organizations/{org.slug}/usage'
    assert pos_client(account(org)).get(path).status_code == 401
    cliente = platform_client(platform_user('operator'))
    assert cliente.get(path + '?period=2026-10').json() == {'period': '2026-10', 'rows': [], 'totals': []}
    assert cliente.get(path + '?period=2026-99').status_code == 400


# Falla si se divide la mensualidad, se cobran locales inactivos o se duplican líneas al reintentar, o si la cuenta del
# mes (generada el día 1) cobra el uso del mes que empieza en vez del mes anterior ya cerrado.
@freeze_time('2026-10-01T12:00:00Z')
def test_mensualidad_por_local_y_uso():
    from tenancy.models import PlatformSettings, SubscriptionCharge
    from tenancy.pricing import consumption
    from tenancy.subscriptions import generate_charges
    org = organization(monthly_price=150000, status='active')
    local = restaurant(org)
    restaurant(org, 'norte')
    restaurant(org, 'inactivo', active=False)
    PlatformSettings.objects.create(unit_prices={'asistente_menu.mensaje_ia': 20, 'asistente_whatsapp.pedido_asistente': 500})
    with freeze_time('2026-09-20T15:00:00Z'):
        record_usage(org, local, 'asistente_menu', 'mensaje_ia', 3, key='chat')
        record_usage(org, local, 'asistente_menu', 'tokens_ia', 100, key='tokens')
        record_usage(org, local, 'asistente_whatsapp', 'pedido_asistente', 2, key='pedidos')
    record_usage(org, local, 'asistente_whatsapp', 'pedido_asistente', 1, key='pedido-octubre')
    # Lo que el dueño lleva en octubre: solo el uso de octubre.
    assert consumption(org)['estimated_total'] == 300500
    estimado = consumption(org, '2026-10', billing=True)
    assert estimado['locals_active'] == 2 and estimado['estimated_total'] == 301060
    assert len(estimado['lines']) == 4
    assert 'uso de septiembre' in estimado['lines'][-1]['concept']
    assert generate_charges() == 1 and generate_charges() == 0
    cobro = SubscriptionCharge.objects.get()
    assert sum(line.total for line in cobro.lines.all()) == cobro.amount == 301060
    org.monthly_price = 1
    org.save()
    local.active = False
    local.save()
    assert generate_charges() == 0
    cobro.refresh_from_db()
    assert cobro.amount == 301060


# Falla si se cobra una organización sin locales ni uso, o se omite el uso del mes anterior con mensualidad cero.
@freeze_time('2026-10-01T12:00:00Z')
def test_cero_y_uso_sin_mensualidad():
    from tenancy.subscriptions import generate_charges
    org = organization(monthly_price=150000, status='active')
    assert generate_charges() == 0
    org.monthly_price = 0
    org.save()
    with freeze_time('2026-09-15T12:00:00Z'):
        record_usage(org, None, 'asistente_whatsapp', 'pedido_asistente', key='pedido')
    assert generate_charges() == 1
    assert org.subscription_charges.get().amount == 500


# Falla si otro rol lee consumo del dueño o la respuesta omite campos acordados.
def test_contrato_consumo_dueno():
    org = organization(monthly_price=150000)
    local = restaurant(org)
    dueño = pos_client(account(org))
    respuesta = dueño.get('/api/pos/v1/consumption').json()
    assert set(respuesta) == {'period', 'currency', 'locals_active', 'price_per_local', 'lines', 'estimated_total', 'usage', 'quotas', 'recharge_packs', 'account_credit'}
    assert respuesta['estimated_total'] == 150000
    assert set(respuesta['lines'][0]) == {'concept', 'module', 'unit', 'quantity', 'unit_price', 'total'}
    encargado = pos_client(account(org, 'admin', 'encargado', restaurants=[local]))
    assert encargado.get('/api/pos/v1/consumption').status_code == 403


# Falla si se aceptan unidades inventadas o precios negativos, infinitos o booleanos.
@pytest.mark.parametrize('precios', [{'inventado.unidad': 5}, {'asistente_menu.mensaje_ia': -1}, {'asistente_menu.mensaje_ia': True}, {'asistente_menu.mensaje_ia': 0.001}])
def test_validacion_precios_unitarios(precios):
    cliente = platform_client(platform_user())
    assert cliente.patch('/api/platform/v1/settings/billing', {'unit_prices': precios}, format='json').status_code == 400
