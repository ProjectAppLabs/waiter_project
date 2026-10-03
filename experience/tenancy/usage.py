"""Medición idempotente independiente del estado comercial del módulo."""
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .http import Problem, require
from .models import UsageRecord
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
    row, created = UsageRecord.objects.get_or_create(organization=org, key=key, defaults={
        'restaurant': restaurant, 'module': module, 'unit': unit, 'quantity': quantity,
        'period': current_period(org), 'detail': detail or {}})
    require(created or (row.restaurant_id == (restaurant.pk if restaurant else None) and row.module == module and row.unit == unit and row.quantity == quantity),
            'La clave de uso ya corresponde a otro consumo.', 'usage_key_conflict', 409)
    return row


def usage_summary(org, period=None):
    from .subscriptions import parse_period
    period = current_period(org) if period is None else period
    parse_period(period)
    records = UsageRecord.objects.filter(organization=org, period=period)
    rows = [{'module': r['module'], 'module_name': MODULES[r['module']]['name'], 'unit': r['unit'],
             'unit_name': MODULES[r['module']]['units'][r['unit']], 'quantity': float(r['quantity']),
             'restaurant_id': r['restaurant_id'], 'restaurant_name': r['restaurant__name']}
            for r in records.values('module', 'unit', 'restaurant_id', 'restaurant__name').annotate(quantity=Sum('quantity')).order_by('module', 'unit', 'restaurant_id')]
    totals = list(records.values('module', 'unit').annotate(quantity=Sum('quantity')).order_by('module', 'unit'))
    for row in totals:
        row['quantity'] = float(row['quantity'])
    return {'period': period, 'rows': rows, 'totals': totals}


def record_location_usage(org_slug, venue_slug, module, unit, quantity=1, *, key, detail=None):
    from .models import Restaurant
    local = Restaurant.objects.select_related('organization').filter(organization__slug=org_slug, slug=venue_slug).first()
    require(local, 'No encontramos el local para registrar el consumo.', 'not_found', 404)
    return record_usage(local.organization, local, module, unit, quantity, key=key, detail=detail)
