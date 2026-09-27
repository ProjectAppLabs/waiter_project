"""Operaciones del POS sobre el cliente: carta, sesión de caja, pedido, cocina, pago.

Las formas de datos son las REALES de Odoo 19 (many2one como enteros pelados en
load_data, precio y categorías en product.template), ya verificadas en pos/.
"""
import base64
import json
import logging
import re
from dataclasses import dataclass, field, replace

from experience_app.adapters.odoo.client import OdooClient

# Reexportados: el sniff vive en utils/images.py (lo comparten fotos y logo); quien ya usaba pos.image_content_type sigue igual.
from experience_app.utils.images import (  # noqa: F401
    IMAGE_SIGNATURES,
    MAX_LOGO_BYTES,
    decoded_size,
    image_content_type,
    raster_content_type,
)

log = logging.getLogger(__name__)

OPEN_SESSION_STATES = ['opening_control', 'opened']
# Tamaños públicos de la foto → campo de image.mixin. 512 px basta para la tarjeta de la carta;
# la pantalla del plato la muestra a ancho completo y en un móvil 3x necesita 1024 px.
PHOTO_FIELDS = {'tarjeta': 'image_512', 'plato': 'image_1024'}
DEFAULT_PHOTO_SIZE = 'tarjeta'
# Marca en res.company (addon projectapp_ops): vacío en Odoo significa "usa el valor del registro".
BRAND_FIELDS = ['name', 'brand_color', 'brand_font', 'brand_radius', 'brand_tagline', 'brand_greeting', 'brand_waiter_name',
                'brand_welcome', 'brand_logo', 'write_date']
# Descuento de primera compra (pos.config.signup_discount_percent, addon projectapp_ops) cuando Odoo no lo entrega.
DEFAULT_SIGNUP_DISCOUNT = 5.0


@dataclass(frozen=True)
class Product:
    id: int
    name: str
    price: float
    category_ids: list[int]
    tax_ids: list[int]
    sold_out: bool = False
    template_id: int = 0
    description: str = ''
    favorite: bool = False
    has_image: bool = False
    # write_date de la plantilla, compactado: cambia con la foto y versiona su URL pública.
    image_version: str = ''
    # product.template.image_origin (addon projectapp_ops): 'real' | 'ai' | 'placeholder' | '' (sin marcar: Odoo devuelve
    # False). La carta lo traduce al comensal y con él decide la nota «Imágenes de referencia».
    image_origin: str = ''
    # Lo que el comensal ve y paga: precio de lista más los impuestos que Odoo suma encima (IVA/INC excluidos del
    # precio). `price` sigue siendo el de lista porque es el que se envía a Odoo, que calcula el impuesto por su lado.
    final_price: float | None = None
    # product.template.diner_attributes (addon projectapp_ops): JSON con piezas, picante, etiquetas, abv… (Contrato 2 del
    # Plan H). Ya parseado y tolerante: JSON inválido, no-objeto o campo ausente ⇒ {}.
    attributes: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.final_price is None:
            object.__setattr__(self, 'final_price', self.price)


@dataclass(frozen=True)
class Category:
    id: int
    name: str
    sequence: int


@dataclass(frozen=True)
class Catalog:
    company_name: str
    products: list[Product] = field(default_factory=list)
    categories: list[Category] = field(default_factory=list)
    # pos.config.signup_discount_percent: el porcentaje del descuento de primera compra que el restaurante fijó.
    signup_discount_percent: float = DEFAULT_SIGNUP_DISCOUNT


@dataclass(frozen=True)
class CompanyBrand:
    """Lo que el restaurante escribió en Odoo. Cadena vacía / None = no lo tocó (manda el registro)."""

    name: str
    color: str
    font: str
    radius: int | None
    tagline: str
    greeting: str
    waiter_name: str
    welcome: str
    has_logo: bool
    # write_date de la compañía, compactado: cambia con el logo (y con cualquier campo) y versiona su URL pública.
    version: str


@dataclass(frozen=True)
class OrderLine:
    uuid: str
    product_id: int
    name: str
    unit_price: float
    qty: float
    note: str
    tax_ids: list[int]
    discount: float = 0.0  # % sobre la línea, preservado entre reintentos.
    loyalty_card_id: int | None = None
    coupon_code: str = ''


@dataclass(frozen=True)
class OdooOrder:
    id: int
    reference: str
    state: str
    total: float
    tax: float
    paid: float


@dataclass(frozen=True)
class OrderStatus:
    state: str  # draft | paid | done | invoiced | cancel
    kitchen: str  # none | cooking | ready | served


def price_with_taxes(price: float, taxes: list[dict]) -> float:
    """Precio final como lo cobra Odoo: suma los impuestos no incluidos en el precio (porcentaje, fijo o división)."""
    total = price
    for tax in taxes:
        if tax.get('price_include'):
            continue
        kind, amount = tax.get('amount_type'), tax.get('amount') or 0
        if kind == 'percent':
            total += price * amount / 100
        elif kind == 'fixed':
            total += amount
        elif kind == 'division' and amount < 100:
            total += price / (1 - amount / 100) - price
    return round(total, 2)


def _taxes_by_id(client: OdooClient, tax_ids: set[int]) -> dict[int, dict]:
    if not tax_ids:
        return {}
    rows = client.call_kw('account.tax', 'search_read',
                          [[['id', 'in', sorted(tax_ids)]], ['amount', 'amount_type', 'price_include']])
    return {r['id']: r for r in rows}


def load_catalog(client: OdooClient, pos_session_id: int) -> Catalog:
    # Todos los modelos: una lista parcial rompe con KeyError dentro de Odoo.
    raw = client.call_kw('pos.session', 'load_data', [[pos_session_id], []])
    templates = {t['id']: t for t in raw['product.template'] if t['available_in_pos'] and t['active']}
    template_of = {p['id']: templates.get(p['product_tmpl_id']) for p in raw['product.product']}
    base = {pid: t for pid, t in template_of.items() if t}
    # "Agotado" solo aplica a almacenables: un consumible sin control de stock tiene qty 0 siempre.
    storable = [pid for pid, t in base.items() if t['is_storable']]
    sold_out: set[int] = set()
    if storable:
        rows = client.call_kw('product.product', 'search_read', [[['id', 'in', storable]], ['qty_available']])
        sold_out = {r['id'] for r in rows if r['qty_available'] <= 0}
    # description_sale, image_128 e image_origin llegan como False cuando están vacíos (no como '' ni None); image_origin
    # ni siquiera llega si projectapp_ops no se ha actualizado en ese Odoo, y la carta debe salir igual.
    taxes = _taxes_by_id(client, {tid for t in base.values() for tid in t['taxes_id']})
    products = [Product(id=pid, name=t['name'], price=t['list_price'], category_ids=t['pos_categ_ids'], tax_ids=t['taxes_id'],
                        sold_out=pid in sold_out, template_id=t['id'], description=t.get('description_sale') or '',
                        favorite=bool(t.get('is_favorite')), has_image=bool(t.get('image_128')),
                        image_version=_version(t.get('write_date')), image_origin=t.get('image_origin') or '',
                        final_price=price_with_taxes(t['list_price'], [taxes[i] for i in t['taxes_id'] if i in taxes]),
                        attributes=_with_taxed_previous_price(parse_attributes(t.get('diner_attributes')),
                                                              [taxes[i] for i in t['taxes_id'] if i in taxes]))
                for pid, t in base.items()]
    combos=[p.template_id for p in products if p.attributes.get('combo')]
    if combos:
        availability=client.call_kw('product.template','waiter_combo_availability',[combos])
        products=[replace(p,sold_out=True) if p.attributes.get('combo') and not availability.get(str(p.id),False) else p for p in products]
    categories = [Category(c['id'], c['name'], c['sequence']) for c in raw['pos.category']]
    company = raw['res.company'][0]['name'] if raw.get('res.company') else ''
    return Catalog(company_name=company, products=products, categories=categories,
                   signup_discount_percent=signup_discount_percent(raw.get('pos.config') or []))


def parse_attributes(raw) -> dict:
    """product.template.diner_attributes → dict. Es texto libre editado por RPC: lo que no sea un objeto JSON es {}."""
    if not raw or not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    for key in ('extras', 'acompanamientos'):
        if key in parsed:
            parsed[key] = list(dict.fromkeys(v for v in parsed[key] if type(v) is int and v > 0))[:19] if isinstance(parsed[key], list) else []
    if 'ingredientes' in parsed:
        ingredients = parsed['ingredientes']
        parsed['ingredientes'] = [v.strip()[:80] for v in ingredients if isinstance(v, str) and v.strip()][:32] if isinstance(ingredients, list) else []
    if 'nutricion' in parsed:
        nutrition = parsed['nutricion']
        parsed['nutricion'] = {k: v for k, v in nutrition.items() if k in {'calorias', 'peso', 'proteina', 'grasa', 'carbohidratos', 'fibra'} and type(v) in (int, float) and 0 <= v <= 100000} if isinstance(nutrition, dict) else {}
    # Tarjeta de la carta (estilo precio primero): minutos enteros de preparación y el precio anterior que se muestra
    # tachado. Un valor que no sea un número positivo desaparece; nunca se inventa ni se redondea hacia algo distinto.
    prep = parsed.pop('tiempoPreparacion', None)
    if type(prep) is int and 0 < prep <= 600:
        parsed['tiempoPreparacion'] = prep
    previous = parsed.pop('precioAntes', None)
    if type(previous) in (int, float) and previous > 0:
        parsed['precioAntes'] = previous
    return parsed


def _with_taxed_previous_price(attributes: dict, taxes: list[dict]) -> dict:
    """`precioAntes` se edita en el POS como precio de lista (igual que list_price); el comensal lo ve con los mismos
    impuestos que el precio actual para que el tachado y el descuento comparen lo mismo."""
    if 'precioAntes' in attributes:
        attributes = {**attributes, 'precioAntes': price_with_taxes(attributes['precioAntes'], taxes)}
    return attributes


def signup_discount_percent(configs: list[dict]) -> float:
    """pos.config.signup_discount_percent de load_data. Sin el campo (addon sin actualizar) o sin filas: el 5 % del diseño.
    0.0 es un valor legítimo (descuento apagado), así que no se confunde con el False de un campo ausente."""
    value = configs[0].get('signup_discount_percent') if configs else None
    if isinstance(value, bool) or not isinstance(value, int | float):
        return DEFAULT_SIGNUP_DISCOUNT
    return max(0.0, min(100.0, float(value)))


def _version(write_date) -> str:
    """'2026-09-05 01:02:03' → '20260905010203': un cache-buster corto y seguro en una URL."""
    return re.sub(r'\D', '', str(write_date or ''))


def read_company_brand(client: OdooClient) -> CompanyBrand:
    """La marca de la compañía del POS (una por base). Odoo devuelve False en los campos vacíos: aquí se normaliza.

    bin_size=True hace que brand_logo llegue como tamaño ('12.5 Kb') en vez del base64: basta para saber si hay logo
    sin descargarlo en cada refresco de la marca.
    """
    rows = client.call_kw('res.company', 'search_read', [[], BRAND_FIELDS], {'limit': 1, 'context': {'bin_size': True}})
    row = rows[0] if rows else {}

    def text(key):
        # Solo espacios cuenta como vacío: si no, un lema de '  ' en Odoo pisaría al del registro con un lema en blanco.
        return (row.get(key) or '').strip()

    return CompanyBrand(name=text('name'), color=text('brand_color'), font=text('brand_font'),
                        radius=int(row['brand_radius']) if row.get('brand_radius') else None,
                        tagline=text('brand_tagline'), greeting=text('brand_greeting'), waiter_name=text('brand_waiter_name'),
                        welcome=text('brand_welcome'), has_logo=bool(row.get('brand_logo')), version=_version(row.get('write_date')))


def fetch_company_logo(client: OdooClient) -> tuple[bytes, str] | None:
    """Bytes y content-type del logo de la compañía. None si no hay logo, pesa más de MAX_LOGO_BYTES o no es PNG/JPEG/GIF.

    El tope se comprueba sobre el base64, antes de decodificar: un logo enorme (addon sin el tope) no debe ocupar memoria
    ni caché en la experiencia. Un SVG nunca sale.
    """
    rows = client.call_kw('res.company', 'search_read', [[], ['brand_logo']], {'limit': 1})
    encoded = rows[0].get('brand_logo') if rows else None
    if not encoded:
        return None
    if decoded_size(encoded) > MAX_LOGO_BYTES:
        log.warning('logo de la compañía: pesa %d bytes, más del tope de 2 MB; no se sirve', decoded_size(encoded))
        return None
    data = base64.b64decode(encoded)
    content_type = raster_content_type(data)
    return (data, content_type) if content_type else None


def fetch_product_image(client: OdooClient, template_id: int, size: str = DEFAULT_PHOTO_SIZE) -> tuple[bytes, str] | None:
    """Bytes y content-type de la foto de la plantilla, leídos por JSON-RPC. None si la plantilla no tiene foto.

    No se usa /web/image: es público y responde 200 image/png con el placeholder genérico de Odoo tanto sin sesión
    como sin foto o con una plantilla inexistente, así que no distingue nada. Por JSON-RPC el campo llega en False
    cuando está vacío, la lista vacía si la plantilla ya no existe (o fue archivada), y se reutiliza la
    reautenticación de call_kw.
    """
    image_field = PHOTO_FIELDS[size]
    rows = client.call_kw('product.template', 'search_read', [[['id', '=', template_id]], [image_field]])
    encoded = rows[0].get(image_field) if rows else None
    if not encoded:
        return None
    data = base64.b64decode(encoded)
    return data, image_content_type(data)


def ensure_open_session(client: OdooClient, config_id: int) -> int:
    rows = client.call_kw('pos.session', 'search_read',
                          [[['state', 'in', OPEN_SESSION_STATES], ['config_id', '=', config_id]], ['id']], {'limit': 1})
    if rows:
        return rows[0]['id']
    session_id = client.call_kw('pos.session', 'create', [{'config_id': config_id}])
    client.call_kw('pos.session', 'action_pos_session_open', [[session_id]])
    return session_id


def catalog_session(client: OdooClient, config_id: int) -> int:
    """Sesión para leer la carta con load_data, SIN abrir caja: la abierta si la hay, si no la última del terminal (Odoo
    sirve load_data también sobre una cerrada). Abrir una aquí dejaba una caja en opening_control cada vez que alguien
    miraba la carta con la caja cerrada, y eso bloqueaba lo que exige caja cerrada (p. ej. guardar el plano).
    Solo un terminal que nunca tuvo sesión abre una."""
    for domain in ([['state', 'in', OPEN_SESSION_STATES], ['config_id', '=', config_id]], [['config_id', '=', config_id]]):
        rows = client.call_kw('pos.session', 'search_read', [domain, ['id']], {'limit': 1, 'order': 'id desc'})
        if rows:
            return rows[0]['id']
    return ensure_open_session(client, config_id)


def _read_order(client: OdooClient, order_id: int) -> OdooOrder:
    raw = client.call_kw('pos.order', 'read', [[order_id], ['pos_reference', 'state', 'amount_total', 'amount_tax', 'amount_paid']])[0]
    return OdooOrder(id=raw['id'], reference=raw['pos_reference'], state=raw['state'], total=raw['amount_total'], tax=raw['amount_tax'], paid=raw['amount_paid'])


def sync_payload(*, pos_session_id: int, table_id: int | None, order_uuid: str, guests: int, lines: list[OrderLine], date_order: str) -> dict:
    payload = {
        'id': -1, 'uuid': order_uuid, 'session_id': pos_session_id, 'customer_count': guests, 'sequence_number': 1, 'state': 'draft',
        'amount_total': 0, 'amount_tax': 0, 'amount_paid': 0, 'amount_return': 0, 'date_order': date_order,
        'lines': [[0, 0, {
            'id': -1, 'uuid': line.uuid, 'product_id': line.product_id, 'qty': line.qty, 'price_unit': line.unit_price,
            'tax_ids': [[6, 0, line.tax_ids]], 'price_subtotal': 0, 'price_subtotal_incl': 0,
            'full_product_name': line.name, 'customer_note': line.note, 'discount': line.discount,
            'waiter_loyalty_card_id': line.loyalty_card_id or False, 'waiter_coupon_code': line.coupon_code,
        }] for line in lines],
    }
    if table_id is not None:
        payload['table_id'] = table_id
    return payload


def create_order(client: OdooClient, *, pos_session_id: int, table_id: int | None, order_uuid: str, guests: int,
                 lines: list[OrderLine], date_order: str, requires_payment: bool = False) -> OdooOrder:
    """Idempotente por uuid: Odoo actualiza el pedido existente en vez de duplicarlo (_get_open_order)."""
    payload = sync_payload(pos_session_id=pos_session_id, table_id=table_id, order_uuid=order_uuid, guests=guests, lines=lines, date_order=date_order)
    if requires_payment:
        payload['waiter_requires_payment'] = True
    result = client.call_kw('pos.order', 'sync_from_ui', [[payload]])
    order_id = result['pos.order'][0]['id']
    # Por la API cruda amount_total queda en 0: el recálculo en servidor es obligatorio (y es lo que hace que
    # los precios del cliente no importen).
    client.call_kw('pos.order', 'recompute_prices', [[order_id]])
    # Origen del pedido (addon projectapp_ops): de aquí salen "sin intervención humana" y el ROI.
    client.call_kw('pos.order', 'write', [[order_id], {'waiter_origin': 'diner'}])
    return _read_order(client, order_id)


def fire_course(client: OdooClient, order_id: int) -> int | None:
    """Envía a cocina lo que aún no tiene curso (addon projectapp_kitchen). None si no había nada nuevo."""
    lines = client.call_kw('pos.order.line', 'search_read', [[['order_id', '=', order_id], ['course_id', '=', False], ['is_reward_line', '=', False]], ['id']])
    if not lines:
        return None
    course_id = client.call_kw('restaurant.order.course', 'kitchen_fire', [order_id, [line['id'] for line in lines]])
    return course_id or None


def read_order_state(client: OdooClient, order_id: int) -> str:
    """Solo el estado del pos.order (draft|paid|done|invoiced|cancel): para saber si el salón ya cobró."""
    return _read_order(client, order_id).state


def read_order_status(client: OdooClient, order_id: int) -> OrderStatus:
    order = _read_order(client, order_id)
    courses = client.call_kw('restaurant.order.course', 'search_read',
                             [[['order_id', '=', order_id], ['fired', '=', True]], ['preparation_date', 'ready_date', 'served_date']])
    if not courses:
        kitchen = 'none'
    elif any(not c['ready_date'] for c in courses):
        kitchen = 'cooking' if any(c.get('preparation_date') or c['ready_date'] for c in courses) else 'received'
    elif any(not c['served_date'] for c in courses):
        kitchen = 'ready'
    else:
        kitchen = 'served'
    return OrderStatus(state=order.state, kitchen=kitchen)


def pay_order(client: OdooClient, order_id: int, payment_method_id: int, amount: float) -> OdooOrder:
    client.call_kw('pos.order', 'add_payment', [[order_id], {'pos_order_id': order_id, 'payment_method_id': payment_method_id, 'amount': amount}])
    client.call_kw('pos.order', 'action_pos_order_paid', [[order_id]])
    return _read_order(client, order_id)


def cash_payment_method_id(client: OdooClient) -> int:
    rows = client.call_kw('pos.payment.method', 'search_read', [[], ['id', 'type']])
    return next(r['id'] for r in rows if r['type'] == 'cash')


# Lo que el comensal pide llega al salón por Odoo (addon projectapp_ops): "ordering" | "assist" | "bill" | "none".
def set_table_call(client: OdooClient, table_id: int, kind: str) -> None:
    client.call_kw('restaurant.table', 'set_waiter_call', [[table_id], kind])


def read_order(client: OdooClient, order_id: int) -> OdooOrder:
    """Authoritative total and remaining balance before creating a gateway payment."""
    return _read_order(client, order_id)
