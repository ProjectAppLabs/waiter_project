"""Equivalentes locales y acotados de las operaciones adicionales del motor anterior."""
from decimal import Decimal

from catalog.models import Category
from catalog.reading import CatalogData
from catalog.services import valid, writing
from loyalty import services as loyalty
from loyalty import promotions
from reservations import services as reservations
from reservations.models import Reservation
from sales.models import CashShift, Order
from tenancy.http import require

from . import pos


def dispatch(client, model, method, args, kwargs):
    org, restaurant = client.organization, client.restaurant
    if model == 'pos.config':
        require(args and args[0] == [restaurant.pk], 'No encontramos la sede.', 'not_found', 404)
        if method == 'waiter_coupon_quote':
            return loyalty.coupon_quote(org, restaurant, args[1], args[2])
        if method == 'waiter_diner_benefits':
            return loyalty.diner_benefits(org, args[1]['id'], args[2])
        if method == 'waiter_benefit_actions':
            return loyalty.benefit_actions(org, restaurant)
        if method == 'waiter_grant_points':
            return loyalty.grant_points(org, args[1]['id'], *args[2:])
        if method == 'waiter_banner_settings':
            return loyalty.banners(org, restaurant)
        if method == 'waiter_banner_settings_integration':
            if kwargs.get('dry_run', False):
                return promotions.save_banners(org, args[1], dry_run=True)
            with writing(org):
                return promotions.save_banners(org, args[1])
    if model == 'waiter.reservation':
        belongs = Reservation.objects.filter(organization=org, restaurant=restaurant, pay_token=args[0]).exists()
        if method == 'waiter_deposit_public':
            return reservations.public_deposit(org, args[0]) if belongs else False
        if method == 'waiter_deposit_paid':
            return reservations.deposit_paid(org, args[0], args[2], Decimal(args[1]) / 100) if belongs else {'paid': False, 'reason': 'unknown'}
    if model == 'pos.order':
        if method == 'read':
            return [{'id': order.pk, 'state': order.state, 'kitchen': pos.status_for(order).kitchen}
                    for order in Order.objects.filter(organization=org, restaurant=restaurant, pk__in=args[0]).prefetch_related('courses')]
        if method in ('waiter_gateway_check', 'waiter_gateway_paid'):
            valid(len(args[0]) == 1)
            order = pos.local_order(client, args[0][0])
            if method == 'waiter_gateway_paid':
                return pos.gateway_paid(client, order.pk, args[2], args[3])
            require(order.state == 'draft' and int((order.total-order.paid)*100) == args[2],
                    'El saldo cambió. Actualiza la cuenta antes de pagar.', 'payment_conflict', 409)
            return {'ok': True}
        if method in ('waiter_whatsapp_quote', 'waiter_whatsapp_confirm'):
            from . import whatsapp
            require(args[0] == restaurant.pk, 'No encontramos la sede.', 'not_found', 404)
            return whatsapp.quote(client, args[1]) if method.endswith('_quote') else whatsapp.confirm(client, *args[1:])
    if model == 'pos.session' and method == 'search_read':
        return list(CashShift.objects.filter(restaurant=restaurant, state='open').values('id')[:1])
    if model == 'product.product' and method in ('read', 'search_read'):
        data = CatalogData(org, [restaurant])
        rows = []
        for p in data.products.values():
            if p.kind != 'dish' or (method == 'read' and p.pk not in args[0]):
                continue
            if method == 'search_read' and (not p.active or not p.available_in_pos):
                continue
            servings = data.servings(p.pk, restaurant.pk)
            rows.append({'id': p.pk, 'name': p.name, 'lst_price': data.product_dict(p, restaurant.pk)['final_price'],
                'pos_categ_ids': [c.pk for c in p.categories.all()], 'active': p.active,
                'available_in_pos': p.available_in_pos, 'sale_ok': not data.sold_out(p.pk, restaurant.pk),
                'attribute_line_ids': [1] if p.diner_attributes.get('tamanos') else [],
                'type': 'combo' if p.diner_attributes.get('combo') else 'consu',
                'is_storable': servings is not None, 'qty_available': servings or 0})
        return rows
    if model == 'pos.category' and method == 'search_read':
        ids = args[0][0][2]
        return list(Category.objects.filter(organization=org, active=True, pk__in=ids).order_by('sequence','name').values('id','name'))
    if model == 'res.company' and method == 'write_brand':
        from billing.company import save_brand
        return save_brand(org, {key.removeprefix('brand_'): value for key, value in args[0].items()})
    raise ValueError(f'Operación interna no admitida: {model}.{method}')
