"""Identidades opacas y memoria de la persona, nunca cruzada entre organizaciones."""
from .models import AssistantProfile
from .selection import fingerprint


def identity(channel, participant, organization):
    from experience_app.models import Diner
    from tenancy.http import require
    if channel == 'menu' and isinstance(participant, Diner):
        require(participant.session.restaurant_slug == organization.slug, 'No encontramos el comensal.', 'not_found', 404)
        account = participant.account
        if account and account.verified and account.organization_slug == organization.slug:
            return fingerprint(['cuenta', str(account.pk)]), account
        return fingerprint(['comensal', str(participant.pk)]), None
    return fingerprint([channel, str(participant)]), None


def remember(organization, key, products):
    row, _ = AssistantProfile.objects.get_or_create(organization=organization, participant=key)
    for product in products:
        pk = str(product['id'])
        row.favorites[pk] = row.favorites.get(pk, 0) + 1
        for tag in product.get('etiquetas', []):
            row.preferences[tag] = row.preferences.get(tag, 0) + 1
    row.save()
    return row


def profile_data(profile, account=None):
    return {'preferences': profile.preferences if profile else {}, 'favorites': profile.favorites if profile else {},
            'last_orders': profile.last_orders if profile else [], 'allergens': account.allergens if account else '',
            'name': profile.name if profile else ''}


def recent_orders(account):
    from experience_app.models import CartLine
    rows = CartLine.objects.filter(account=account, session__restaurant_slug=account.organization_slug,
                                   order__state__in=('sent', 'checkout')).select_related('order').order_by('-order__created_at', '-pk')[:30]
    return [{'product_id': r.product_id, 'name': r.name, 'quantity': r.qty, 'order_id': str(r.order_id)} for r in rows]


def record_order(order, lines):
    """Aprende de un pedido confirmado una sola vez y baja el contador de sus participantes."""
    from django.db import transaction
    from tenancy.models import Organization
    from .models import AssistantStanding
    from .selection import catalog_for
    from tenancy.models import Restaurant
    local = Restaurant.objects.select_related('organization').filter(
        organization__slug=order.session.restaurant_slug, slug=order.session.venue_slug).first()
    if local is None:
        return
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=local.organization_id)
        products = None
        seen = set()
        for line in lines:
            key, account = identity('menu', line.diner, local.organization)
            if key in seen:
                continue
            seen.add(key)
            standing = AssistantStanding.objects.filter(organization=local.organization, participant=key).first()
            if standing:
                standing.consecutive = max(0, standing.consecutive - 1)
                standing.incidents = standing.incidents[1:]
                standing.save(update_fields=['consecutive', 'incidents'])
            if not account:
                continue
            row, _ = AssistantProfile.objects.get_or_create(organization=local.organization, participant=key)
            if any(item.get('order_id') == str(order.pk) for item in row.last_orders):
                continue
            if products is None:
                products = catalog_for(local)
            ids = {item.product_id for item in lines if item.diner.account_id == account.pk}
            row = remember(local.organization, key, [p for p in products if p['id'] in ids])
            row.last_orders = recent_orders(account)
            row.save(update_fields=['last_orders'])


def record_pick(diner, product_id):
    """Un toque confirmado en la tarjeta del menú aprende sin consultar modelos."""
    from django.db import transaction
    from tenancy.models import Organization, Restaurant
    from .models import AssistantStanding
    from .selection import catalog_for
    local = Restaurant.objects.select_related('organization').filter(
        organization__slug=diner.session.restaurant_slug, slug=diner.session.venue_slug).first()
    if local is None:
        return
    key, account = identity('menu', diner, local.organization)
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=local.organization_id)
        standing = AssistantStanding.objects.filter(organization=local.organization, participant=key).first()
        if standing:
            standing.consecutive = max(0, standing.consecutive - 1)
            standing.incidents = standing.incidents[1:]
            standing.save(update_fields=['consecutive', 'incidents'])
        if account:
            chosen = [p for p in catalog_for(local) if p['id'] == product_id]
            if chosen:
                remember(local.organization, key, chosen)
