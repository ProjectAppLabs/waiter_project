"""Distancia de círculo máximo en Decimal; cobertura sin red ni redondeo previo al tramo."""
from decimal import Decimal, InvalidOperation, localcontext
from tenancy.http import require
from .models import DeliverySettings

PI = Decimal('3.141592653589793238462643383279502884197')
METHODS = ('online', 'cash', 'card_on_delivery')


def decimal(value, minimum=0, maximum=Decimal('99999999999999.99'), places=None):
    try:
        require(not isinstance(value, bool), 'Indica un número válido.', 'invalid_data', 400)
        result = Decimal(str(value))
        require(result.is_finite() and minimum <= result <= maximum, 'El número está fuera del rango permitido.', 'invalid_data', 400)
        if places is not None:
            require(result == result.quantize(Decimal(1).scaleb(-places)), 'Revisa los decimales del número.', 'invalid_data', 400)
        return result
    except (InvalidOperation, ValueError, TypeError):
        require(False, 'Indica un número válido.', 'invalid_data', 400)


def coordinates(lat, lng):
    return decimal(lat, -90, 90).quantize(Decimal('.0000001')), decimal(lng, -180, 180).quantize(Decimal('.0000001'))


def sin(value):
    value %= 2 * PI
    if value > PI:
        value -= 2 * PI
    elif value < -PI:
        value += 2 * PI
    term = result = value
    for n in range(1, 60):
        term *= -value * value / Decimal((2 * n) * (2 * n + 1))
        result += term
        if abs(term) < Decimal('1e-35'):
            break
    return result


def atan(value):
    for _ in range(8):
        value = value / (1 + (1 + value * value).sqrt())
    result, term = value, value
    for n in range(1, 40):
        term *= -value * value
        result += term / (2 * n + 1)
    return result * 256


def distance(lat1, lng1, lat2, lng2):
    with localcontext() as context:
        context.prec = 38
        a, b = Decimal(str(lat1)) * PI / 180, Decimal(str(lat2)) * PI / 180
        dlng = (Decimal(str(lng2)) - Decimal(str(lng1))) * PI / 180
        h = sin((b - a) / 2) ** 2 + sin(PI / 2 - a) * sin(PI / 2 - b) * sin(dlng / 2) ** 2
        h = min(Decimal(1), max(Decimal(0), h))
        return Decimal('6371.0088') * (PI if h == 1 else 2 * atan((h / (1 - h)).sqrt()))


def candidates(organization):
    return DeliverySettings.objects.filter(restaurant__organization=organization, restaurant__active=True,
        enabled=True, restaurant__latitude__isnull=False, restaurant__longitude__isnull=False).select_related('restaurant').order_by('restaurant_id')


def venue_data(restaurant):
    return {'slug': restaurant.slug, 'nombre': restaurant.name}


def for_settings(row, lat, lng):
    km = distance(row.restaurant.latitude, row.restaurant.longitude, lat, lng)
    if km > row.radius_km:
        return None
    from .pricing import base_fee
    fee = base_fee(row, km)
    if fee is None:
        return None
    return {'cobertura': True, 'sede': venue_data(row.restaurant), 'distancia_km': km.quantize(Decimal('.001')),
            'envio': fee, 'minimo': row.min_order, 'metodos': row.methods, 'nota': row.notes,
            'gratis_desde': row.free_from or None, 'recargo': row.markup_percent}


def quote(organization, lat, lng, subtotal=None):
    lat, lng = coordinates(lat, lng)
    rows = list(candidates(organization))
    covered = [(distance(r.restaurant.latitude, r.restaurant.longitude, lat, lng), r.restaurant_id, for_settings(r, lat, lng), r.restaurant) for r in rows]
    covered = [r for r in covered if r[2]]
    # Plan D: solo sedes abiertas según su horario de atención; si la que cubre está cerrada y otra abierta también
    # cubre, gana la abierta. Si todas las que cubren están cerradas, se dice cuándo abre la más cercana.
    # También deben estar recibiendo pedidos (caja abierta en el POS).
    from tenancy.hours import NOT_RECEIVING, closed_message, receiving, status
    states = {r[1]: status(r[3]) for r in covered}
    taking = {r[1]: receiving(r[3]) for r in covered}
    open_ones = [r for r in covered if states[r[1]]['abierto'] and taking[r[1]]]
    if covered and not open_ones:
        nearest = min(covered, key=lambda r: (r[0], r[1]))
        info = states[nearest[1]]
        message = closed_message(nearest[3].name, info) if not info['abierto'] else NOT_RECEIVING.format(name=nearest[3].name)
        return {'cobertura': False, 'motivo': 'cerrado', 'sede': venue_data(nearest[3]), 'abre': info.get('abre'),
                'mensaje': message, 'recoger': []}
    covered = open_ones
    if covered:
        result = min(covered, key=lambda r: (r[0], r[1]))[2]
        if subtotal is not None:
            require(decimal(subtotal) >= result['minimo'], 'El pedido todavía no alcanza el mínimo de domicilio.', 'minimum_order', 400)
        return result
    return {'cobertura': False, 'motivo': 'fuera_de_zona' if rows else 'sin_domicilio',
            'recoger': [{**venue_data(r), 'direccion': ', '.join(filter(None, (r.street, r.city)))}
                        for r in organization.restaurants.filter(active=True).order_by('id')]}


def quote_session(session, lat, lng):
    from tenancy.models import Restaurant
    restaurant = Restaurant.objects.select_related('organization').get(organization__slug=session.restaurant_slug, slug=session.venue_slug)
    lat, lng = coordinates(lat, lng)
    from tenancy.hours import NOT_RECEIVING, closed_message, receiving, status
    info = status(restaurant)
    require(info['abierto'], closed_message(restaurant.name, info), 'restaurant_closed', 409)
    require(receiving(restaurant), NOT_RECEIVING.format(name=restaurant.name), 'restaurant_closed', 409)
    row = candidates(restaurant.organization).filter(restaurant=restaurant).first()
    result = for_settings(row, lat, lng) if row else None
    require(result, 'Lo sentimos, esta sede no cubre la ubicación. Puede elegir otra sede o recoger su pedido.', 'delivery_unavailable', 409)
    best = quote(restaurant.organization, lat, lng)
    if best['cobertura'] and best['sede']['slug'] != restaurant.slug:
        result['sugerida'] = best['sede']
    return result
