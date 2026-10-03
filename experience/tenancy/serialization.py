"""Representaciones públicas de la plataforma y los restaurantes."""
from decimal import Decimal

from .http import model_dict
from .services import ORG_FIELDS, RESTAURANT_FIELDS

BRAND_FIELDS = ('brand_color', 'brand_font', 'brand_radius', 'tagline', 'logo_url', 'greeting', 'waiter_name', 'welcome')


def owner_dict(organization):
    owner = organization.accounts.filter(role='owner', active=True).order_by('id').first()
    if not owner:
        return None
    return {**model_dict(owner, ('name', 'email', 'username')), 'status': 'active' if owner.activated else 'pending'}


def organization_dict(organization):
    from .price_lists import effective_pricing
    prices = effective_pricing(organization)
    pricing = dict(organization.pricing or {'mode': 'personalizado', 'local_monthly': organization.monthly_price})
    if 'local_monthly' in pricing:
        pricing['local_monthly'] = Decimal(str(pricing['local_monthly']))
    return {**model_dict(organization, ('id', 'slug', *ORG_FIELDS, 'status', 'suspended_at', 'suspended_reason', 'created_at')),
            'owner': owner_dict(organization), 'restaurants_count': organization.restaurants.count(),
            'pricing': pricing,
            'effective_pricing': prices, 'monthly_price': prices['local_monthly'], 'account_credit': organization.account_credit}


def restaurant_dict(restaurant):
    return model_dict(restaurant, ('id', *RESTAURANT_FIELDS))


def user_dict(user, team=False):
    result = model_dict(user, ('id', 'name', 'username', 'email', 'role'))
    if team:
        result.update(model_dict(user, ('active', 'activated', 'invite_expires', 'invite_attempts', 'invite_sent_at', 'last_login')))
        result['status'] = 'active' if user.activated else 'pending'
    return result


def audit_dict(row):
    return {**model_dict(row, ('id', 'action', 'detail', 'at')), 'actor': row.actor_id,
            'organization': str(row.organization_id) if row.organization_id else None}
