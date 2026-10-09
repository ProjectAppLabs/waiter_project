"""Métricas agregadas por organización, sin consultas por cliente ni por pedido."""
from datetime import datetime, time
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from django.db.models import Count, F, Max, Q, Sum
from django.db.models.functions import TruncDate

from accounts.models import Account
from sales.models import Order, Refund
from sales.services import period

from .http import json_value, require
from .models import Organization, PlatformSettings, PricingRevision, Restaurant, SubscriptionCharge
from .price_lists import default_pricing
from .subscriptions import OPEN_STATES, local_today, parse_period
from .usage import current_period


def indexed(qs, **aggregates):
    return {row['organization_id']: row for row in qs.values('organization_id').annotate(**aggregates)}


def local_prices(orgs):
    """Lo que cada organización paga por local este mes, con la regla de su cuenta (`price_lists.effective_pricing`).

    Su precio propio, o el heredado de antes de la lista, si lo tiene; si no, la versión de la lista vigente al empezar
    su mes local. Las versiones se leen una sola vez para todas las organizaciones, no una por cliente.
    """
    prices, standard = {}, []
    for org in orgs:
        custom = org.pricing or {'mode': 'personalizado', 'local_monthly': str(org.monthly_price)}
        if custom['mode'] == 'personalizado' and 'local_monthly' in custom:
            prices[org.pk] = Decimal(str(custom['local_monthly']))
        else:
            standard.append(org)
    # El mismo orden que `standard_pricing`: primero la versión más reciente; las que no tienen fecha, al final.
    versions = list(PricingRevision.objects.order_by('-starts', '-pk').values_list('starts', 'pricing')) if standard else []
    rules = None
    for org in standard:
        boundary = datetime.combine(parse_period(current_period(org)), time.min, ZoneInfo(org.timezone))
        pricing = next((p for starts, p in versions if starts is None or starts < boundary), None)
        if pricing is None:
            rules = rules or PlatformSettings.objects.filter(pk=1).first() or PlatformSettings()
            pricing = {**default_pricing(), **rules.pricing}
        prices[org.pk] = Decimal(str(pricing['local_monthly']))
    return prices


def metrics(params, slug=None):
    orgs = list(Organization.objects.filter(**({'slug': slug} if slug else {})).order_by('slug'))
    require(slug is None or orgs, 'No encontramos esta organización.', 'not_found', 404)
    # Incluso una plataforma vacía valida las fechas del cliente.
    period(SimpleNamespace(timezone='America/Bogota'), params.get('from'), params.get('to'))
    ids = [o.pk for o in orgs]
    selection = Q(pk__in=[])
    returned = Q(pk__in=[])
    overdue_selection = Q(pk__in=[])
    for zone in sorted({o.timezone for o in orgs}):
        representative = SimpleNamespace(timezone=zone)
        start, end = period(representative, params.get('from'), params.get('to'))
        selection |= Q(organization__timezone=zone, paid_at__gte=start, paid_at__lt=end)
        # Lo devuelto resta el día en que se devolvió, como en los informes del dueño.
        returned |= Q(organization__timezone=zone, created_at__gte=start, created_at__lt=end)
        overdue_selection |= Q(organization__timezone=zone, due_date__lt=local_today(representative))
    paid = Order.objects.filter(organization_id__in=ids, state='paid').filter(selection)
    refunds = Refund.objects.filter(organization_id__in=ids).filter(returned)
    sales = indexed(paid, sales=Sum(F('total') - F('tip')), orders=Count('pk'))
    refunded = indexed(refunds, amount=Sum(F('total') - F('tip')))
    activity = indexed(Order.objects.filter(organization_id__in=ids), last_order_at=Max('created_at'))
    restaurants = indexed(Restaurant.objects.filter(organization_id__in=ids), count=Count('pk'), active=Count('pk', filter=Q(active=True)))
    accounts = indexed(Account.objects.filter(organization_id__in=ids),
                       active=Count('pk', filter=Q(active=True)), last_login_at=Max('last_login'))
    debts = indexed(SubscriptionCharge.objects.filter(organization_id__in=ids, state__in=OPEN_STATES).filter(overdue_selection), amount=Sum('amount'))
    prices = local_prices(orgs)
    rows = []
    totals = dict(organizations=len(orgs), active=0, trial=0, suspended=0, mrr=Decimal(0), sales=Decimal(0), orders=0, restaurants=0)
    for org in orgs:
        sale = sales.get(org.pk, {})
        # Ventas netas: lo cobrado sin propina menos lo devuelto en el periodo.
        amount = sale.get('sales', Decimal(0)) - refunded.get(org.pk, {}).get('amount', Decimal(0))
        count = sale.get('orders', 0)
        row = dict(slug=org.slug, name=org.name, status=org.status, plan=org.plan, monthly_price=prices[org.pk],
                   restaurants=restaurants.get(org.pk, {}).get('count', 0), restaurants_limit=org.max_restaurants,
                   accounts_active=accounts.get(org.pk, {}).get('active', 0), sales=amount, orders=count,
                   ticket=(amount / count).quantize(Decimal('0.01')) if count else Decimal(0),
                   last_order_at=json_value(activity.get(org.pk, {}).get('last_order_at')),
                   last_login_at=json_value(accounts.get(org.pk, {}).get('last_login_at')),
                   overdue_amount=debts.get(org.pk, {}).get('amount', Decimal(0)))
        rows.append(row)
        totals[org.status] += 1
        if org.status == 'active' or (org.status == 'trial' and org.trial_ends and org.trial_ends >= local_today(org)):
            totals['mrr'] += prices[org.pk] * restaurants.get(org.pk, {}).get('active', 0)
        for field in ('sales', 'orders', 'restaurants'):
            totals[field] += row[field]
    result = {'totals': totals, 'organizations': rows}
    if slug:
        zone = ZoneInfo(orgs[0].timezone)
        daily = {row['date']: row for row in paid.annotate(date=TruncDate('paid_at', tzinfo=zone)).values('date').annotate(
            sales=Sum(F('total') - F('tip')), orders=Count('pk'))}
        for row in refunds.annotate(date=TruncDate('created_at', tzinfo=zone)).values('date').annotate(
                amount=Sum(F('total') - F('tip'))):
            daily.setdefault(row['date'], {'date': row['date'], 'sales': Decimal(0), 'orders': 0})['sales'] -= row['amount']
        result['daily'] = [{**row, 'date': row['date'].isoformat()} for row in sorted(daily.values(), key=lambda r: r['date'])]
        by_restaurant = {r['restaurant_id']: r for r in paid.values('restaurant_id').annotate(
            sales=Sum(F('total') - F('tip')), orders=Count('pk'))}
        refunded_by_restaurant = {r['restaurant_id']: r['amount'] for r in refunds.values('restaurant_id').annotate(
            amount=Sum(F('total') - F('tip')))}
        result['by_restaurant'] = [dict(id=r.pk, name=r.name,
            sales=by_restaurant.get(r.pk, {}).get('sales', Decimal(0)) - refunded_by_restaurant.get(r.pk, Decimal(0)),
            orders=by_restaurant.get(r.pk, {}).get('orders', 0)) for r in Restaurant.objects.filter(organization=orgs[0]).order_by('pk')]
    return result
