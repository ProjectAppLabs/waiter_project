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


# Palabras que nunca son un nombre: respuestas, saludos y lo que se dice al pedir.
NOT_NAMES = {'si', 'no', 'ok', 'listo', 'gracias', 'hola', 'buenas', 'menu', 'carta', 'quiero', 'dame', 'tienen', 'tiene',
             'algo', 'nada', 'que', 'como', 'cual', 'donde', 'cuanto', 'para', 'por', 'con', 'sin', 'una', 'uno', 'un',
             'el', 'la', 'los', 'las', 'mi', 'su', 'tu', 'yo', 'nadie', 'ninguno', 'prefiero', 'paso', 'pedido', 'cuenta',
             'pagar', 'mesero', 'bien', 'mal', 'hambre', 'sed', 'ver', 'agregar', 'agregame', 'anade', 'pide', 'quisiera'}
DECLINE = re.compile(r'(?:no|prefiero no(?: decir(?:lo)?)?|no quiero(?: decir(?:lo)?)?|paso|no gracias|sin nombre|anonimo|anonima)')


def vocabulary_words():
    from .selection import VOCABULARY
    return {w for label in VOCABULARY.values() for w in normalize(label).split()} | {
        'cliente', 'frecuente', 'alergico', 'alergica', 'celiaco', 'celiaca', 'diabetico', 'diabetica', 'nuevo', 'nueva'}


def name_from(text, products):
    """El nombre que dio el cliente al preguntárselo, o '' si lo que escribió no parece un nombre.

    Acepta «Ana», «soy Ana», «me llamo Ana María», «mi nombre es Juan»; descarta pedidos, platos y respuestas.
    """
    clean = ' '.join(re.sub(r'[!¡.,¿?]', ' ', text).split())
    match = re.fullmatch(r'(?i)(?:hola,? )?(?:me llamo|mi nombre es|soy|yo soy|habla|con|es)\s+(.+)', clean)
    candidate = match[1] if match else clean
    words = candidate.split()
    if not 1 <= len(words) <= 3 or len(candidate) > 40:
        return ''
    if not all(re.fullmatch(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{2,20}", w) for w in words):
        return ''
    plain = [normalize(w) for w in words]
    if any(w in NOT_NAMES or w in vocabulary_words() for w in plain):
        return ''
    dishes = ' '.join(normalize(p['nombre']) + ' ' + ' '.join(normalize(str(c)) for c in p.get('categorias', [])) for p in products)
    if any(len(w) > 3 and w in dishes.split() for w in plain):
        return ''
    return ' '.join(w[:1].upper() + w[1:].lower() for w in words)


CONNECTORS = {'y', 'e', 'pero', 'para', 'quiero', 'quisiera', 'me', 'necesito', 'que', 'con', 'busco', 'tengo', 'deseo', 'vengo', 'porfa', 'por'}
INTRO = re.compile(r'(?i)\b(?:me llamo|mi nombre es|yo soy|soy)\s+')


def split_name(text, products, asked=False):
    """Separa el nombre del resto del mensaje: «mi nombre es Gustavo y quiero un domicilio» → («Gustavo», «quiero un domicilio»).

    Sin presentación explícita, solo se toma como nombre el mensaje entero y únicamente si el mesero lo acababa de preguntar.
    """
    match = INTRO.search(text)
    if match:
        words = re.split(r'(\s+|[,.;!?¡¿])', text[match.end():])
        name, used = [], 0
        for i, piece in enumerate(words):
            if not piece.strip() or re.fullmatch(r'[,.;!?¡¿]', piece):
                if re.fullmatch(r'[,.;!?¡¿]', piece or ''):
                    used = i + 1
                    break
                continue
            if normalize(piece) in CONNECTORS or len(name) == 3:
                break
            name.append(piece)
            used = i + 1
        given = name_from(' '.join(name), products)
        if given:
            rest = ' '.join((text[:match.start()] + ' ' + ''.join(words[used:])).split())
            rest = re.sub(r'(?i)^(?:(?:hola|buenas)\b)?[\s,.]*(?:(?:y|e|pero)\s+)?', '', rest).strip(' ,.;')
            return given, rest
    if asked:
        given = name_from(text, products)
        if given:
            return given, ''
    return '', text


def declines_name(text):
    return bool(DECLINE.fullmatch(normalize(text).strip(' !.')))


def wants_delivery(text):
    return bool(re.search(r'\b(domicilio|delivery|envio)\b|que me lo traigan', normalize(text)))
