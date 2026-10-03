"""Intervalos de mensualidades y conciliación diaria contra lo adelantado."""
import calendar
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from .modules import MODULES, resolved_modules


def components(org, at=None):
    from .price_lists import effective_pricing, whatsapp
    prices = effective_pricing(org)
    custom = org.pricing if org.pricing.get('mode') == 'personalizado' else {}
    result = {}

    def put(key, module, name, field, fixed=None, plan=None):
        result[key] = {'module': module, 'name': name, 'price': {'field': field}}
        if fixed is not None:
            result[key]['price']['fixed'] = str(fixed)
        if plan:
            result[key]['price']['plan'] = plan

    for local in org.restaurants.filter(active=True):
        fixed = custom.get('local_monthly') if org.pricing else org.monthly_price
        put(f'local:{local.pk}', 'nucleo', local.name, 'local_monthly', fixed)
    # La mensualidad general se cobra una vez por organización. Las excepciones de
    # local sustituyen su ámbito; si todos los locales tienen precio propio, no se
    # agrega además la mensualidad general del mismo módulo.
    from .models import OrganizationModule
    exceptions = {(r.restaurant_id, r.key): r for r in OrganizationModule.objects.filter(organization=org)}
    locals_ = list(org.restaurants.filter(active=True))
    local_rows = {local.pk: resolved_modules(org, local, at=at) for local in locals_}
    for row in resolved_modules(org, at=at):
        key = row['key']
        own = [local for local in locals_ if any(r['key'] == key and r['source'] == 'restaurant' and r['price'] is not None for r in local_rows[local.pk])]
        if row['active'] and (not locals_ or len(own) < len(locals_)):
            exception = exceptions.get((None, key)) if row['source'] == 'organization' else None
            fixed = exception.price if exception and exception.price is not None else custom.get('modules', {}).get(key)
            put(f'modulo:{key}', key, MODULES[key]['name'], 'modules', fixed)
        for local in own:
            resolved = next(r for r in local_rows[local.pk] if r['key'] == key)
            if resolved['active']:
                put(f'modulo:{key}:{local.pk}', key, f"{MODULES[key]['name']} · {local.name}", 'modules', exceptions[(local.pk, key)].price)
    plan = whatsapp(prices)
    if plan:
        put('whatsapp', 'asistente_whatsapp', f"Plan de WhatsApp · {plan['name']}", 'whatsapp',
            custom.get('whatsapp', {}).get('monthly_price'), plan['key'])
        result['whatsapp']['price']['fallback'] = str(plan['monthly_price'])
    return result


def sync_recurring(org, *, at=None):
    """El llamador bloquea la organización; conserva también vencimientos automáticos."""
    from .models import RecurringPeriod
    at = at or timezone.now()
    opened = {r.component: r for r in RecurringPeriod.objects.filter(organization=org, ends__isnull=True)}
    current = components(org, at=at)
    for key, row in opened.items():
        expected = current.get(key)
        if expected != {'module': row.module, 'name': row.name, 'price': row.price}:
            row.ends = at
            row.save(update_fields=['ends'])
    for key, spec in current.items():
        if key not in opened or opened[key].ends:
            RecurringPeriod.objects.create(organization=org, component=key, starts=at, **spec)


def settle_expirations(org, until=None):
    from .models import OrganizationModule, RecurringPeriod
    until = until or timezone.now()
    latest = RecurringPeriod.objects.filter(organization=org).order_by('-starts').first()
    if latest:
        moments = OrganizationModule.objects.filter(organization=org, ends__gt=latest.starts, ends__lte=until).values_list('ends', flat=True)
        for at in sorted(set(moments)):
            sync_recurring(org, at=at)


def rate(spec, prices, module):
    if 'fixed' in spec:
        return Decimal(spec['fixed'])
    field = spec['field']
    if field == 'modules':
        value = prices['modules'].get(module, 0)
    elif field == 'whatsapp':
        value = next((p['monthly_price'] for p in prices['whatsapp_plans'] if p['key'] == spec['plan']), spec.get('fallback', 0))
    else:
        value = prices[field]
    return Decimal(str(value))


def advance(org, period):
    from .price_lists import effective_pricing
    prices = effective_pricing(org, period)
    return {key: {**spec, 'amount': str(rate(spec['price'], prices, spec['module']))} for key, spec in components(org).items()}


def adjustments(org, period):
    from .models import SubscriptionCharge
    from .price_lists import standard_pricing
    from .subscriptions import parse_period
    first = parse_period(period)
    days = calendar.monthrange(first.year, first.month)[1]
    end = first + timedelta(days=days)
    zone = ZoneInfo(org.timezone)
    intervals = list(org.recurring_periods.filter(starts__lt=datetime.combine(end, time.min, zone)).filter(
        Q(ends__isnull=True) | Q(ends__gt=datetime.combine(first, time.min, zone))).order_by('starts', 'pk'))
    previous = SubscriptionCharge.objects.filter(organization=org, period=period, kind='mensualidad').first()
    prepaid = previous.advance if previous else {}
    # Las cuentas anteriores a X no tienen desglose por componente: no se recalculan retroactivamente.
    if previous and (not prepaid or previous.state == 'void'):
        return []
    prices = standard_pricing(period, org)
    daily, labels = {}, {}
    for row in intervals:
        start_day = max(first, row.starts.astimezone(zone).date())
        if org.trial_ends:
            start_day = max(start_day, org.trial_ends + timedelta(days=1))
        end_day = min(end, row.ends.astimezone(zone).date() if row.ends else end)
        labels[row.component] = (row.name, row.module)
        for offset in range(max(0, (end_day - start_day).days)):
            daily.setdefault(row.component, {})[start_day + timedelta(days=offset)] = rate(row.price, prices, row.module)
    lines = []
    for key in sorted(set(daily) | set(prepaid)):
        values = daily.get(key, {})
        paid = Decimal(prepaid.get(key, {}).get('amount', '0'))
        if org.billing_history_starts:
            cutoff = org.billing_history_starts.astimezone(zone).date()
            for offset in range(days):
                day = first + timedelta(days=offset)
                if day < cutoff:
                    values[day] = paid
        actual = sum(values.values(), Decimal(0)) / Decimal(days)
        difference = (actual - paid).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        if not difference:
            continue
        name, module = labels[key] if key in labels else (prepaid[key]['name'], prepaid[key]['module'])
        changed_days = sum(values.get(first + timedelta(days=i), Decimal(0)) != paid for i in range(days))
        lines.append({'concept': f'Ajuste por prorrateo · {name} ({changed_days} de {days} días)',
                      'module': module, 'unit': 'ajuste', 'quantity': Decimal(1),
                      'unit_price': abs(difference), 'total': difference})
    return lines
