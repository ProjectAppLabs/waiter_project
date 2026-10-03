"""Precios por unidad y estimación común a la plataforma y al dueño."""
from datetime import datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

from .http import model_dict
from .modules import MODULES

LINE_FIELDS = ('concept', 'module', 'unit', 'quantity', 'unit_price', 'total')


def default_unit_prices():
    return {'asistente_menu.mensaje_ia': 0, 'asistente_whatsapp.pedido_asistente': 500}


MONTHS = ('enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre')


def previous_period(period):
    year, month = (int(part) for part in period.split('-'))
    return f'{year - 1}-12' if month == 1 else f'{year}-{month - 1:02d}'


def consumption(org, period=None, *, billing=False):
    """La mensualidad del periodo (por local activo) y el uso.

    Para el dueño (`billing=False`) el uso es el del mismo mes: lo que lleva. En la cuenta (`billing=True`) el uso es el
    del mes anterior, ya cerrado: la cuenta se genera al empezar el mes (cron del día 1) y un cobro emitido no se reabre,
    así que cobrar el uso del mismo mes dejaría sin cobrar casi todo. La mensualidad va por adelantado; el uso, vencido.
    """
    from .subscriptions import billing_settings, parse_period
    from .usage import current_period, usage_summary
    period = current_period(org) if period is None else period
    parse_period(period)
    usage_period = previous_period(period) if billing else period
    summary = usage_summary(org, usage_period)
    first = parse_period(period)
    # Hasta definir prorrateo, se factura el local activo al generar, siempre que exista en el periodo.
    from .http import require
    require(first.year < 9999 or first.month < 12, 'El periodo está fuera del calendario admitido.', 'invalid_data', 400)
    following = first.replace(year=first.year + 1, month=1) if first.month == 12 else first.replace(month=first.month + 1)
    end = datetime.combine(following, time.min, tzinfo=ZoneInfo(org.timezone))
    locals_ = list(org.restaurants.filter(active=True, created_at__lt=end).order_by('id'))
    lines = []
    for local in locals_:
        if org.monthly_price > 0:
            lines.append({'concept': f'Mensualidad · {local.name}', 'module': 'nucleo', 'unit': 'local',
                          'quantity': Decimal(1), 'unit_price': org.monthly_price, 'total': org.monthly_price})
    prices = billing_settings().unit_prices
    for row in summary['totals']:
        price = Decimal(str(prices.get(f"{row['module']}.{row['unit']}", 0)))
        quantity = Decimal(str(row['quantity']))
        total = (price * quantity).quantize(Decimal('.01'))
        if total > 0:
            month = MONTHS[int(usage_period[5:]) - 1]
            lines.append({'concept': f"{MODULES[row['module']]['name']} · {MODULES[row['module']]['units'][row['unit']]}" + (f' (uso de {month})' if billing else ''),
                          'module': row['module'], 'unit': row['unit'], 'quantity': quantity, 'unit_price': price, 'total': total})
    return {'period': period, 'currency': 'COP', 'locals_active': len(locals_),
            'price_per_local': org.monthly_price, 'lines': lines,
            'estimated_total': sum((line['total'] for line in lines), Decimal(0)), 'usage': summary['rows']}


def charge_lines(charge):
    return [model_dict(line, LINE_FIELDS) for line in charge.lines.all()]
