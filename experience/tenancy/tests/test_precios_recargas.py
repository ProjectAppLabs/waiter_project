"""Contrato X: precios, asignación de cupos, recargas y conciliación diaria."""
from importlib import import_module

import pytest
from django.apps import apps
from freezegun import freeze_time

from tenancy.credits import balances, grant_credit, request_recharge
from tenancy.http import Problem
from tenancy.models import CreditMovement, PlatformAudit, SubscriptionCharge, UsageRecord
from tenancy.modules import modules_response, set_module
from tenancy.price_lists import effective_pricing, standard_pricing, update_pricing
from tenancy.pricing import consumption
from tenancy.services import update_organization
from tenancy.subscriptions import change_charge, generate_charges, enforce_subscriptions
from tenancy.usage import consume
from .helpers import account, organization, platform_client, platform_user, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/platform/v1/'
UNIDAD = ('asistente_whatsapp', 'pedido_asistente')


def cliente_con_plan(**extra):
    return organization(status='active', pricing={'mode': 'personalizado', 'local_monthly': 0,
        'whatsapp_plan': 'inicial', **extra})


def cortesia(org, admin, cantidad):
    return grant_credit(admin, org, {'module': UNIDAD[0], 'unit': UNIDAD[1], 'quantity': cantidad, 'reason': 'Prueba comercial'})


# Falla si la lista omite valores iniciales o billing y pricing guardan precios diferentes.
@freeze_time('2026-10-03T12:00:00Z')
def test_lista_inicial_y_sincronizacion_bidireccional():
    admin = platform_user()
    client = platform_client(admin)
    prices = client.get(BASE + 'settings/pricing').json()
    assert prices['local_monthly'] == 150000 and set(prices['modules'].values()) == {0}
    assert prices['whatsapp_plans'] == [{'key': 'inicial', 'name': 'Inicial', 'monthly_price': 50000, 'included': {'pedido_asistente': 100}}]
    assert [p['quantity'] for p in prices['recharge_packs']] == [100, 500, 1000]
    assert client.patch(BASE + 'settings/pricing', {'unit_prices': {'facturacion.documento': 35}}, format='json').status_code == 200
    assert client.get(BASE + 'settings/billing').json()['unit_prices']['facturacion.documento'] == 35
    assert client.patch(BASE + 'settings/billing', {'billing_day': 7, 'unit_prices': {'facturacion.documento': 40}}, format='json').status_code == 200
    assert client.get(BASE + 'settings/pricing').json()['unit_prices']['facturacion.documento'] == 40
    assert client.get(BASE + 'settings/billing').json()['billing_day'] == 7


# Falla si un cambio estándar altera el mes en curso, una cuenta emitida o el precio personalizado.
@freeze_time('2026-10-01T12:00:00Z')
def test_estandar_cambia_el_mes_siguiente_y_personalizado_conserva_acuerdo():
    admin = platform_user()
    standard = organization(status='active', pricing={'mode': 'estandar'})
    custom = organization('especial', status='active', pricing={'mode': 'personalizado', 'local_monthly': 450000})
    restaurant(standard)
    restaurant(custom)
    assert generate_charges() == 2
    with freeze_time('2026-10-15T12:00:00Z'):
        update_pricing(admin, {'local_monthly': 200000})
        assert effective_pricing(standard)['local_monthly'] == 150000
        assert effective_pricing(custom)['local_monthly'] == 450000
        assert generate_charges() == 0
    with freeze_time('2026-11-01T12:00:00Z'):
        assert effective_pricing(standard)['local_monthly'] == 200000
        assert generate_charges() == 2
        assert standard.subscription_charges.get(period='2026-11').amount == 200000
        assert custom.subscription_charges.get(period='2026-11').amount == 450000
    assert standard.subscription_charges.get(period='2026-10').amount == 150000


# Falla si migrar cambia el precio acordado de una organización existente.
def test_migracion_conserva_precio_actual():
    org = organization(monthly_price=450000)
    gratis = organization('gratis', monthly_price=0)
    import_module('tenancy.migrations.0011_conservar_precios_y_abrir_intervalos').conservar_precios(apps, None)
    for item, expected in ((org, 450000), (gratis, 0)):
        item.refresh_from_db()
        assert item.pricing['mode'] == 'personalizado'
        assert effective_pricing(item)['local_monthly'] == expected


# Falla si el alta y la edición no entregan pricing, effective_pricing y monthly_price coherentes.
def test_alta_y_edicion_del_contrato_de_precios():
    client = platform_client(platform_user())
    response = client.post(BASE + 'organizations', {'name': 'Nuevo', 'slug': 'nuevo', 'owner': {'name': 'Dueña', 'email': 'duena@ejemplo.co'}, 'pricing': {'mode': 'estandar'}}, format='json')
    assert response.status_code == 201, response.data
    row = response.json()['organization']
    assert row['pricing'] == {'mode': 'estandar'} and row['monthly_price'] == row['effective_pricing']['local_monthly'] == 150000
    response = client.patch(BASE + 'organizations/nuevo', {'pricing': {'mode': 'personalizado', 'local_monthly': 72000, 'whatsapp_plan': 'inicial', 'whatsapp': {'monthly_price': 30000, 'included': {'pedido_asistente': 120}}}}, format='json')
    assert response.status_code == 200, response.data
    row = response.json()['organization']
    assert row['monthly_price'] == 72000 and row['account_credit'] == 0
    assert row['effective_pricing']['whatsapp_plans'][0]['included'] == {'pedido_asistente': 120}


# Falla si se cobra el precio especial además del mensual estándar del mismo módulo.
@freeze_time('2026-10-01T12:00:00Z')
def test_excepcion_sustituye_precio_mensual_y_cobra_ambito_local():
    org = organization(status='active', pricing={'mode': 'personalizado', 'local_monthly': 0, 'modules': {'inventario': 90000}})
    local = restaurant(org)
    set_module(None, org, 'inventario', True, price=35000)
    lines = consumption(org)['lines']
    assert len(lines) == 1 and lines[0]['total'] == 35000
    set_module(None, org, 'cocina', True, local, price=12000)
    assert consumption(org)['estimated_total'] == 47000
    assert generate_charges() == 1
    assert org.subscription_charges.get().amount == 47000


# Falla si consume no respeta incluido, recargas por antigüedad y excedente, o duplica un reintento.
@freeze_time('2026-10-05T12:00:00Z')
def test_consumo_en_orden_fifo_e_idempotencia_exacta():
    org, admin = cliente_con_plan(), platform_user()
    cortesia(org, admin, 3)
    cortesia(org, admin, 4)
    assert consume(org, None, *UNIDAD, 100, key='Incluido')['source'] == 'incluido'
    assert consume(org, None, *UNIDAD, 4, key='Recarga')['source'] == 'recarga'
    lots = list(CreditMovement.objects.filter(kind='cortesia').order_by('id'))
    assert [lot.remaining for lot in lots] == [0, 3]
    response = consume(org, None, *UNIDAD, 5, key='Excedente')
    assert response == {'allowed': True, 'source': 'excedente', 'remaining_included': 0, 'credits': 0}
    assert consume(org, None, *UNIDAD, 5, key='Excedente') == response
    assert UsageRecord.objects.get(key='Excedente').overage == 2
    consume(org, None, *UNIDAD, key='excedente')
    assert UsageRecord.objects.count() == 4
    with pytest.raises(Problem) as error:
        consume(org, None, *UNIDAD, 6, key='Excedente')
    assert error.value.status == 409


# Falla si bloquear permite sobregirar o consume saldo parcialmente al rechazar una cantidad.
@freeze_time('2026-10-05T12:00:00Z')
def test_bloquear_es_atomico_y_cobrar_liquida_excedente_el_mes_siguiente():
    admin = platform_user()
    org = cliente_con_plan(on_exhausted='bloquear')
    consume(org, None, *UNIDAD, 100, key='cupo')
    cortesia(org, admin, 2)
    with pytest.raises(Problem) as error:
        consume(org, None, *UNIDAD, 3, key='rechazado')
    assert error.value.status == 402 and error.value.body['error'] == 'quota_exhausted'
    assert balances(org)[0]['balance'] == 2 and not UsageRecord.objects.filter(key='rechazado').exists()
    org = update_organization(admin, org, {'pricing': {**org.pricing, 'on_exhausted': 'cobrar'}})
    consume(org, None, *UNIDAD, 5, key='permitido')
    with freeze_time('2026-11-01T12:00:00Z'):
        assert generate_charges() == 1
        charge = org.subscription_charges.get()
        line = charge.lines.get(unit='pedido_asistente')
        assert line.quantity == 3 and line.total == 1500 and 'uso de octubre' in line.concept


# Falla si una recarga aumenta saldo antes del pago, se abona dos veces o una anulada da saldo.
@freeze_time('2026-10-05T12:00:00Z')
def test_recarga_pendiente_pagada_anulada_y_reintento():
    org, admin = cliente_con_plan(), platform_user()
    first = request_recharge(org, {'pack': 'pedidos_100'})
    second = request_recharge(org, {'pack': 'pedidos_100'})
    assert first.kind == second.kind == 'recarga' and not balances(org)
    for _ in range(2):
        change_charge(admin, first.pk, {'method': 'nequi', 'reference': 'AB-1'})
    assert balances(org)[0]['balance'] == 100
    change_charge(admin, second.pk, {'notes': 'Cancelada'}, void=True)
    with pytest.raises(Problem):
        change_charge(admin, second.pk, {'method': 'nequi'})
    assert balances(org)[0]['balance'] == 100
    assert CreditMovement.objects.filter(kind='recarga').count() == 1


# Falla si el cupo sin usar se acumula o si un saldo de recarga vence al cambiar el mes.
@freeze_time('2026-10-05T12:00:00Z')
def test_incluido_se_reinicia_y_recarga_no_vence():
    org, admin = cliente_con_plan(), platform_user()
    cortesia(org, admin, 3)
    consume(org, None, *UNIDAD, 50, key='octubre')
    with freeze_time('2027-01-01T12:00:00Z'):
        result = consume(org, None, *UNIDAD, 102, key='enero')
        assert result['source'] == 'recarga' and result['remaining_included'] == 0 and result['credits'] == 1
    assert UsageRecord.objects.get(key='enero').overage == 0


# Falla si el cupo de organización se duplica entre locales o las excepciones locales comparten su bolsa.
@freeze_time('2026-10-05T12:00:00Z')
def test_cupos_de_excepciones_por_ambito():
    org = organization(pricing={'mode': 'personalizado', 'local_monthly': 0, 'on_exhausted': 'bloquear'})
    first, second = restaurant(org), restaurant(org, 'norte')
    set_module(None, org, 'facturacion', True, limits={'documento': 2})
    assert consume(org, first, 'facturacion', 'documento', key='uno')['remaining_included'] == 1
    assert consume(org, second, 'facturacion', 'documento', key='dos')['remaining_included'] == 0
    with pytest.raises(Problem):
        consume(org, first, 'facturacion', 'documento', key='tres')
    set_module(None, org, 'facturacion', True, first, limits={'documento': 3})
    assert consume(org, first, 'facturacion', 'documento', 3, key='local')['remaining_included'] == 0


# Falla si altas y bajas a mitad de mes alteran la cuenta emitida o no se ajustan por días locales.
@freeze_time('2026-10-01T12:00:00Z')
def test_prorrateo_alta_y_baja_de_local_en_la_cuenta_siguiente():
    org = organization(status='active', monthly_price=31000)
    centro = restaurant(org)
    assert generate_charges() == 1
    with freeze_time('2026-10-20T05:00:00Z'):
        restaurant(org, 'laureles')
    with freeze_time('2026-10-25T04:59:00Z'):
        # En Bogotá todavía es 24: desde ese día deja de cobrarse Centro.
        centro.active = False
        centro.save()
    assert org.subscription_charges.get(period='2026-10').amount == 31000
    with freeze_time('2026-11-01T12:00:00Z'):
        assert generate_charges() == 1
        charge = org.subscription_charges.get(period='2026-11')
        assert sorted(charge.lines.filter(unit='ajuste').values_list('total', flat=True)) == [-8000, 12000]
        assert charge.amount == 35000
        assert generate_charges() == 0


# Falla si apagar todo deja total negativo, pierde el saldo a favor o lo descuenta dos veces.
@freeze_time('2026-10-01T12:00:00Z')
def test_cuenta_negativa_genera_saldo_y_la_siguiente_lo_aplica():
    org = organization(status='active', monthly_price=31000)
    local = restaurant(org)
    generate_charges()
    with freeze_time('2026-10-11T12:00:00Z'):
        local.active = False
        local.save()
    with freeze_time('2026-11-01T12:00:00Z'):
        assert generate_charges() == 1
        charge = org.subscription_charges.get(period='2026-11')
        org.refresh_from_db()
        assert charge.amount == 0 and org.account_credit == 21000
        assert generate_charges() == 0
    with freeze_time('2026-12-01T12:00:00Z'):
        local.active = True
        local.save()
        assert generate_charges() == 1
        charge = org.subscription_charges.get(period='2026-12')
        assert charge.amount == 10000 and charge.lines.get(unit='saldo').total == -21000
        org.refresh_from_db()
        assert org.account_credit == 0 and generate_charges() == 0


# Falla si cambiar precio de un módulo o plan de WhatsApp omite la diferencia diaria.
@freeze_time('2026-10-01T12:00:00Z')
def test_prorrateo_de_modulo_y_plan_whatsapp_con_cupo_completo():
    org = organization(status='active', monthly_price=0)
    admin = platform_user()
    set_module(admin, org, 'inventario', True, price=31000)
    generate_charges()
    with freeze_time('2026-10-20T12:00:00Z'):
        set_module(admin, org, 'inventario', True, price=62000)
        org = update_organization(admin, org, {'pricing': {'mode': 'personalizado', 'local_monthly': 0, 'whatsapp_plan': 'inicial', 'whatsapp': {'monthly_price': 31000, 'included': {'pedido_asistente': 100}}}})
        assert consume(org, None, *UNIDAD, 100, key='cupo-completo')['source'] == 'incluido'
    with freeze_time('2026-11-01T12:00:00Z'):
        generate_charges()
        charge = org.subscription_charges.get(period='2026-11')
        assert list(charge.lines.filter(unit='ajuste').values_list('total', flat=True)) == [12000, 12000]
        assert charge.amount == 117000


# Falla si la vigencia de una excepción o quitarla deja facturado el precio especial para siempre.
@freeze_time('2026-10-01T12:00:00Z')
def test_vencimiento_automatico_de_precio_especial():
    from datetime import datetime, timezone
    org = organization(status='active')
    set_module(None, org, 'inventario', True, price=31000, ends=datetime(2026, 10, 11, 5, tzinfo=timezone.utc))
    generate_charges()
    with freeze_time('2026-11-01T12:00:00Z'):
        generate_charges()
        charge = org.subscription_charges.get(period='2026-11')
        assert charge.amount == 0 and charge.lines.get(unit='ajuste').total == -21000


# Falla si pagos exige Menú aunque WhatsApp esté activo o el catálogo no explica «una de».
def test_pagos_acepta_whatsapp_como_dependencia_alternativa():
    org = organization()
    set_module(None, org, 'asistente_whatsapp', True)
    for key in ('fidelizacion', 'asistente_menu', 'menu_comensal'):
        set_module(None, org, key, False)
    entry = next(r for r in modules_response(org)['catalog'] if r['key'] == 'pagos_en_linea')
    assert entry['depends_any'] == ['menu_comensal', 'asistente_whatsapp']
    with pytest.raises(Problem) as error:
        set_module(None, org, 'asistente_whatsapp', False)
    assert error.value.status == 409 and ' o ' in error.value.body['message']


# Falla si un operador cambia precios o da cortesías, o un dueño ve recargas de otra organización.
def test_permisos_y_aislamiento_de_precios_cortesias_y_recargas():
    org, other = organization(), organization('ajena')
    operator = platform_client(platform_user('operator'))
    assert operator.patch(BASE + 'settings/pricing', {'local_monthly': 1}, format='json').status_code == 403
    assert operator.patch(BASE + f'organizations/{org.slug}', {'pricing': {'mode': 'estandar'}}, format='json').status_code == 403
    assert operator.post(BASE + f'organizations/{org.slug}/credits', {'module': UNIDAD[0], 'unit': UNIDAD[1], 'quantity': 1, 'reason': 'Regalo'}, format='json').status_code == 403
    owner = pos_client(account(org))
    response = owner.post('/api/pos/v1/recharges', {'pack': 'pedidos_100'}, format='json')
    assert response.status_code == 201 and response.json()['charge']['kind'] == 'recarga'
    assert len(owner.get('/api/pos/v1/recharges').json()['recharges']) == 1
    outsider = pos_client(account(other))
    assert outsider.get('/api/pos/v1/recharges').json() == {'recharges': []}
    assert outsider.get(BASE + f'organizations/{org.slug}/credits').status_code == 401
    assert owner.get('/api/pos/v1/consumption').json()['recharge_packs'][0]['key'] == 'pedidos_100'
    cortesia(org, platform_user(username='administrador'), 2)
    assert PlatformAudit.objects.filter(action='credits.granted', organization=org).count() == 1


# Falla si una cuenta de recarga impagada suspende la organización por mora.
@freeze_time('2026-10-01T12:00:00Z')
def test_recarga_pendiente_no_suspende_servicio():
    org = organization(status='active')
    request_recharge(org, {'pack': 'pedidos_100'})
    with freeze_time('2026-12-01T12:00:00Z'):
        enforce_subscriptions()
        org.refresh_from_db()
        assert org.status == 'active'


# Falla si precios inválidos entran como booleanos, decimales excesivos o unidades inventadas.
@pytest.mark.parametrize('data', [
    {'local_monthly': True}, {'local_monthly': -1}, {'local_monthly': 0.001},
    {'modules': {'inventado': 1}}, {'whatsapp_plans': None}, {'recharge_packs': [{}]},
    {'on_exhausted': 'permitir'}, {'whatsapp_plans': [{'key': 'x', 'name': 'X', 'monthly_price': 1, 'included': {'pedido_asistente': -1}}]},
])
# Falla si la lista de precios acepta importes, módulos, planes, paquetes o reglas de agotamiento inválidos.
def test_validacion_de_lista(data):
    client = platform_client(platform_user())
    assert client.patch(BASE + 'settings/pricing', data, format='json').status_code == 400


# Falla si una excepción local se suma al precio general del módulo para el mismo local.
@freeze_time('2026-10-01T12:00:00Z')
def test_precio_local_sustituye_el_precio_general_del_modulo():
    org = organization(status='active', pricing={'mode': 'personalizado', 'local_monthly': 0, 'modules': {'inventario': 90000}})
    local = restaurant(org)
    set_module(None, org, 'inventario', True, local, price=35000)
    assert consumption(org)['estimated_total'] == 35000
    set_module(None, org, 'inventario', True, local, price=0)
    assert consumption(org)['estimated_total'] == 0


# Falla si el mismo mes admite dos mensualidades o impide varias cuentas de recarga en MySQL.
def test_unicidad_mensual_con_columna_generada():
    from django.db import IntegrityError, transaction
    from datetime import date
    org = organization()
    data = {'organization': org, 'period': '2026-10', 'amount': 1, 'due_date': date(2026, 10, 15)}
    SubscriptionCharge.objects.create(**data)
    with pytest.raises(IntegrityError), transaction.atomic():
        SubscriptionCharge.objects.create(**data)
    SubscriptionCharge.objects.create(**data, kind='recarga')
    SubscriptionCharge.objects.create(**data, kind='recarga')
    assert SubscriptionCharge.objects.count() == 3


# Falla si la edición del local no permite desactivar y volver a activar con historial por días.
@freeze_time('2026-10-01T12:00:00Z')
def test_activar_y_desactivar_local_desde_api_conserva_historial():
    org = organization(status='active', monthly_price=31000)
    local = restaurant(org)
    client = pos_client(account(org))
    generate_charges()
    with freeze_time('2026-10-10T12:00:00Z'):
        client = pos_client(account(org, username='duena_dos'))
        assert client.patch(f'/api/pos/v1/restaurants/{local.pk}', {'active': False}, format='json').status_code == 200
        assert not client.get('/api/pos/v1/restaurants').json()['restaurants']
        assert client.patch(f'/api/pos/v1/restaurants/{local.pk}', {'active': True}, format='json').status_code == 200
    with freeze_time('2026-11-01T12:00:00Z'):
        generate_charges()
        assert org.subscription_charges.get(period='2026-11').amount == 31000


# Falla si el precio de uso cambia retroactivamente al modificar la lista en el mes siguiente.
@freeze_time('2026-10-01T12:00:00Z')
def test_excedente_conserva_precio_del_periodo_consumido():
    org = organization(status='active', pricing={'mode': 'estandar'})
    admin = platform_user()
    consume(org, None, *UNIDAD, 2, key='octubre')
    update_pricing(admin, {'unit_prices': {'asistente_whatsapp.pedido_asistente': 700}})
    with freeze_time('2026-11-01T12:00:00Z'):
        consume(org, None, *UNIDAD, key='noviembre')
        generate_charges()
        assert org.subscription_charges.get(period='2026-11').amount == 1000
    with freeze_time('2026-12-01T12:00:00Z'):
        generate_charges()
        assert org.subscription_charges.get(period='2026-12').amount == 700


# Falla si un saldo a favor mayor que la mensualidad desaparece o vuelve a cobrarse por mora.
@freeze_time('2026-10-01T12:00:00Z')
def test_saldo_a_favor_parcial_y_cuentas_cero_sin_mora():
    org = organization(status='active', monthly_price=10000, account_credit=15000)
    restaurant(org)
    generate_charges()
    org.refresh_from_db()
    assert org.account_credit == 5000 and org.subscription_charges.get().amount == 0
    with freeze_time('2026-11-01T12:00:00Z'):
        assert enforce_subscriptions()['suspended'] == 0
        generate_charges()
        assert org.subscription_charges.get(period='2026-11').amount == 5000


# Falla si la cortesía no responde el contrato de movimientos o los paquetes personalizados se ignoran.
def test_contrato_cortesia_y_paquete_personalizado():
    pack = {'key': 'especial', 'name': 'Paquete especial', 'module': 'facturacion', 'unit': 'documento', 'quantity': 12, 'price': 345}
    org = organization(pricing={'mode': 'personalizado', 'local_monthly': 0, 'recharge_packs': [pack]})
    admin = platform_client(platform_user())
    path = BASE + f'organizations/{org.slug}/credits'
    response = admin.post(path, {'module': 'facturacion', 'unit': 'documento', 'quantity': 7, 'reason': 'Bienvenida'}, format='json')
    assert response.status_code == 200
    result = response.json()
    assert result['balances'] == [{'module': 'facturacion', 'unit': 'documento', 'unit_name': 'Documento', 'balance': 7}]
    assert set(result['movements'][0]) == {'id', 'at', 'kind', 'module', 'unit', 'quantity', 'amount', 'reference', 'actor'}
    owner = pos_client(account(org))
    assert owner.get('/api/pos/v1/consumption').json()['recharge_packs'] == [pack]
    charge = owner.post('/api/pos/v1/recharges', {'pack': 'especial'}, format='json').json()['charge']
    assert charge['amount'] == 345
    assert owner.post('/api/pos/v1/recharges', {'pack': 'pedidos_100'}, format='json').status_code == 404


# Falla si la lista cambia antes del mes siguiente en la zona horaria del cliente.
@freeze_time('2026-10-31T18:00:00Z')
def test_vigencia_de_precios_respeta_mes_local():
    org = organization(timezone='Asia/Tokyo', pricing={'mode': 'estandar'})
    update_pricing(platform_user(), {'local_monthly': 200000})
    # En Tokio ya empezó noviembre: ese mes conserva su precio y cambia en diciembre.
    assert effective_pricing(org, '2026-11')['local_monthly'] == 150000
    assert effective_pricing(org, '2026-12')['local_monthly'] == 200000


# Falla si un plan recién creado no puede contratarse con todos sus pedidos incluidos.
@freeze_time('2026-10-15T12:00:00Z')
def test_plan_nuevo_se_puede_contratar_sin_esperar_otro_mes():
    admin = platform_user()
    org = organization(status='active')
    update_pricing(admin, {'whatsapp_plans': [*standard_pricing()['whatsapp_plans'], {'key': 'amplio', 'name': 'Amplio', 'monthly_price': 90000, 'included': {'pedido_asistente': 200}}]})
    org = update_organization(admin, org, {'pricing': {'mode': 'estandar', 'whatsapp_plan': 'amplio'}})
    assert consume(org, None, *UNIDAD, 200, key='nuevo')['source'] == 'incluido'
    assert consumption(org)['estimated_total'] == 90000


# Falla si una organización sin locales pierde el historial de mensualidades de WhatsApp.
@freeze_time('2026-10-01T12:00:00Z')
def test_plan_sin_locales_no_se_devuelve_al_mes_siguiente():
    org = cliente_con_plan()
    assert generate_charges() == 1
    with freeze_time('2026-11-01T12:00:00Z'):
        assert generate_charges() == 1
        assert org.subscription_charges.get(period='2026-11').amount == 50000
        assert not org.subscription_charges.get(period='2026-11').lines.filter(unit='ajuste').exists()


# Falla si la migración devuelve días ya cobrados antes del inicio del nuevo historial.
@freeze_time('2026-10-01T12:00:00Z')
def test_migracion_respeta_adelanto_y_comienza_prorrateo_sin_retroactividad():
    from datetime import date
    from tenancy.models import RecurringPeriod, SubscriptionChargeLine
    org = organization(status='active', monthly_price=31000)
    local = restaurant(org)
    charge = SubscriptionCharge.objects.create(organization=org, period='2026-10', amount=31000, due_date=date(2026, 10, 15))
    SubscriptionChargeLine.objects.create(charge=charge, concept=f'Mensualidad · {local.name}', module='nucleo', unit='local', quantity=1, unit_price=31000, total=31000)
    RecurringPeriod.objects.all().delete()
    with freeze_time('2026-10-10T12:00:00Z'):
        import_module('tenancy.migrations.0011_conservar_precios_y_abrir_intervalos').conservar_precios(apps, None)
    with freeze_time('2026-10-20T12:00:00Z'):
        local.active = False
        local.save()
    with freeze_time('2026-11-01T12:00:00Z'):
        generate_charges()
        adjustment = org.subscription_charges.get(period='2026-11').lines.get(unit='ajuste')
        assert adjustment.total == -12000


# Falla si un cupo o precio especial vencido sigue aplicándose al generar Consumo.
@freeze_time('2026-10-01T12:00:00Z')
def test_consumo_refleja_vencimientos_sin_ejecutar_el_cron():
    from datetime import datetime, timezone
    org = organization(status='active')
    set_module(None, org, 'facturacion', True, price=31000, limits={'documento': 3}, ends=datetime(2026, 10, 11, 5, tzinfo=timezone.utc))
    generate_charges()
    with freeze_time('2026-11-01T12:00:00Z'):
        result = consumption(org)
        assert result['estimated_total'] == 0
        assert next(q for q in result['quotas'] if q['unit'] == 'documento')['included'] == 0
        assert next(line for line in result['lines'] if line['unit'] == 'ajuste')['total'] == -21000


# Falla si anular una mensualidad permite obtener saldo a favor sobre un adelanto anulado.
@freeze_time('2026-10-01T12:00:00Z')
def test_mensualidad_anulada_no_genera_credito_por_prorrateo():
    org = organization(status='active', monthly_price=31000)
    local = restaurant(org)
    generate_charges()
    change_charge(platform_user(), org.subscription_charges.get().pk, {'notes': 'Cortesía del mes'}, void=True)
    with freeze_time('2026-10-11T12:00:00Z'):
        local.active = False
        local.save()
    with freeze_time('2026-11-01T12:00:00Z'):
        assert generate_charges() == 0
        org.refresh_from_db()
        assert org.account_credit == 0


# Falla si el primer cobro posterior a una prueba gratuita vuelve a cobrar los días de prueba como prorrateo.
@freeze_time('2026-10-01T12:00:00Z')
def test_prorrateo_respeta_los_dias_de_prueba():
    from datetime import date
    org = organization(monthly_price=31000, trial_ends=date(2026, 10, 20), status='trial')
    restaurant(org)
    assert generate_charges() == 0
    with freeze_time('2026-11-01T12:00:00Z'):
        assert generate_charges() == 1
        charge = org.subscription_charges.get()
        assert charge.lines.get(unit='ajuste').total == 11000
        assert charge.amount == 42000
