"""El guion de servicio del mesero virtual, como en un restaurante premium.

1. Bienvenida: saludo cálido, lo más pedido de la casa (platos fuertes, uno por categoría) y las categorías para
   explorar; termina preguntando qué le gustaría. Si ya vino antes, se le ofrece su favorito.
2. Descubrir y recomendar: hasta tres platos según lo que pide (las adiciones nunca abren la conversación).
3. Acompañar: cuando ya escogió un plato fuerte, se sugiere algo de tomar y, si ya tiene bebida, una adición; siempre
   como pregunta («¿le gustaría…?»), para que se note que es un valor adicional.

El papel de cada plato sale del nombre de su categoría, con reglas fijas: así es igual para todos y sin modelos.
"""
import re

from .selection import normalize

ROLES = (
    ('adicion', r'adicion|extra|topping|salsa|acompanamiento|aderezo|toppings'),
    ('bebida', r'bebida|jugo|limonada|gaseosa|cerveza|coctel|vino|licor|cafe|te |malteada|smoothie|refresco'),
    ('postre', r'postre|dulce|helado|torta'),
)
WELCOME_CATEGORIES = 4


def role(product):
    names = ' '.join(normalize(str(c)) + ' ' for c in product.get('categorias', []))
    return next((key for key, pattern in ROLES if re.search(pattern, names)), 'fuerte')


def sold(product):
    try:
        return float(product.get('vendidos', 0))
    except (TypeError, ValueError):
        return 0


def ranked(products, wanted):
    """Disponibles del papel pedido, del más vendido al menos; el desempate por id es fijo."""
    return sorted((p for p in products if p.get('agotado') is False and role(p) == wanted), key=lambda p: (-sold(p), p['id']))


def featured(products, limit=3):
    """Lo más pedido entre los platos fuertes, uno por categoría para mostrar variedad."""
    chosen, seen = [], set()
    for product in ranked(products, 'fuerte'):
        category = (product.get('categorias') or [''])[0]
        if category in seen:
            continue
        seen.add(category)
        chosen.append(product)
        if len(chosen) == limit:
            break
    return chosen


def favorite(products, profile):
    favorites = (profile or {}).get('favorites') or {}
    available = {p['id']: p for p in products if p.get('agotado') is False and role(p) == 'fuerte'}
    best = sorted(((count, -int(pk)) for pk, count in favorites.items() if str(pk).isdigit() and int(pk) in available), reverse=True)
    return available[-best[0][1]] if best else None


def category_options(products):
    """Las categorías con platos fuertes disponibles, en el orden de la carta, para explorar con un toque."""
    names = []
    for product in products:
        if product.get('agotado') is False and role(product) in ('fuerte', 'postre'):
            for category in product.get('categorias', []):
                if category not in names:
                    names.append(category)
    return [{'label': str(name), 'value': f'cat:{name}'} for name in names[:WELCOME_CATEGORIES]]


def by_category(products, name):
    return sorted((p for p in products if p.get('agotado') is False and name in p.get('categorias', [])), key=lambda p: (-sold(p), p['id']))[:3]


def complements(products, chosen_ids, cart_ids=()):
    """Después de escoger un plato fuerte: algo de tomar si aún no tiene bebida; si ya tiene, una adición."""
    by_id = {p['id']: p for p in products}
    roles = {role(by_id[pk]) for pk in (*chosen_ids, *cart_ids) if pk in by_id}
    if 'fuerte' not in {role(by_id[pk]) for pk in chosen_ids if pk in by_id}:
        return None, []
    if 'bebida' not in roles:
        return 'upsell_drink', ranked(products, 'bebida')[:2]
    if 'adicion' not in roles:
        return 'upsell_extra', ranked(products, 'adicion')[:2]
    return None, []


def listed(names):
    names = list(names)
    return names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' o ' + names[-1] if names else ''


def suggestion(session, diner, product_id):
    """Tras tocar «Añadir» en una tarjeta del chat: con qué acompañar lo que acaba de escoger, en el tono de la casa.

    Es un extra de cortesía: si algo falla, el plato ya quedó en el pedido y no se sugiere nada.
    """
    from tenancy.models import Restaurant
    from .engine import cart_ids
    from .selection import catalog_for
    from .tones import phrases, tone_of
    local = Restaurant.objects.select_related('organization').filter(
        organization__slug=session.restaurant_slug, slug=session.venue_slug).first()
    if not local:
        return None
    try:
        products = catalog_for(local)
    except Exception:
        return None
    key, items = complements(products, [product_id], [pk for pk in cart_ids(diner) if pk != product_id])
    if not key or not items:
        return None
    return {'texto': phrases(tone_of(local.organization), key)[0], 'opciones': [p['nombre'] for p in items]}
