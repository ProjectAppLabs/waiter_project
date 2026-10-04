"""Formas compatibles con el menú, respaldadas por servicios de dominio locales."""
from tenancy.audit import audited
from collections import defaultdict
from decimal import Decimal
from uuid import UUID, uuid5

from django.utils import timezone

from catalog.models import Category as CoreCategory, Product as CoreProduct, ProductPhoto
from catalog.reading import CatalogData
from catalog.services import valid
from sales import services as sales
from sales.models import CashShift, Order, PaymentMethod
from tables.models import Table
from tenancy.http import require
from tenancy.models import Organization, Restaurant
from .types import (
    Catalog, Product, Category, CompanyBrand, PlacedOrder, OrderStatus, OrderLine,
    PHOTO_SIZES, DEFAULT_PHOTO_SIZE,
)
from experience_app.adapters.core.context import RestaurantContext, RestaurantNotFound
from experience_app.utils.images import image_content_type


def organization(slug):
    org = Organization.objects.filter(slug=slug).first()
    if org is None:
        raise RestaurantNotFound(slug)
    require(org.status != 'suspended', 'Este restaurante no está disponible', 'restaurant_unavailable', 404)
    return org


def resolve(org, venue, token=None):
    owner = organization(org)
    restaurants = Restaurant.objects.filter(organization=owner, active=True).order_by('id')
    restaurant = restaurants.filter(slug=venue).first() if venue else restaurants.first()
    if restaurant is None:
        raise RestaurantNotFound(org, venue)
    table = None
    if token:
        table = Table.objects.filter(floor__restaurant=restaurant, floor__active=True, active=True, token=token).first()
        if table is None:
            raise RestaurantNotFound(org, venue, token)
    return RestaurantContext(org, owner.name, restaurant.slug, restaurant.name, token,
                  table.number if table else None, table.pk if table else None,
                  {'nombre': owner.name, 'color': owner.brand_color, 'fuente': owner.brand_font,
                   'radio': owner.brand_radius, 'lema': owner.tagline, 'saludo': owner.greeting,
                   'mesero': owner.waiter_name, 'bienvenida': owner.welcome, 'logo': owner.logo_url or None},
                  restaurant.pk)


def list_restaurants(org):
    return list(Restaurant.objects.filter(organization=organization(org), active=True).order_by('id').values('slug', 'name'))


class Client:
    def __init__(self, tenant):
        self.organization = organization(tenant.restaurant_slug)
        self.restaurant = Restaurant.objects.filter(organization=self.organization, slug=tenant.venue_slug, active=True).first()
        require(self.restaurant, 'Este restaurante no está disponible', 'restaurant_unavailable', 404)

    def call_kw(self, model, method, args, kwargs=None):
        from .calls import dispatch
        return dispatch(self, model, method, args, kwargs or {})


def catalog_session(client, config_id):
    require(config_id == client.restaurant.pk, 'No encontramos la sede.', 'not_found', 404)
    return config_id


def ensure_open_session(client, config_id):
    catalog_session(client, config_id)
    shift = CashShift.objects.filter(restaurant=client.restaurant, state='open').first()
    require(shift, 'El restaurante no está recibiendo pedidos en este momento', 'restaurant_closed', 409)
    return shift.pk


def load_catalog(client, pos_session_id):
    org, restaurant = client.organization, client.restaurant
    data = CatalogData(org, [restaurant])
    galleries = defaultdict(list)
    for photo in ProductPhoto.objects.filter(product__organization=org).order_by('sequence', 'id'):
        galleries[photo.product_id].append({'id': photo.pk, 'version': str(data.products[photo.product_id].image_version)})
    products = []
    for p in data.products.values():
        if p.kind != 'dish' or not p.active or not p.available_in_pos:
            continue
        row = data.product_dict(p, restaurant.pk, sold_out=True)
        products.append(Product(id=p.pk, template_id=p.pk, name=p.name, price=float(data.prices.get((restaurant.pk, p.pk), p.price)),
            final_price=row['final_price'], category_ids=row['category_ids'], tax_ids=row['tax_ids'],
            sold_out=row['sold_out'], description=p.description, favorite=p.favorite, has_image=bool(p.image),
            image_version=str(p.image_version), image_origin=p.image_origin or '', attributes=p.diner_attributes,
            gallery=galleries[p.pk]))
    categories = [Category(c.pk, c.name, c.sequence) for c in CoreCategory.objects.filter(organization=org, active=True)]
    return Catalog(org.name, products, categories, float(org.signup_discount_percent))


def read_restaurant_location(client):
    r = client.restaurant
    return {'direccion': ', '.join(v for v in (r.street, r.city) if v),
            'latitud': float(r.latitude) if r.latitude is not None else None,
            'longitud': float(r.longitude) if r.longitude is not None else None}


def read_company_brand(client):
    o = client.organization
    return CompanyBrand(o.name, o.brand_color, o.brand_font, o.brand_radius, o.tagline, o.greeting,
                        o.waiter_name, o.welcome, bool(o.brand_logo), str(o.brand_version))


def fetch_company_logo(client):
    data = bytes(client.organization.brand_logo)
    return (data, image_content_type(data)) if data else None


def _image(file, size=None):
    if not file:
        return None
    from catalog.images import thumbnail_path
    name = thumbnail_path(file.name, size) if size else file.name
    if not file.storage.exists(name):
        name = file.name
    with file.storage.open(name, 'rb') as stream:
        data = stream.read()
    return data, image_content_type(data)


def fetch_product_image(client, template_id, size=DEFAULT_PHOTO_SIZE):
    p = CoreProduct.objects.filter(organization=client.organization, pk=template_id, active=True, available_in_pos=True).first()
    return _image(p.image, 512 if size == 'tarjeta' else 1024) if p else None


def fetch_gallery_image(client, template_id, photo_id):
    photo = ProductPhoto.objects.filter(product__organization=client.organization, product_id=template_id,
        product__active=True, product__available_in_pos=True, pk=photo_id).first()
    return _image(photo.image) if photo else None


def local_order(client, order_id, lock=False):
    query = Order.objects.select_for_update() if lock else Order.objects
    order = query.filter(organization=client.organization, restaurant=client.restaurant, pk=order_id).first()
    require(order, 'No encontramos el pedido.', 'not_found', 404)
    return order


def order_view(order):
    return PlacedOrder(order.pk, order.number, 'cancel' if order.state == 'cancelled' else order.state,
                     float(order.total), float(order.tax), float(order.paid))


def read_order(client, order_id):
    return order_view(local_order(client, order_id))


def read_order_state(client, order_id):
    return read_order(client, order_id).state


def read_order_status(client, order_id):
    order = local_order(client, order_id)
    return status_for(order)


def status_for(order):
    courses = list(order.courses.all())
    kitchen = ('none' if not courses else 'served' if all(c.served_at for c in courses)
               else 'ready' if all(c.ready_at for c in courses) else 'cooking' if any(c.preparation_at for c in courses)
               else 'received')
    return OrderStatus('cancel' if order.state == 'cancelled' else order.state, kitchen)


@audited
def create_order(client, *, pos_session_id, table_id, order_uuid, guests, lines, date_order, requires_payment=True):
    from loyalty.models import LoyaltyCard
    from loyalty.services import coupon_quote
    with sales.writing(client.organization, client.restaurant):
        existing = Order.objects.filter(organization=client.organization, uuid=order_uuid).first()
        if existing:
            require(existing.restaurant_id == client.restaurant.pk and existing.channel == 'menu',
                    'La referencia pertenece a otro pedido.', 'uuid_conflict', 409)
            known = {str(row.uuid) for row in existing.lines.all()}
            lines = [line for line in lines if line.uuid not in known]
            if not lines:
                return order_view(existing)
            sales.editable(existing)
        ensure_open_session(client, client.restaurant.pk)
        data = CatalogData(client.organization, [client.restaurant])
        raw = []
        for line in lines:
            product = data.products.get(line.product_id)
            require(product, 'El producto no está disponible.', 'unavailable', 400)
            children = [{'uuid': str(uuid5(UUID(line.uuid), str(i['producto']))), 'product_id': i['producto'],
                         'qty': i['cantidad'] * line.qty} for i in product.diner_attributes.get('combo', [])]
            raw.append({'uuid': line.uuid, 'product_id': line.product_id, 'qty': line.qty, 'note': line.note,
                        'children': children})
        if existing:
            order = existing
            sales.add_lines(order, raw)
        else:
            order, _ = sales.create_order(None, {'restaurant_id': client.restaurant.pk, 'uuid': order_uuid,
            'service': 'dine_in' if table_id else 'delivery', 'table_id': table_id, 'guests': guests, 'lines': raw,
            'fire': False}, restaurant=client.restaurant)
        order.origin, order.channel = 'diner', 'menu'
        # Los descuentos llegan de reservas del servidor, nunca del JSON público del comensal.
        stored = {str(row.uuid): row for row in order.lines.filter(parent=None, uuid__in=[line.uuid for line in lines])}
        cards = {c.pk: c for c in LoyaltyCard.objects.filter(organization=client.organization,
                    pk__in={line.loyalty_card_id for line in lines if line.loyalty_card_id}).select_related('customer')}
        coupon_totals = defaultdict(Decimal)
        for line in lines:
            if line.coupon_code:
                coupon_totals[line.coupon_code] += stored[line.uuid].total
        coupons = {code: coupon_quote(client.organization, client.restaurant, code, total)
                   for code, total in coupon_totals.items()}
        for line in lines:
            row = stored[line.uuid]
            pct = Decimal(str(coupons[line.coupon_code]['porcentaje'] if line.coupon_code else line.discount))
            valid(0 <= pct <= 100)
            row.discount_pct = pct
            row.total = sales.rounded(row.total * (1 - pct / 100))
            excluded = 1 + sum((Decimal(str(t['amount'])) / 100 for t in row.taxes if not t['included']), Decimal(0))
            included = 1 + sum((Decimal(str(t['amount'])) / 100 for t in row.taxes if t['included']), Decimal(0))
            row.subtotal = sales.rounded(row.total / excluded / included)
            if line.loyalty_card_id:
                require(line.loyalty_card_id in cards, 'La tarjeta no pertenece a esta organización.', 'not_found', 404)
                row.loyalty_card_id = line.loyalty_card_id
                if order.customer_id is None:
                    order.customer = cards[line.loyalty_card_id].customer
            row.coupon_code = line.coupon_code
            row.save()
        sales.recalculate(order)
        return order_view(order)


def fire_course(client, order_id):
    with sales.writing(client.organization, client.restaurant):
        return sales.fire(local_order(client, order_id, True), None)


def set_table_call(client, table_id, kind):
    valid(kind in ('none', 'ordering', 'assist', 'bill'))
    table = Table.objects.filter(pk=table_id, floor__restaurant=client.restaurant, active=True, floor__active=True).first()
    require(table, 'No encontramos la mesa.', 'not_found', 404)
    table.call, table.call_at = kind, timezone.now() if kind != 'none' else None
    table.save(update_fields=['call', 'call_at'])
    sales.event(client.restaurant, 'tables')


def online_method(client):
    return PaymentMethod.objects.get_or_create(organization=client.organization, name='Pago en línea', type='bank')[0]


def gateway_paid(client, order_id, amount, reference):
    with sales.writing(client.organization, client.restaurant):
        order = local_order(client, order_id, True)
        method = online_method(client)
        sales.add_payment(order, None, {'method_id': method.pk, 'amount': Decimal(amount) / 100,
            'reference': reference, 'request_key': f'online:{reference}'})
        sales.pay(order, None)
        return {'paid': order.state == 'paid'}
