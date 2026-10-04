"""Cuentas de suscripción, avisos y suspensión; no son documentos fiscales de venta."""
import calendar
import logging
import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from accounts.models import Account
from .http import model_dict, payload, require, save_valid
from .models import Organization, PlatformSettings, SubscriptionCharge
from .services import audit, set_suspension

logger = logging.getLogger(__name__)
RULE_FIELDS = ('billing_day', 'grace_days', 'suspend_after_days', 'reminder_days', 'unit_prices', 'require_2fa')
OPEN_STATES = ('pending', 'overdue')


def local_today(org):
    return timezone.now().astimezone(ZoneInfo(org.timezone)).date()


def billing_settings():
    return PlatformSettings.objects.get_or_create(pk=1)[0]


def parse_period(value):
    require(isinstance(value, str) and re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', value),
            'Indica el periodo con formato YYYY-MM.', 'invalid_data', 400)
    try:
        return date.fromisoformat(value + '-01')
    except ValueError:
        require(False, 'Indica un periodo válido.', 'invalid_data', 400)


def due_date(period, rules):
    first = parse_period(period)
    try:
        return first.replace(day=min(rules.billing_day, calendar.monthrange(first.year, first.month)[1])) + timedelta(days=rules.grace_days)
    except OverflowError:
        require(False, 'El vencimiento está fuera del calendario admitido.', 'invalid_data', 400)


def eligible(org, today):
    return not (org.status == 'trial' and org.trial_ends and org.trial_ends >= today)


def charge_dict(charge):
    row = model_dict(charge, ('id', 'kind', 'period', 'amount', 'due_date', 'state', 'paid_at', 'method', 'reference', 'notes', 'created_at'))
    row['organization'] = {'slug': charge.organization.slug, 'name': charge.organization.name}
    from .pricing import charge_lines
    row['lines'] = charge_lines(charge)
    row['recorded_by'] = {'name': charge.recorded_by.name} if charge.recorded_by else None
    return row


def charges_query():
    return SubscriptionCharge.objects.select_related('organization', 'recorded_by').prefetch_related('lines').order_by('-period', '-id')


def charges_response(qs):
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today.replace(day=1), time.min))
    end = timezone.make_aware(datetime.combine((today.replace(day=28) + timedelta(days=4)).replace(day=1), time.min))
    sums = qs.aggregate(pending=Sum('amount', filter=Q(state='pending'), default=0),
                        overdue=Sum('amount', filter=Q(state='overdue'), default=0),
                        paid_this_month=Sum('amount', filter=Q(state='paid', paid_at__gte=start, paid_at__lt=end), default=0))
    return {'charges': [charge_dict(c) for c in qs], 'summary': sums}


@transaction.atomic
def create_charge(actor, org, data):
    require(actor.role == 'admin')
    data = payload(data, ('period', 'amount'), ('period',))
    parse_period(data['period'])
    org = Organization.objects.select_for_update().get(pk=org.pk)
    existing = charges_query().filter(organization=org, period=data['period'], kind='mensualidad').first()
    from .pricing import consumption
    from .recurring import settle_expirations
    settle_expirations(org)
    estimate = None if existing else consumption(org, data['period'], billing=True)
    # El importe enviado debe coincidir con la suma calculada por el servidor.
    if 'amount' in data:
        try:
            amount = Decimal(str(data['amount']))
        except (InvalidOperation, ValueError):
            amount = Decimal('NaN')
        expected = existing.amount if existing else estimate['estimated_total']
        require(type(data['amount']) in (int, float) and amount.is_finite() and amount == expected,
                'El importe debe coincidir con la cuenta existente o con el precio mensual contratado.', 'invalid_data', 400)
    if existing:
        return existing, False
    require(eligible(org, local_today(org)) and bool(estimate['lines']), 'La organización está en prueba vigente o no tiene precio de suscripción.', 'charge_not_applicable', 409)
    charge = charge_from_estimate(org, estimate, billing_settings())
    audit(actor, org, 'subscription.created', {'charge_id': charge.pk, 'period': charge.period, 'amount': str(charge.amount)})
    return charge, True


@transaction.atomic
def generate_charges(period=None):
    if period is not None:
        parse_period(period)
    rules = billing_settings()
    organizations = list(Organization.objects.select_for_update().order_by('pk'))
    existing = set(SubscriptionCharge.objects.filter(kind='mensualidad').values_list('organization_id', 'period'))
    charges = []
    for org in organizations:
        today = local_today(org)
        key = period or today.strftime('%Y-%m')
        if eligible(org, today) and (org.pk, key) not in existing:
            from .pricing import consumption
            from .recurring import settle_expirations
            settle_expirations(org)
            estimate = consumption(org, key, billing=True)
            if bool(estimate['lines']):
                charges.append(charge_from_estimate(org, estimate, rules))
    from .models import PlatformAudit
    PlatformAudit.objects.bulk_create([PlatformAudit(organization=c.organization, action='subscription.created',
        detail={'charge_id': c.pk, 'period': c.period, 'amount': str(c.amount)}) for c in charges])
    return len(charges)


@transaction.atomic
def change_charge(actor, pk, data, *, void=False):
    require(actor.role in (('admin',) if void else ('admin', 'operator')))
    org_id = SubscriptionCharge.objects.filter(pk=pk).values_list('organization_id', flat=True).first()
    require(org_id, 'No encontramos la cuenta.', 'not_found', 404)
    org = Organization.objects.select_for_update().get(pk=org_id)
    charge = charges_query().select_for_update(of=('self',)).get(pk=pk)
    data = payload(data, ('notes',) if void else ('method', 'reference', 'notes', 'paid_at'), ('notes',) if void else ('method',))
    for key in ('notes', 'reference'):
        if key in data:
            require(isinstance(data[key], str) and len(data[key]) <= (200 if key == 'reference' else 5000),
                    'Revisa la referencia y las notas.', 'invalid_data', 400)
    target = 'void' if void else 'paid'
    if not void:
        require(data['method'] in ('transferencia', 'nequi', 'efectivo', 'otro'), 'Indica un medio de pago válido.', 'invalid_data', 400)
        paid_at = timezone.now()
        if 'paid_at' in data:
            try:
                paid_at = parse_datetime(data['paid_at']) if isinstance(data['paid_at'], str) else None
            except (ValueError, TypeError):
                paid_at = None
            require(paid_at is not None and timezone.is_aware(paid_at) and paid_at <= timezone.now(),
                    'Indica una fecha de pago ISO con zona horaria que no sea futura.', 'invalid_data', 400)
    if charge.state == target:
        if not void:
            require(charge.method == data['method'] and charge.reference == data.get('reference', '') and
                    charge.notes == data.get('notes', '') and ('paid_at' not in data or charge.paid_at == paid_at),
                    'El pago ya está registrado con otros datos.', 'charge_state_conflict', 409)
        else:
            require(charge.notes == data['notes'], 'La anulación ya está registrada con otras notas.', 'charge_state_conflict', 409)
        return charge
    require(charge.state in OPEN_STATES, 'La cuenta ya fue pagada o anulada.', 'charge_state_conflict', 409)
    charge.state, charge.recorded_by, charge.notes = target, actor, data.get('notes', '')
    if not void:
        charge.method, charge.reference, charge.paid_at = data['method'], data.get('reference', ''), paid_at
    charge.save()
    if not void and charge.kind == 'recarga':
        from .credits import paid_recharge
        paid_recharge(charge, actor)
    audit(actor, org, 'subscription.' + target, {'charge_id': charge.pk, 'period': charge.period})
    if not void and org.status == 'suspended' and org.suspension_by_billing and org.suspended_reason == 'mora':
        if not SubscriptionCharge.objects.filter(organization=org, kind='mensualidad', amount__gt=0, state__in=OPEN_STATES, due_date__lt=local_today(org)).exists():
            set_suspension(None, org, False)
    return charge


@transaction.atomic
def update_rules(actor, data):
    require(actor.role == 'admin')
    data = payload(data, RULE_FIELDS)
    billing_settings()
    rules = PlatformSettings.objects.select_for_update().get(pk=1)
    if 'unit_prices' in data:
        from .price_lists import update_pricing
        update_pricing(actor, {'unit_prices': data['unit_prices']})
        rules.refresh_from_db()
    for field, value in data.items():
        if field == 'require_2fa':
            require(type(value) is bool, 'Indica si se exige doble factor.', 'invalid_data', 400)
            rules.require_2fa = value
            continue
        if field == 'unit_prices':
            continue
        require(type(value) is int and 0 <= value <= 32767, 'Los ajustes deben ser enteros no negativos.', 'invalid_data', 400)
        setattr(rules, field, value)
    save_valid(rules)
    audit(actor, None, 'billing_settings.updated', model_dict(rules, RULE_FIELDS))
    return rules


@transaction.atomic
def enforce_subscriptions():
    rules = billing_settings()
    organizations = {o.pk: o for o in Organization.objects.select_for_update().order_by('pk')}
    charges = list(SubscriptionCharge.objects.select_for_update().filter(state__in=OPEN_STATES, kind='mensualidad', amount__gt=0).order_by('organization_id', 'due_date', 'pk'))
    owners = {}
    for owner in Account.objects.filter(role='owner', active=True).exclude(email__isnull=True).exclude(email='').order_by('pk'):
        owners.setdefault(owner.organization_id, []).append(owner.email)
    counts = {'overdue': 0, 'reminders': 0, 'suspended': 0, 'mail_failed': 0}
    for charge in charges:
        org = organizations[charge.organization_id]
        today = local_today(org)
        if charge.due_date < today and charge.state == 'pending':
            charge.state = 'overdue'
            charge.save(update_fields=['state'])
            audit(None, org, 'subscription.overdue', {'charge_id': charge.pk})
            counts['overdue'] += 1
        for field, notice, when in (('reminder_sent_at', 'recordatorio', charge.due_date - timedelta(days=rules.reminder_days)),
                                    ('due_notice_sent_at', 'vencimiento', charge.due_date)):
            if today != when or getattr(charge, field) or not owners.get(org.pk):
                continue
            mail = EmailMultiAlternatives('Tu suscripción de Waiter: ' + notice,
                f'Hola,\nLa cuenta de {org.name} del periodo {charge.period} por $ {charge.amount:,.2f} '
                f'vence el {charge.due_date.isoformat()}.\nSi queda sin pagar, la suspensión será el '
                f'{(charge.due_date + timedelta(days=rules.suspend_after_days)).isoformat()}.\n— Equipo ProjectApp',
                settings.EMAIL_FROM, sorted(set(owners[org.pk])))
            try:
                sent = mail.send(using='waiter')
            except Exception:
                logger.exception('No se pudo enviar el aviso de suscripción %s.', charge.pk)
                sent = 0
            if not sent:
                counts['mail_failed'] += 1
                continue
            setattr(charge, field, timezone.now())
            charge.save(update_fields=[field])
            audit(None, org, 'subscription.reminder', {'charge_id': charge.pk, 'notice': notice})
            counts['reminders'] += 1
        if charge.due_date < today and today >= charge.due_date + timedelta(days=rules.suspend_after_days) and org.status != 'suspended':
            organizations[org.pk] = set_suspension(None, org, True, 'mora')
            counts['suspended'] += 1
    return counts


def subscription_response(org):
    qs = charges_query().filter(organization=org, kind='mensualidad')
    today = local_today(org)
    open_charges = list(qs.filter(state__in=OPEN_STATES, kind='mensualidad', amount__gt=0).order_by('due_date', 'pk'))
    overdue = [c for c in open_charges if c.due_date < today]
    suspension = overdue[0].due_date + timedelta(days=billing_settings().suspend_after_days) if overdue else None
    from .price_lists import effective_pricing
    return {'plan': org.plan, 'monthly_price': effective_pricing(org)['local_monthly'],
            'next_due': open_charges[0].due_date.isoformat() if open_charges else None,
            'charges': [charge_dict(c) for c in qs[:6]],
            'overdue': sum((c.amount for c in overdue), Decimal(0)),
            'suspend_on': suspension.isoformat() if suspension else None,
            'days_until_suspension': max(0, (suspension - today).days) if suspension else None}


def charge_from_estimate(org, estimate, rules):
    from .models import SubscriptionChargeLine
    charge = SubscriptionCharge.objects.create(organization=org, period=estimate['period'],
        amount=estimate['estimated_total'], due_date=due_date(estimate['period'], rules), advance=estimate['_advance'])
    org.account_credit = estimate['_credit']
    org.save(update_fields=['account_credit'])
    SubscriptionChargeLine.objects.bulk_create([SubscriptionChargeLine(charge=charge, **line) for line in estimate['lines']])
    return charge
