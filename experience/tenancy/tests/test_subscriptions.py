"""Contrato M: cuentas, permisos, avisos, auditoría y reactivación."""
from datetime import date, datetime, timedelta, timezone as tz
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from tenancy.models import Organization, PlatformAudit, PlatformSettings, SubscriptionCharge
from tenancy.services import set_suspension
from tenancy.subscriptions import enforce_subscriptions, generate_charges
from .helpers import account, organization, platform_client, platform_user, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/platform/v1/'


@pytest.fixture
def billing():
    org = organization(status='active', monthly_price=450000)
    restaurant(org)
    owner = account(org)
    admin = platform_user()
    return org, owner, admin, platform_client(admin)


def charge(org, **kwargs):
    values = dict(period='2026-10', amount=450000, due_date=date(2026, 10, 15))
    values.update(kwargs)
    return SubscriptionCharge.objects.create(organization=org, **values)


# Falla si la generación duplica periodos, incluye pruebas vigentes o cambia el precio histórico.
def test_generate_monthly_snapshot_and_exclusions(billing):
    org, owner, admin, client = billing
    organization('gratis', status='active')
    organization('prueba', status='trial', monthly_price=30, trial_ends=date(2026, 10, 31))
    expired = organization('vencida', status='trial', monthly_price=20, trial_ends=date(2026, 9, 30))
    restaurant(expired)
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 1, 12, tzinfo=tz.utc)):
        out = StringIO()
        call_command('generate_subscription_charges', stdout=out)
        call_command('generate_subscription_charges', stdout=out)
        assert SubscriptionCharge.objects.count() == 2
        row = SubscriptionCharge.objects.get(organization=org)
        assert row.due_date == date(2026, 10, 15) and row.amount == 450000
        org.monthly_price = 600000
        org.save()
        generate_charges('2026-10')
        row.refresh_from_db()
        assert row.amount == 450000
        assert PlatformAudit.objects.filter(action='subscription.created', actor=None).count() == 2
        assert SubscriptionCharge.objects.filter(organization=expired).exists()


# Falla si los ajustes no son únicos, aceptan días imposibles o desbordan febrero.
def test_settings_singleton_validation_and_february(billing):
    org, owner, admin, client = billing
    path = BASE + 'settings/billing'
    assert client.get(path).json() == dict(billing_day=5, grace_days=10, suspend_after_days=15, reminder_days=3,
                                         unit_prices={'asistente_menu.mensaje_ia': 0, 'asistente_whatsapp.pedido_asistente': 500})
    for invalid in ({'billing_day': 0}, {'billing_day': 32}, {'grace_days': -1}, {'grace_days': True}, {'reminder_days': 1.2}, {'otro': 1}):
        assert client.patch(path, invalid, format='json').status_code == 400
    assert client.patch(path, {'billing_day': 31, 'grace_days': 2}, format='json').status_code == 200
    row = client.post(BASE + f'organizations/{org.slug}/charges', {'period': '2028-02'}, format='json')
    assert row.status_code == 201 and row.json()['charge']['due_date'] == '2028-03-02'
    with pytest.raises(IntegrityError), transaction.atomic():
        PlatformSettings.objects.create(pk=2)
    assert PlatformAudit.objects.filter(action='billing_settings.updated').count() == 1


# Falla si los roles de plataforma o una cookie del POS autorizan cobros fuera del contrato.
@pytest.mark.parametrize('role', ['admin', 'operator'])
def test_platform_billing_roles(billing, role):
    org, owner, admin, _ = billing
    client = platform_client(platform_user(role, username='otro'))
    row = charge(org)
    assert client.get(BASE + 'charges').status_code == 200
    assert client.get(BASE + f'organizations/{org.slug}/charges').status_code == 200
    expected = 200 if role == 'admin' else 403
    assert client.get(BASE + 'settings/billing').status_code == expected
    assert client.patch(BASE + 'settings/billing', {'billing_day': 8}, format='json').status_code == expected
    assert client.post(BASE + f'organizations/{org.slug}/charges', {'period': '2026-11'}, format='json').status_code == (201 if role == 'admin' else 403)
    assert client.post(BASE + f'charges/{row.pk}/pay', {'method': 'nequi'}, format='json').status_code == 200
    second = charge(org, period='2026-12')
    assert client.post(BASE + f'charges/{second.pk}/void', {'notes': 'Corrección'}, format='json').status_code == expected
    for outsider in (APIClient(), pos_client(owner)):
        assert outsider.get(BASE + 'charges').status_code == 401
        assert outsider.post(BASE + f'charges/{row.pk}/pay', {'method': 'otro'}, format='json').status_code == 401


# Falla si crear o cobrar reintentando duplica auditoría o reescribe un pago cerrado.
def test_manual_charge_and_payment_idempotency(billing):
    org, owner, admin, client = billing
    path = BASE + f'organizations/{org.slug}/charges'
    response = client.post(path, {'period': '2026-10', 'amount': 450000}, format='json')
    row = response.json()['charge']
    assert isinstance(row['amount'], (int, float)) and row['organization']['slug'] == org.slug
    assert client.post(path, {'period': '2026-10'}, format='json').status_code == 200
    assert client.post(path, {'period': '2026-11', 'amount': 1}, format='json').status_code == 400
    pay = BASE + f"charges/{row['id']}/pay"
    body = {'method': 'transferencia', 'reference': 'REC-10', 'notes': 'Conciliado', 'paid_at': '2020-01-02T12:00:00Z'}
    for _ in range(2):
        response = client.post(pay, body, format='json')
        assert response.status_code == 200, response.data
        assert response.json()['charge']['paid_at'] == body['paid_at']
    assert PlatformAudit.objects.filter(action='subscription.paid').count() == 1
    assert client.post(pay, {**body, 'reference': 'otra'}, format='json').status_code == 409
    assert client.post(BASE + f"charges/{row['id']}/void", {'notes': 'No'}, format='json').status_code == 409
    assert client.post(BASE + 'charges/999999/pay', {'method': 'otro'}, format='json').status_code == 404


# Falla si datos malformados causan 500 o fechas sin zona/futuras registran pagos.
@pytest.mark.parametrize('body', [{'method': 'tarjeta'}, {'method': 'nequi', 'paid_at': '2026-01-01'},
    {'method': 'nequi', 'paid_at': '2099-01-01T00:00:00Z'}, {'method': 'nequi', 'paid_at': 3},
    {'method': 'nequi', 'reference': []}, {'method': 'nequi', 'notes': 'a' * 5001}, {'method': ['nequi']}])
def test_invalid_payment(billing, body):
    org, owner, admin, client = billing
    row = charge(org)
    assert client.post(BASE + f'charges/{row.pk}/pay', body, format='json').status_code == 400
    row.refresh_from_db()
    assert row.state == 'pending'


# Falla si periodos inválidos pasan a la base o un filtro devuelve datos sin validar.
@pytest.mark.parametrize('period', ['2026-1', '0000-01', '2026-13', '2026-01-01', None, 202610])
def test_invalid_period(billing, period):
    org, owner, admin, client = billing
    assert client.post(BASE + f'organizations/{org.slug}/charges', {'period': period}, format='json').status_code == 400


# Falla si un aviso se repite, se suspende antes del plazo o la auditoría pierde el actor del sistema.
def test_enforcement_reminders_overdue_and_suspension(billing):
    org, owner, admin, client = billing
    row = charge(org)
    for day, expected_mails, status in [(12, 1, 'active'), (15, 2, 'active'), (16, 2, 'active'), (29, 2, 'active'), (30, 2, 'suspended')]:
        with patch('django.utils.timezone.now', return_value=datetime(2026, 10, day, 12, tzinfo=tz.utc)):
            call_command('enforce_subscriptions', stdout=StringIO())
            enforce_subscriptions()
        org.refresh_from_db()
        row.refresh_from_db()
        assert org.status == status
        assert row.state == ('overdue' if day > 15 else 'pending')
        assert len(mail.outbox) == expected_mails
    assert org.suspended_reason == 'mora' and org.suspension_by_billing
    assert all(m.to == [owner.email] for m in mail.outbox)
    assert PlatformAudit.objects.filter(action='organization.suspended', actor=None).count() == 1
    assert PlatformAudit.objects.filter(action='subscription.reminder').count() == 2


# Falla si un fallo del correo consume el aviso y evita reintentarlo.
def test_mail_failure_retries(billing):
    org, owner, admin, client = billing
    row = charge(org)
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 12, 12, tzinfo=tz.utc)):
        with patch('tenancy.subscriptions.EmailMultiAlternatives.send', side_effect=OSError('Sin correo')):
            assert enforce_subscriptions()['mail_failed'] == 1
        row.refresh_from_db()
        assert row.reminder_sent_at is None
        assert enforce_subscriptions()['reminders'] == 1


# Falla si pagar reactiva una suspensión manual o ignora otra deuda vencida aún pendiente de cron.
@pytest.mark.parametrize('manual', [False, True])
def test_payment_reactivation_only_billing_without_other_debt(billing, manual):
    org, owner, admin, client = billing
    row = charge(org, due_date=date(2020, 1, 1), state='overdue')
    other = charge(org, period='2026-09', due_date=date(2020, 2, 1))
    set_suspension(admin if manual else None, org, True, 'mora')
    assert client.post(BASE + f'charges/{row.pk}/pay', {'method': 'nequi'}, format='json').status_code == 200
    org.refresh_from_db()
    assert org.status == 'suspended'
    assert client.post(BASE + f'charges/{other.pk}/pay', {'method': 'efectivo'}, format='json').status_code == 200
    org.refresh_from_db()
    assert org.status == ('suspended' if manual else 'active')


# Falla si el resumen suma cuentas anuladas, mezcla clientes o usa creación en vez de fecha de pago.
def test_charge_filters_and_summary(billing):
    org, owner, admin, client = billing
    charge(org, amount=10)
    charge(org, period='2026-09', state='overdue', amount=20)
    charge(org, period='2026-08', state='paid', paid_at=timezone.now(), amount=30)
    charge(org, period='2026-07', state='void', amount=40)
    foreign = organization('ajena')
    charge(foreign, amount=99)
    result = client.get(BASE + f'organizations/{org.slug}/charges').json()
    assert result['summary'] == dict(pending=10, overdue=20, paid_this_month=30)
    assert len(result['charges']) == 4
    assert client.get(BASE + 'charges?state=void&period=2026-07').json()['charges'][0]['amount'] == 40
    assert client.get(BASE + 'charges?state=xx').status_code == 400
    assert client.get(BASE + 'charges?period=2026-99').status_code == 400


# Falla si otro rol ve la suscripción o el dueño recibe menos información para calcular la suspensión.
@pytest.mark.parametrize('role', ['owner', 'admin', 'cashier', 'waiter'])
def test_owner_subscription(billing, role):
    org, owner, admin, client = billing
    venue = org.restaurants.get()
    person = account(org, role, username='persona', restaurants=[venue] if role != 'owner' else [])
    for month in range(1, 9):
        charge(org, period=f'2026-{month:02}', due_date=date(2026, 10, 15))
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 20, 12, tzinfo=tz.utc)):
        response = pos_client(person).get('/api/pos/v1/subscription')
    assert response.status_code == (200 if role == 'owner' else 403)
    if role == 'owner':
        body = response.json()
        assert len(body['charges']) == 6 and body['charges'][0]['period'] == '2026-08'
        assert body['overdue'] and body['days_until_suspension'] == 10
        assert body['suspend_on'] == '2026-10-30' and body['overdue'] == 3600000


# Falla si anular permite volver a generar/cobrar la cuenta o el cron avisa y suspende por ella.
def test_void_is_terminal_and_ignored_by_cron(billing):
    org, owner, admin, client = billing
    row = charge(org, due_date=date(2020, 1, 1))
    for _ in range(2):
        result = client.post(BASE + f'charges/{row.pk}/void', {'notes': 'No corresponde'}, format='json')
        assert result.status_code == 200 and result.json()['charge']['state'] == 'void'
    assert generate_charges('2026-10') == 0
    assert enforce_subscriptions()['suspended'] == 0
    org.refresh_from_db()
    assert org.status == 'active'
    assert client.post(BASE + f'charges/{row.pk}/pay', {'method': 'otro'}, format='json').status_code == 409
    assert PlatformAudit.objects.filter(action='subscription.void').count() == 1


# Falla si la cuenta manual cobra a una prueba vigente o a una organización gratuita.
@pytest.mark.parametrize('trial', [True, False])
def test_manual_ineligible_charge(billing, trial):
    org, owner, admin, client = billing
    if trial:
        org.status, org.trial_ends = 'trial', timezone.localdate() + timedelta(days=60)
    else:
        org.monthly_price = 0
    org.save()
    result = client.post(BASE + f'organizations/{org.slug}/charges', {'period': '2026-11'}, format='json')
    assert result.status_code == 409 and result.json()['error'] == 'charge_not_applicable'
    assert not SubscriptionCharge.objects.exists()


# Falla si un cambio de reglas modifica vencimientos ya emitidos o la fecha histórica del pago.
def test_rules_apply_only_to_new_charges(billing):
    org, owner, admin, client = billing
    existing = charge(org)
    client.patch(BASE + 'settings/billing', {'billing_day': 1, 'grace_days': 0}, format='json')
    result = client.post(BASE + f'organizations/{org.slug}/charges', {'period': '2026-11'}, format='json')
    assert result.json()['charge']['due_date'] == '2026-11-01'
    existing.refresh_from_db()
    assert existing.due_date == date(2026, 10, 15)


# Falla si el cron usa la fecha UTC en lugar de la zona de cada cliente al generar o suspender.
def test_cron_organization_timezone(billing):
    org, owner, admin, client = billing
    east = organization('tokio', timezone='Asia/Tokyo', status='active', monthly_price=100)
    restaurant(east)
    with patch('django.utils.timezone.now', return_value=datetime(2026, 11, 1, 3, tzinfo=tz.utc)):
        generate_charges()
    assert SubscriptionCharge.objects.get(organization=org).period == '2026-10'
    assert SubscriptionCharge.objects.get(organization=east).period == '2026-11'
    SubscriptionCharge.objects.update(due_date=date(2026, 10, 15))
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 30, 3, tzinfo=tz.utc)):
        enforce_subscriptions()
    org.refresh_from_db()
    east.refresh_from_db()
    assert org.status == 'active' and east.status == 'suspended'


# Falla si una lectura de cuentas dispara consultas por organización o por quien registró el pago.
def test_charge_list_batched(billing):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext
    org, owner, admin, client = billing
    charge(org, recorded_by=admin)
    with CaptureQueriesContext(connection) as first:
        assert client.get(BASE + 'charges').status_code == 200
    for i in range(8):
        charge(organization(f'cliente-{i}'), recorded_by=admin)
    with CaptureQueriesContext(connection) as after:
        assert client.get(BASE + 'charges').status_code == 200
    assert len(after) == len(first)


# Falla si un error al auditar deja el pago aplicado sin trazabilidad.
def test_payment_and_audit_are_atomic(billing):
    from tenancy.subscriptions import change_charge
    org, owner, admin, client = billing
    row = charge(org)
    with patch('tenancy.subscriptions.audit', side_effect=RuntimeError('Sin auditoría')):
        with pytest.raises(RuntimeError):
            change_charge(admin, row.pk, {'method': 'otro'})
    row.refresh_from_db()
    assert row.state == 'pending' and row.paid_at is None


# Falla si una suspensión manual anterior se cambia a mora por la ejecución diaria del cron.
def test_cron_preserves_manual_suspension(billing):
    org, owner, admin, client = billing
    charge(org, due_date=date(2020, 1, 1))
    set_suspension(admin, org, True, 'Revisión del contrato')
    enforce_subscriptions()
    org.refresh_from_db()
    assert org.suspended_reason == 'Revisión del contrato' and not org.suspension_by_billing
    assert PlatformAudit.objects.filter(action='organization.suspended').count() == 1


# Falla si reintentar una cuenta existente deja de ser idempotente cuando el precio contratado cambia.
def test_manual_retry_preserves_historical_amount(billing):
    org, owner, admin, client = billing
    path = BASE + f'organizations/{org.slug}/charges'
    body = {'period': '2026-10', 'amount': 450000}
    first = client.post(path, body, format='json').json()['charge']
    org.monthly_price = 0
    org.save()
    repeated = client.post(path, body, format='json')
    assert repeated.status_code == 200 and repeated.json()['charge'] == first
    assert SubscriptionCharge.objects.count() == 1
