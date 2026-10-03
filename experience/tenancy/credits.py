"""Recargas pagadas, cortesías auditadas y saldos sin vencimiento."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from .http import model_dict, payload, require
from .models import CreditMovement, Organization, SubscriptionCharge, SubscriptionChargeLine
from .modules import MODULES


def balances(org):
    return [{'module': row['module'], 'unit': row['unit'], 'unit_name': MODULES[row['module']]['units'][row['unit']], 'balance': row['balance']}
            for row in CreditMovement.objects.filter(organization=org).values('module', 'unit').annotate(balance=Sum('remaining')).order_by('module', 'unit')]


def credits_response(org):
    return {'balances': balances(org), 'movements': [
        {**model_dict(row, ('id', 'at', 'kind', 'module', 'unit', 'quantity', 'amount', 'reference')),
         'actor': {'id': row.actor_id, 'name': row.actor.name} if row.actor else None}
        for row in CreditMovement.objects.filter(organization=org).select_related('actor').order_by('-at', '-pk')]}


@transaction.atomic
def grant_credit(actor, org, data):
    from .services import audit
    require(actor.role == 'admin')
    data = payload(data, ('module', 'unit', 'quantity', 'reason'), ('module', 'unit', 'quantity', 'reason'))
    module, unit, quantity = data['module'], data['unit'], data['quantity']
    require(isinstance(module, str) and module in MODULES and isinstance(unit, str) and unit in MODULES[module]['units'], 'Indica una unidad del catálogo.', 'invalid_data', 400)
    require(type(quantity) is int and 0 < quantity < 10**12, 'Indica una cantidad positiva.', 'invalid_data', 400)
    require(isinstance(data['reason'], str) and 0 < len(data['reason'].strip()) <= 250, 'Indica el motivo de la cortesía (hasta 250 caracteres).', 'invalid_data', 400)
    org = Organization.objects.select_for_update().get(pk=org.pk)
    row = CreditMovement.objects.create(organization=org, module=module, unit=unit, kind='cortesia', quantity=quantity,
                                       remaining=quantity, reference=data['reason'].strip(), actor=actor)
    audit(actor, org, 'credits.granted', {**data, 'movement_id': row.pk})
    return credits_response(org)


@transaction.atomic
def request_recharge(org, data):
    from .price_lists import effective_pricing
    from .subscriptions import billing_settings, due_date
    from .usage import current_period
    data = payload(data, ('pack',), ('pack',))
    require(isinstance(data['pack'], str), 'Elige un paquete de recarga.', 'invalid_data', 400)
    org = Organization.objects.select_for_update().get(pk=org.pk)
    pack = next((p for p in effective_pricing(org)['recharge_packs'] if p['key'] == data['pack']), None)
    require(pack, 'No encontramos ese paquete de recarga.', 'not_found', 404)
    period = current_period(org)
    charge = SubscriptionCharge.objects.create(organization=org, period=period, kind='recarga', recharge=pack,
                                               amount=Decimal(str(pack['price'])), due_date=due_date(period, billing_settings()))
    SubscriptionChargeLine.objects.create(charge=charge, concept=f"Recarga · {pack['name']}", module=pack['module'],
                                          unit=pack['unit'], quantity=1, unit_price=charge.amount, total=charge.amount)
    return charge


def paid_recharge(charge, actor):
    pack = charge.recharge
    CreditMovement.objects.get_or_create(charge=charge, defaults={'organization': charge.organization, 'module': pack['module'],
        'unit': pack['unit'], 'kind': 'recarga', 'quantity': pack['quantity'], 'remaining': pack['quantity'],
        'amount': charge.amount, 'reference': charge.reference, 'actor': actor})


def recharges_response(org):
    return {'recharges': [{**model_dict(c, ('id', 'state', 'created_at', 'paid_at')), 'pack': c.recharge['key'],
                           'name': c.recharge['name'], 'quantity': c.recharge['quantity'], 'price': c.recharge['price']}
                          for c in SubscriptionCharge.objects.filter(organization=org, kind='recarga').order_by('-pk')]}
