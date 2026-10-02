"""Authenticated diner identity and reusable POS coupons. No browser-supplied amounts."""
from experience_app.adapters.backend import backend_for, client_for
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from experience_app.adapters.odoo.client import OdooError

from experience_app.adapters.odoo.client import OdooClient
from experience_app.adapters.registry.client import resolve
from experience_app.models import CartLine


def tenant_for(session):
    return resolve(session.restaurant_slug, session.venue_slug, session.table_token)


def quote(session, diner, code):
    tenant = tenant_for(session)
    lines = session.lines.filter(diner=diner, status=CartLine.OPEN, order=None)
    amount = sum((line.subtotal for line in lines), Decimal(0))
    return client_for(tenant, OdooClient).call_kw('pos.config', 'waiter_coupon_quote', [[tenant.config_id], code, float(amount)])


def account_benefits(tenant, account, order_uuid=None):
    if account.organization_slug != tenant.restaurant_slug:
        raise ValidationError('La cuenta pertenece a otra organización.')
    return client_for(tenant, OdooClient).call_kw('pos.config', 'waiter_diner_benefits', [[tenant.config_id],
        {'id': str(account.id), 'name': account.name, 'email': account.email, 'phone': account.phone}, str(order_uuid) if order_uuid else None])


def reserve(tenant, new_lines):
    """Fija el cupón y la tarjeta de cada persona antes del envío al POS y los conserva al reintentar."""
    groups = {}
    for line in new_lines:
        groups.setdefault(line.diner_id, []).append(line)
    for lines in groups.values():
        diner = lines[0].diner
        fresh = [line for line in lines if not line.benefits_reserved]
        if not fresh:
            continue
        percent = Decimal(0)
        if diner.coupon_code:
            subtotal = sum((line.subtotal for line in fresh), Decimal(0))
            try:
                result = client_for(tenant, OdooClient).call_kw('pos.config', 'waiter_coupon_quote', [[tenant.config_id], diner.coupon_code, float(subtotal)])
            except OdooError as exc:
                raise ValidationError({'detail': str(exc)}) from exc
            percent = Decimal(str(result['porcentaje']))
        card = None
        if diner.account_id and diner.account.verified:
            card = account_benefits(tenant, diner.account)['tarjeta']
        for line in fresh:
            line.coupon_code = diner.coupon_code
            if diner.coupon_code:
                line.discount = percent
            line.loyalty_card_id = card
            line.account_id = diner.account_id
            line.benefits_reserved = True
            line.save(update_fields=['coupon_code', 'discount', 'loyalty_card_id', 'account', 'benefits_reserved'])
        if diner.coupon_code:
            from experience_app.services import rewards
            rewards.use_coupon(tenant, diner, diner.coupon_code, fresh[0].order)
