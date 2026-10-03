"""Lista comercial, versiones por periodo y personalizaciones del cliente."""
from copy import deepcopy
from decimal import Decimal, InvalidOperation
from datetime import datetime, time
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Q

from django.db import transaction

from .http import payload, require
from .modules import MODULES
from .pricing import default_unit_prices


def default_pricing():
    return {'local_monthly': 150000, 'modules': dict.fromkeys(MODULES, 0),
            'unit_prices': default_unit_prices(),
            'whatsapp_plans': [{'key': 'inicial', 'name': 'Inicial', 'monthly_price': 50000,
                                'included': {'pedido_asistente': 100}}],
            'recharge_packs': [{'key': f'pedidos_{n}', 'name': f'{n:,} pedidos'.replace(',', '.'),
                               'module': 'asistente_whatsapp', 'unit': 'pedido_asistente',
                               'quantity': n, 'price': n * 500} for n in (100, 500, 1000)],
            'on_exhausted': 'cobrar'}


def money(value):
    try:
        number = Decimal(str(value))
        valid = type(value) in (int, float, Decimal) and number.is_finite() and 0 <= number < Decimal('1000000000000') and number == number.quantize(Decimal('.01'))
    except (InvalidOperation, ValueError):
        valid = False
    require(valid, 'Indica un precio no negativo con hasta dos decimales.', 'invalid_data', 400)
    return number


def validate_prices(data, *, customer=False):
    allowed = ('mode', 'local_monthly', 'modules', 'unit_prices', 'whatsapp_plan', 'whatsapp', 'recharge_packs', 'on_exhausted') if customer else tuple(default_pricing())
    data = payload(data, allowed, ('mode',) if customer else ())
    if customer:
        require(data['mode'] in ('estandar', 'personalizado'), 'Elige precios estándar o personalizados.', 'invalid_data', 400)
        require(data['mode'] != 'estandar' or set(data) <= {'mode', 'whatsapp_plan'}, 'Los precios estándar no admiten valores personalizados.', 'invalid_data', 400)
        require('whatsapp_plan' not in data or data['whatsapp_plan'] is None or isinstance(data['whatsapp_plan'], str), 'Elige un plan de WhatsApp válido.', 'invalid_data', 400)
    for field in ('local_monthly',):
        if field in data:
            money(data[field])
    for field, keys in [('modules', set(MODULES)), ('unit_prices', {f'{k}.{u}' for k, m in MODULES.items() for u in m['units']})]:
        if field in data:
            require(isinstance(data[field], dict) and set(data[field]) <= keys, 'Revisa los módulos y unidades del catálogo.', 'invalid_data', 400)
            for value in data[field].values():
                money(value)
    if 'on_exhausted' in data:
        require(data['on_exhausted'] in ('cobrar', 'bloquear'), 'Elige cobrar o bloquear al agotar el saldo.', 'invalid_data', 400)
    plans = data.get('whatsapp_plans', [])
    packs = data.get('recharge_packs', [])
    for rows in (plans, packs):
        require(isinstance(rows, list), 'Los planes y paquetes deben ser listas.', 'invalid_data', 400)
        keys = set()
        for row in rows:
            require(isinstance(row, dict) and isinstance(row.get('key'), str) and 0 < len(row['key']) <= 80 and row['key'] not in keys,
                    'Cada plan o paquete necesita una clave única.', 'invalid_data', 400)
            keys.add(row['key'])
            require(isinstance(row.get('name'), str) and 0 < len(row['name']) <= 120, 'Indica un nombre para el plan o paquete.', 'invalid_data', 400)
    for row in plans + ([data['whatsapp']] if 'whatsapp' in data else []):
        custom = row is data.get('whatsapp')
        payload(row, ('monthly_price', 'included') if custom else ('key', 'name', 'monthly_price', 'included'), ('monthly_price', 'included'))
        money(row['monthly_price'])
        require(isinstance(row['included'], dict) and all(u in MODULES['asistente_whatsapp']['units'] and type(q) is int and 0 <= q < 10**12 for u, q in row['included'].items()),
                'Revisa los pedidos incluidos del plan.', 'invalid_data', 400)
    for row in packs:
        payload(row, ('key', 'name', 'module', 'unit', 'quantity', 'price'), ('module', 'unit', 'quantity', 'price'))
        require(isinstance(row['module'], str) and row['module'] in MODULES and isinstance(row['unit'], str) and row['unit'] in MODULES[row['module']]['units'], 'La unidad no pertenece al módulo.', 'invalid_data', 400)
        require(type(row['quantity']) is int and 0 < row['quantity'] < 10**12, 'Indica una cantidad positiva.', 'invalid_data', 400)
        money(row['price'])
    return deepcopy(data)


def standard_pricing(period=None, org=None):
    from .models import PlatformSettings, PricingRevision
    rules = PlatformSettings.objects.filter(pk=1).first() or PlatformSettings()
    result = {**default_pricing(), **deepcopy(rules.pricing), 'unit_prices': rules.unit_prices}
    if period:
        from .subscriptions import parse_period
        boundary = datetime.combine(parse_period(period), time.min, ZoneInfo(org.timezone if org else settings.TIME_ZONE))
        version = PricingRevision.objects.filter(Q(starts__isnull=True) | Q(starts__lt=boundary)).order_by('-starts', '-pk').first()
        if version:
            return deepcopy(version.pricing)
    return result


def effective_pricing(org, period=None):
    from .usage import current_period
    result = standard_pricing(period or current_period(org), org)
    custom = org.pricing or {'mode': 'personalizado', 'local_monthly': str(org.monthly_price)}
    if custom['mode'] == 'personalizado':
        for key in ('local_monthly', 'modules', 'unit_prices', 'recharge_packs', 'on_exhausted'):
            if key in custom:
                result[key] = {**result[key], **custom[key]} if key in ('modules', 'unit_prices') else deepcopy(custom[key])
    selected = custom.get('whatsapp_plan')
    result['whatsapp_plan'] = selected
    if selected and not any(p['key'] == selected for p in result['whatsapp_plans']):
        # Un plan recién creado puede contratarse hoy; sus cambios posteriores esperan al mes siguiente.
        new_plan = next((p for p in standard_pricing()['whatsapp_plans'] if p['key'] == selected), None)
        if new_plan:
            result['whatsapp_plans'].append(new_plan)
    if selected and custom['mode'] == 'personalizado' and 'whatsapp' in custom:
        # La misma forma del catálogo expone el plan efectivo sin agregar campos al contrato.
        existing = next((p for p in result['whatsapp_plans'] if p['key'] == selected), {'key': selected, 'name': selected})
        result['whatsapp_plans'] = [p for p in result['whatsapp_plans'] if p['key'] != selected] + [{**existing, **custom['whatsapp']}]
    result['local_monthly'] = Decimal(str(result['local_monthly']))
    return result


def whatsapp(prices):
    return next((p for p in prices['whatsapp_plans'] if p['key'] == prices.get('whatsapp_plan')), None)


@transaction.atomic
def update_pricing(actor, data):
    from .models import PlatformSettings, PricingRevision
    from .subscriptions import billing_settings
    from .services import audit
    require(actor.role == 'admin')
    data = validate_prices(data)
    billing_settings()
    rules = PlatformSettings.objects.select_for_update().get(pk=1)
    before = standard_pricing()
    if not PricingRevision.objects.exists():
        PricingRevision.objects.create(starts=None, pricing=before)
    after = deepcopy(before)
    for key, value in data.items():
        after[key] = {**after[key], **value} if key in ('modules', 'unit_prices') else value
    rules.pricing, rules.unit_prices = after, after['unit_prices']
    rules.save(update_fields=['pricing', 'unit_prices'])
    PricingRevision.objects.create(pricing=after)
    audit(actor, None, 'pricing.updated', data)
    return after


def customer_pricing(org, data):
    data = validate_prices(data, customer=True)
    if data.get('whatsapp_plan'):
        require(any(p['key'] == data['whatsapp_plan'] for p in standard_pricing()['whatsapp_plans']), 'No encontramos ese plan de WhatsApp.', 'invalid_data', 400)
    org.pricing = data
    org.monthly_price = Decimal(str(effective_pricing(org)['local_monthly']))
