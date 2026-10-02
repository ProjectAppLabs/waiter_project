"""Métricas agregadas por organización, sin consultas por cliente ni por pedido."""
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from django.db.models import Count, F, Max, Q, Sum
from django.db.models.functions import TruncDate

from accounts.models import Account
from sales.models import Order
from sales.services import period
from .http import json_value, require
from .models import Organization, Restaurant, SubscriptionCharge
from .subscriptions import OPEN_STATES, local_today


def indexed(qs, **aggregates):
    return {row['organization_id']: row for row in qs.values('organization_id').annotate(**aggregates)}


def metrics(params, slug=None):
    orgs = list(Organization.objects.filter(**({'slug': slug} if slug else {})).order_by('slug'))
    require(slug is None or orgs, 'No encontramos esta organización.', 'not_found', 404)
    # Incluso una plataforma vacía valida las fechas del cliente.
    period(SimpleNamespace(timezone='America/Bogota'), params.get('from'), params.get('to'))
    ids = [o.pk for o in orgs]
    selection = Q(pk__in=[])
    overdue_selection = Q(pk__in=[])
    for zone in sorted({o.timezone for o in orgs}):
        representative = SimpleNamespace(timezone=zone)
        start, end = period(representative, params.get('from'), params.get('to'))
        selection |= Q(organization__timezone=zone, paid_at__gte=start, paid_at__lt=end)
        overdue_selection |= Q(organization__timezone=zone, due_date__lt=local_today(representative))
    paid = Order.objects.filter(organization_id__in=ids, state='paid').filter(selection)
    sales = indexed(paid, sales=Sum(F('total') - F('tip')), orders=Count('pk'))
    activity = indexed(Order.objects.filter(organization_id__in=ids), last_order_at=Max('created_at'))
    restaurants = indexed(Restaurant.objects.filter(organization_id__in=ids), count=Count('pk'))
    accounts = indexed(Account.objects.filter(organization_id__in=ids),
                       active=Count('pk', filter=Q(active=True)), last_login_at=Max('last_login'))
    debts = indexed(SubscriptionCharge.objects.filter(organization_id__in=ids, state__in=OPEN_STATES).filter(overdue_selection), amount=Sum('amount'))
    rows = []
    totals = dict(organizations=len(orgs), active=0, trial=0, suspended=0, mrr=Decimal(0), sales=Decimal(0), orders=0, restaurants=0)
    for org in orgs:
        sale = sales.get(org.pk, {})
        amount, count = sale.get('sales', Decimal(0)), sale.get('orders', 0)
        row = dict(slug=org.slug, name=org.name, status=org.status, plan=org.plan, monthly_price=org.monthly_price,
                   restaurants=restaurants.get(org.pk, {}).get('count', 0), restaurants_limit=org.max_restaurants,
                   accounts_active=accounts.get(org.pk, {}).get('active', 0), sales=amount, orders=count,
                   ticket=(amount / count).quantize(Decimal('0.01')) if count else Decimal(0),
                   last_order_at=json_value(activity.get(org.pk, {}).get('last_order_at')),
                   last_login_at=json_value(accounts.get(org.pk, {}).get('last_login_at')),
                   overdue_amount=debts.get(org.pk, {}).get('amount', Decimal(0)))
        rows.append(row)
        totals[org.status] += 1
        if org.status == 'active' or (org.status == 'trial' and org.trial_ends and org.trial_ends >= local_today(org)):
            totals['mrr'] += org.monthly_price
        for field in ('sales', 'orders', 'restaurants'):
            totals[field] += row[field]
    result = {'totals': totals, 'organizations': rows}
    if slug:
        result['daily'] = [{**row, 'date': row['date'].isoformat()} for row in paid.annotate(
            date=TruncDate('paid_at', tzinfo=ZoneInfo(orgs[0].timezone))).values('date').annotate(
            sales=Sum(F('total') - F('tip')), orders=Count('pk')).order_by('date')]
        by_restaurant = {r['restaurant_id']: r for r in paid.values('restaurant_id').annotate(
            sales=Sum(F('total') - F('tip')), orders=Count('pk'))}
        result['by_restaurant'] = [dict(id=r.pk, name=r.name, sales=by_restaurant.get(r.pk, {}).get('sales', Decimal(0)),
            orders=by_restaurant.get(r.pk, {}).get('orders', 0)) for r in Restaurant.objects.filter(organization=orgs[0]).order_by('pk')]
    return result
