"""Medición y asignación de cupos idempotentes por organización."""
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .http import Problem, require
from .models import Organization, UsageRecord
from .modules import MODULES


def current_period(org):
    return timezone.now().astimezone(ZoneInfo(org.timezone)).strftime('%Y-%m')


@transaction.atomic
def record_usage(org, restaurant, module, unit, quantity=1, *, key, detail=None):
    require(isinstance(module, str) and module in MODULES and isinstance(unit, str) and unit in MODULES[module]['units'],
            'La unidad de uso no pertenece al módulo.', 'invalid_data', 400)
    require(restaurant is None or restaurant.organization_id == org.pk, 'El local no pertenece a esta organización.', 'not_found', 404)
    require(isinstance(key, str) and 0 < len(key) <= 200, 'Indica una clave de uso válida.', 'invalid_data', 400)
    require(detail is None or isinstance(detail, dict), 'El detalle debe ser un objeto.', 'invalid_data', 400)
    try:
        quantity = Decimal(str(quantity))
        require(quantity.is_finite() and 0 <= quantity < Decimal('100000000000000') and quantity == quantity.quantize(Decimal('.000001')),
                'Indica una cantidad no negativa con hasta seis decimales.', 'invalid_data', 400)
    except (InvalidOperation, ValueError):
        raise Problem('invalid_data', 'Indica una cantidad de uso válida.') from None
    org = Organization.objects.select_for_update().get(pk=org.pk)
    row, created = UsageRecord.objects.get_or_create(organization=org, key=key, defaults={
        'restaurant': restaurant, 'module': module, 'unit': unit, 'quantity': quantity,
        'period': current_period(org), 'detail': detail or {}})
    require(created or (row.restaurant_id == (restaurant.pk if restaurant else None) and row.module == module and row.unit == unit and row.quantity == quantity),
            'La clave de uso ya corresponde a otro consumo.', 'usage_key_conflict', 409)
    if created:
        allocate_usage(org, restaurant, row)
    return row


def usage_summary(org, period=None):
    from .subscriptions import parse_period
    period = current_period(org) if period is None else period
    parse_period(period)
    records = UsageRecord.objects.filter(organization=org, period=period)
    rows = [{'module': r['module'], 'module_name': MODULES[r['module']]['name'], 'unit': r['unit'],
             'unit_name': MODULES[r['module']]['units'][r['unit']], 'quantity': r['quantity'],
             'restaurant_id': r['restaurant_id'], 'restaurant_name': r['restaurant__name']}
            for r in records.values('module', 'unit', 'restaurant_id', 'restaurant__name').annotate(quantity=Sum('quantity')).order_by('module', 'unit', 'restaurant_id')]
    totals = list(records.values('module', 'unit').annotate(quantity=Sum('quantity')).order_by('module', 'unit'))
    return {'period': period, 'rows': rows, 'totals': totals}


def record_location_usage(org_slug, venue_slug, module, unit, quantity=1, *, key, detail=None):
    from .models import Restaurant
    local = Restaurant.objects.select_related('organization').filter(organization__slug=org_slug, slug=venue_slug).first()
    require(local, 'No encontramos el local para registrar el consumo.', 'not_found', 404)
    return record_usage(local.organization, local, module, unit, quantity, key=key, detail=detail)


def quota(org, restaurant, module, unit, prices):
    """Una excepción local tiene su propia bolsa; la de organización se comparte."""
    from .modules import resolved_modules
    from .price_lists import whatsapp
    row = next(r for r in resolved_modules(org, restaurant) if r['key'] == module)
    if unit in row['limits']:
        scope = f'local:{restaurant.pk}' if row['source'] == 'restaurant' else 'organizacion'
        return Decimal(row['limits'][unit]), scope
    plan = whatsapp(prices) if module == 'asistente_whatsapp' else None
    return Decimal(plan['included'].get(unit, 0)) if plan else Decimal(0), 'organizacion'


def allocate_usage(org, restaurant, row):
    from .models import CreditMovement
    from .price_lists import effective_pricing
    prices = effective_pricing(org, row.period)
    included, scope = quota(org, restaurant, row.module, row.unit, prices)
    used = UsageRecord.objects.filter(organization=org, period=row.period, module=row.module, unit=row.unit,
                                     quota_scope=scope).aggregate(total=Sum('included_used'))['total'] or Decimal(0)
    remaining = max(Decimal(0), included - used)
    from_included = min(row.quantity, remaining)
    needed = row.quantity - from_included
    lots = list(CreditMovement.objects.select_for_update().filter(organization=org, module=row.module, unit=row.unit,
                                                                 remaining__gt=0).order_by('at', 'pk'))
    credit = sum((lot.remaining for lot in lots), Decimal(0))
    require(prices['on_exhausted'] == 'cobrar' or needed <= credit,
            'Agotaste el cupo y el saldo disponible. Recarga para continuar.', 'quota_exhausted', 402)
    for lot in lots:
        take = min(needed, lot.remaining)
        if take <= 0:
            break
        lot.remaining -= take
        lot.save(update_fields=['remaining'])
        CreditMovement.objects.create(organization=org, module=row.module, unit=row.unit, kind='consumo',
                                      quantity=-take, usage=row, source=lot, reference=row.key)
        needed -= take
    spent = row.quantity - from_included - needed
    result = {'allowed': True, 'source': 'excedente' if needed else 'recarga' if spent else 'incluido',
              'remaining_included': str(max(Decimal(0), remaining - from_included)), 'credits': str(credit - spent)}
    row.allocation, row.overage, row.quota_scope, row.included_used = result, needed, scope, from_included
    row.unit_price = Decimal(str(prices['unit_prices'].get(f'{row.module}.{row.unit}', 0)))
    row.save(update_fields=['allocation', 'overage', 'quota_scope', 'included_used', 'unit_price'])


def consume(org, restaurant, module, unit, quantity=1, *, key):
    row = record_usage(org, restaurant, module, unit, quantity, key=key)
    return {**row.allocation, 'remaining_included': Decimal(row.allocation['remaining_included']),
            'credits': Decimal(row.allocation['credits'])}


def quotas_summary(org, period):
    from .credits import balances
    from .price_lists import effective_pricing
    prices = effective_pricing(org, period)
    credits = {(r['module'], r['unit']): r['balance'] for r in balances(org)}
    result = []
    for module, spec in MODULES.items():
        for unit, name in spec['units'].items():
            included, scope = quota(org, None, module, unit, prices)
            for local in org.restaurants.filter(active=True):
                local_included, local_scope = quota(org, local, module, unit, prices)
                if local_scope != scope:
                    included += local_included
            records = UsageRecord.objects.filter(organization=org, period=period, module=module, unit=unit)
            sums = records.aggregate(used=Sum('quantity'), overage=Sum('overage'))
            result.append({'module': module, 'module_name': spec['name'], 'unit': unit, 'unit_name': name,
                           'included': included, 'used': sums['used'] or Decimal(0), 'credits': credits.get((module, unit), Decimal(0)),
                           'overage': sums['overage'] or Decimal(0), 'on_exhausted': prices['on_exhausted']})
    return result
