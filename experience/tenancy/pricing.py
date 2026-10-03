"""Precios por unidad y estimación común a la plataforma y al dueño."""
from decimal import Decimal

from django.db import transaction

from .http import model_dict
from .modules import MODULES

LINE_FIELDS = ('concept', 'module', 'unit', 'quantity', 'unit_price', 'total')


def default_unit_prices():
    return {'asistente_menu.mensaje_ia': 0, 'asistente_whatsapp.pedido_asistente': 500,
            'facturacion.documento': 0, 'fidelizacion.codigo_verificacion': 0}


MONTHS = ('enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre')


def previous_period(period):
    year, month = (int(part) for part in period.split('-'))
    return f'{year - 1}-12' if month == 1 else f'{year}-{month - 1:02d}'


@transaction.atomic
def consumption(org, period=None, *, billing=False):
    """La mensualidad del periodo (por local activo) y el uso.

    Para el dueño (`billing=False`) el uso es el del mismo mes: lo que lleva. En la cuenta (`billing=True`) el uso es el
    del mes anterior, ya cerrado: la cuenta se genera al empezar el mes (cron del día 1) y un cobro emitido no se reabre,
    así que cobrar el uso del mismo mes dejaría sin cobrar casi todo. La mensualidad va por adelantado; el uso, vencido.
    """
    from .subscriptions import parse_period
    from .usage import current_period, usage_summary, quotas_summary
    from .price_lists import effective_pricing
    from .recurring import advance, adjustments
    from .models import Organization, UsageRecord
    from .recurring import settle_expirations
    org = Organization.objects.select_for_update().get(pk=org.pk)
    settle_expirations(org)
    from django.db.models import Sum
    from .http import require
    period = current_period(org) if period is None else period
    first = parse_period(period)
    require(1 < first.year < 9999, 'El periodo está fuera del calendario admitido.', 'invalid_data', 400)
    usage_period = previous_period(period) if billing else period
    summary = usage_summary(org, usage_period)
    prices = effective_pricing(org, period)
    prepaid = advance(org, period)
    lines = []
    for key, spec in prepaid.items():
        amount = Decimal(spec['amount'])
        if amount:
            lines.append({'concept': f"Mensualidad · {spec['name']}", 'module': spec['module'],
                          'unit': 'local' if key.startswith('local:') else 'mes',
                          'quantity': Decimal(1), 'unit_price': amount, 'total': amount})
    historical_prices = effective_pricing(org, usage_period)['unit_prices']
    records = UsageRecord.objects.filter(organization=org, period=usage_period)
    for row in records.values('module', 'unit', 'unit_price').annotate(billable=Sum('overage'), legacy=Sum('quantity')):
        price = row['unit_price']
        quantity = row['billable']
        if price is None:
            price = Decimal(str(historical_prices.get(f"{row['module']}.{row['unit']}", 0)))
            quantity = row['legacy']
        total = (price * quantity).quantize(Decimal('.01'))
        if total > 0:
            month = MONTHS[int(usage_period[5:]) - 1]
            lines.append({'concept': f"{MODULES[row['module']]['name']} · {MODULES[row['module']]['units'][row['unit']]}" + (f' (uso de {month})' if billing else ''),
                          'module': row['module'], 'unit': row['unit'], 'quantity': quantity, 'unit_price': price, 'total': total})
    lines.extend(adjustments(org, previous_period(period)))
    raw_total = sum((line['total'] for line in lines), Decimal(0))
    applied = min(org.account_credit, max(Decimal(0), raw_total))
    if applied:
        lines.append({'concept': 'Saldo a favor aplicado', 'module': 'nucleo', 'unit': 'saldo', 'quantity': Decimal(1),
                      'unit_price': applied, 'total': -applied})
    result = {'period': period, 'currency': 'COP', 'locals_active': sum(k.startswith('local:') for k in prepaid),
              'price_per_local': Decimal(str(prices['local_monthly'])), 'lines': lines,
              'estimated_total': max(Decimal(0), raw_total - applied), 'usage': summary['rows'],
              'quotas': quotas_summary(org, period), 'recharge_packs': prices['recharge_packs'], 'account_credit': org.account_credit}
    if billing:
        result.update(_advance=prepaid, _credit=org.account_credit - applied + max(Decimal(0), -raw_total))
    return result


def charge_lines(charge):
    return [model_dict(line, LINE_FIELDS) for line in charge.lines.all()]
