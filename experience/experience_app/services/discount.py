"""Descuento de primera compra sobre las líneas de una cuenta verificada.

El porcentaje pertenece a la organización y llega con la carta. Confirmar fija el
porcentaje en las líneas y reserva su uso para conservarlo entre reintentos.
"""
from tenancy.http import Problem
from decimal import Decimal
import hashlib
import re

from django.db import DatabaseError
from experience_app.adapters.core.context import RestaurantContext
from experience_app.models import CartLine, Diner, DinerAccount, SignupDiscountClaim
from experience_app.services import catalog

DEFAULT_PERCENT = 5.0


def percent_for(tenant: RestaurantContext) -> float:
    try:
        return float(catalog.get_catalog(tenant).signup_discount_percent)
    except (DatabaseError, Problem):
        return DEFAULT_PERCENT


def claim_keys(diner: Diner) -> list[str]:
    identities = ['cookie:' + diner.benefit_key]
    if diner.account_id and diner.account.phone:
        phone = re.sub(r'[^0-9]', '', diner.account.phone)
        if len(phone) == 10 and phone.startswith('3'):
            phone = '57' + phone
        identities.append('phone:' + phone)
    organization = diner.session.restaurant_slug
    return [hashlib.sha256(f'{organization}:{hashlib.sha256(value.encode()).hexdigest()}'.encode()).hexdigest() for value in identities]


def applicable(diner: Diner) -> bool:
    """El comensal tiene una cuenta verificada que aún no usó su descuento."""
    return diner.account_id is not None and DinerAccount.objects.filter(
        id=diner.account_id, organization_slug=diner.session.restaurant_slug, verified=True, discount_used_at=None, discount_order=None).exists() and not SignupDiscountClaim.objects.filter(key__in=claim_keys(diner)).exists()


def view(lines: list[CartLine], diner: Diner, percent: float) -> dict:
    """Sobre las líneas del comensal: `monto` es lo ya descontado en las confirmadas más lo que descontará en las abiertas."""
    mine = [line for line in lines if line.diner_id == diner.id]
    applied = sum((line.discount_amount for line in mine if line.discount), Decimal(0))
    if diner.coupon_code:
        from experience_app.services import benefits
        pending = [line for line in mine if line.status == CartLine.OPEN and line.order_id is None]
        result = {'codigo': diner.coupon_code, 'porcentaje': float(max((line.discount for line in mine), default=0)), 'monto': 0}
        error = ''
        if pending:
            try:
                result = benefits.quote(diner.session, diner, diner.coupon_code)
            except (DatabaseError, Problem) as exc:
                error = exc.body['message'] if isinstance(exc, Problem) else str(exc)
        return {**result, 'monto': float(applied) + result['monto'], 'aplicable': bool(pending) and not error,
                'aplicado': applied > 0, 'registrado': bool(diner.account_id), 'error': error}
    projected = Decimal(0)
    can_apply = percent > 0 and applicable(diner)
    if not can_apply:
        from experience_app.services import rewards
        reward_view = rewards.discount_view(lines, diner)
        if reward_view is not None:
            return reward_view
    if can_apply:
        pending = sum((line.subtotal for line in mine if line.status == CartLine.OPEN and not line.discount), Decimal(0))
        projected = (pending * Decimal(str(percent)) / 100).quantize(Decimal('0.01'))
    return {'porcentaje': percent, 'monto': float(applied + projected), 'aplicable': can_apply, 'aplicado': applied > 0, 'registrado': bool(diner.account_id and diner.account.verified)}
