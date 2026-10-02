"""Métricas de plataforma con fechas locales y lecturas por lotes."""
from datetime import date, datetime, timezone as tz
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from sales.models import CashShift, Order
from tenancy.metrics import metrics
from tenancy.models import SubscriptionCharge
from .helpers import account, organization, platform_client, platform_user, pos_client, restaurant

pytestmark = pytest.mark.django_db


def sale(org, venue, owner, paid_at, total=108, tip=8, state='paid'):
    shift, _ = CashShift.objects.get_or_create(restaurant=venue, defaults={'opened_by': owner})
    return Order.objects.create(organization=org, restaurant=venue, shift=shift, uuid=uuid4(), service='takeout',
        prefix='TA', tracking=1, number='TA-001', paid_at=paid_at, total=total, tip=tip, state=state)


# Falla si se incluyen propinas, borradores, pagos fuera del día local o se duplican agregados por joins.
def test_metrics_local_dates_activity_and_detail():
    org = organization(status='active', monthly_price=100)
    venue, empty = restaurant(org), restaurant(org, 'vacia')
    owner = account(org, last_login=timezone.now())
    account(org, username='inactivo', active=False)
    other = organization('otra', status='active', timezone='Asia/Tokyo', monthly_price=200)
    venue_b, owner_b = restaurant(other), account(other)
    at = datetime(2026, 10, 2, 3, tzinfo=tz.utc)
    sale(org, venue, owner, at)
    sale(org, venue, owner, at, total=216, tip=16)
    sale(org, venue, owner, at, total=999, state='draft')
    sale(org, venue, owner, datetime(2026, 10, 2, 5, tzinfo=tz.utc), total=999)
    sale(other, venue_b, owner_b, at, total=58)
    SubscriptionCharge.objects.create(organization=org, period='2026-09', amount=77, due_date=date(2026, 9, 15))
    client = platform_client(platform_user())
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 2, 12, tzinfo=tz.utc)):
        result = client.get('/api/platform/v1/metrics?from=2026-10-01&to=2026-10-01').json()
    assert result['totals'] == dict(organizations=2, active=2, trial=0, suspended=0, mrr=300, sales=300, orders=2, restaurants=3)
    row = result['organizations'][0]
    assert row['sales'] == 300 and row['orders'] == 2 and row['ticket'] == 150
    assert row['accounts_active'] == 1 and row['overdue_amount'] == 77
    assert row['last_login_at'] and row['last_order_at'].endswith('Z')
    detail = client.get(f'/api/platform/v1/organizations/{org.slug}/metrics?from=2026-10-01&to=2026-10-01').json()
    assert detail['totals']['organizations'] == 1
    assert detail['daily'] == [{'date': '2026-10-01', 'sales': 300, 'orders': 2}]
    assert detail['by_restaurant'] == [{'id': venue.pk, 'name': venue.name, 'sales': 300, 'orders': 2},
                                      {'id': empty.pk, 'name': empty.name, 'sales': 0, 'orders': 0}]


# Falla si MRR incluye suspendidos, pruebas sin fecha o caducadas en su zona horaria.
def test_mrr_and_empty_metrics():
    assert metrics({})['totals']['mrr'] == 0
    organization('activa', status='active', monthly_price=10)
    organization('prueba', status='trial', monthly_price=20, trial_ends=date(2026, 10, 1))
    organization('vencida', status='trial', monthly_price=30, trial_ends=date(2026, 9, 30))
    organization('suspendida', status='suspended', monthly_price=40)
    organization('sin-fecha', status='trial', monthly_price=50)
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 2, 3, tzinfo=tz.utc)):
        result = metrics({})
    assert result['totals']['mrr'] == 30
    assert result['totals']['trial'] == 3 and result['totals']['suspended'] == 1


# Falla si agregar clientes o zonas provoca una consulta adicional por organización.
def test_metrics_batched_queries():
    organization(status='active')
    with CaptureQueriesContext(connection) as first:
        metrics({})
    for i in range(10):
        org = organization(f'cliente-{i}', status='active', timezone='Asia/Tokyo' if i % 2 else 'America/Bogota')
        restaurant(org)
        account(org)
    with CaptureQueriesContext(connection) as after:
        metrics({})
    assert len(after) == len(first) and len(after) <= 7


# Falla si se admiten sesiones del POS, se omiten operadores o se aceptan fechas inválidas.
@pytest.mark.parametrize('role', ['admin', 'operator'])
def test_metrics_permissions_and_validation(role):
    org = organization()
    client = platform_client(platform_user(role))
    outsider = pos_client(account(org))
    for path in ('metrics', f'organizations/{org.slug}/metrics'):
        assert client.get('/api/platform/v1/' + path).status_code == 200
        assert APIClient().get('/api/platform/v1/' + path).status_code == 401
        assert outsider.get('/api/platform/v1/' + path).status_code == 401
        for query in ('from=2026-02-30', 'from=2026-10-02&to=2026-10-01', 'to=xxx'):
            assert client.get('/api/platform/v1/' + path + '?' + query).status_code == 400
    assert client.get('/api/platform/v1/organizations/ausente/metrics').status_code == 404
