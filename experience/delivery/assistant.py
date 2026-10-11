"""Decisiones de domicilio compartidas por el menú y WhatsApp; las frases viven en tones.

Plan D: por WhatsApp el pedido se hace completo en la conversación, como con un mesero: se arman los platos, se pide la
ubicación, el nombre, el teléfono y las indicaciones, se muestra el resumen con el envío y el total, y se paga (contra
entrega pasa directo a la cocina; en línea llega un enlace de pago). Cada paso es determinista: ningún modelo decide
datos de entrega ni dinero. Por debajo usa la misma visita, carrito y confirmación del menú.
"""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core import signing
from django.utils import timezone
from assistant.tones import phrases
from loyalty import delivery as crm
from tenancy.http import Problem, require
from whatsapp.models import WhatsAppConversation
from .coverage import candidates, coordinates, quote
from .models import ConversationDelivery

# El pedido en curso (platos, ubicación y datos) dura dos horas sin movimiento.
FRESH = timedelta(hours=2)
STEPS = ('consentimiento', 'nombre', 'telefono', 'indicaciones', 'pago')
PAY_SALT = 'delivery.pago.v1'


def enabled(restaurant):
    return candidates(restaurant.organization).exists()


def money(value):
    return f'{Decimal(str(value)):,.0f}'.replace(',', '.')


def conversation_for(restaurant, participant):
    return WhatsAppConversation.objects.select_related('account__organization').filter(
        account__organization=restaurant.organization, account__status='connected', wa_id=str(participant)).first()


def current(conversation):
    """El pedido en curso de la conversación; si quedó quieto más de dos horas, se empieza de nuevo."""
    row, _ = ConversationDelivery.objects.get_or_create(conversation=conversation)
    if row.updated_at and row.updated_at < timezone.now() - FRESH:
        row.location, row.cart, row.step, row.session, row.restaurant = {}, [], '', None, None
    return row


def collecting(restaurant, participant):
    """Si la conversación está respondiendo un dato del domicilio (el texto que llegue es esa respuesta)."""
    conversation = conversation_for(restaurant, participant)
    if not conversation:
        return False
    row = ConversationDelivery.objects.filter(conversation=conversation, updated_at__gt=timezone.now() - FRESH).first()
    return bool(row and row.step in ('nombre', 'telefono', 'indicaciones'))


def venue_of(conversation):
    """La sede del pedido en curso (la que atiende la ubicación), para las cuentas de WhatsApp de varias sedes."""
    row = ConversationDelivery.objects.select_related('restaurant').filter(conversation=conversation, updated_at__gt=timezone.now() - FRESH).first()
    return row.restaurant if row and row.restaurant_id and row.restaurant.active else None


def lines_text(cart):
    return ', '.join(f"{item['cantidad']} × {item['nombre']}" for item in cart)


def add_to_cart(restaurant, participant, tone, chosen, qty=1):
    """Un plato escogido en WhatsApp entra al pedido de la conversación (sin tocar todavía la cocina ni el pago)."""
    conversation = conversation_for(restaurant, participant)
    if not conversation or not chosen:
        return None
    say = lambda key, **fields: phrases(tone, key)[0].format(**fields)
    row = current(conversation)
    cart = list(row.cart)
    for product in chosen:
        item = next((i for i in cart if i['producto'] == product['id']), None)
        if item:
            item['cantidad'] = min(50, item['cantidad'] + qty)
        else:
            cart.append({'producto': product['id'], 'nombre': product['nombre'], 'cantidad': qty})
    row.cart = cart[:30]
    row.save()
    names = ', '.join(p['nombre'] for p in chosen)
    return {'text': say('cart_added', item=names, lines=lines_text(row.cart)), 'request_location': False,
            'options': [{'label': say('cart_checkout'), 'value': 'delivery_checkout'}, {'label': 'Ver menú', 'value': 'menu'}]}


def pay_link(session, diner):
    """Enlace firmado de dos horas que abre el pago del pedido en el menú (la visita es la de la conversación)."""
    token = signing.dumps({'session': str(session.pk), 'diner': str(diner.pk)}, salt=PAY_SALT)
    return f'{settings.DINER_PUBLIC_URL}/{session.restaurant_slug}/domicilio/pagar?token={token}'


def respond(channel, restaurant, participant, tone, action=None):
    from .links import create_link
    say = lambda key, **fields: phrases(tone, key)[0].format(**fields)
    org = restaurant.organization
    result = {'text': '', 'options': [], 'request_location': False}
    if not enabled(restaurant):
        result['text'] = say('delivery_off', phone=f' al {restaurant.phone}' if restaurant.phone else '')
        return result
    if channel == 'menu':
        result['text'] = say('delivery_ask')
        return result
    conversation = conversation_for(restaurant, participant)
    require(conversation, 'No encontramos la conversación.', 'not_found', 404)
    action = action or {}
    value = action.get('value') if isinstance(action.get('value'), str) else None
    customer = crm.Customer.objects.filter(organization=org, normalized_phone=crm.phone(conversation.wa_id)).first()
    row = current(conversation)

    def ask(step, key, options=None, prefix='', **fields):
        row.step = step
        row.save()
        result.update(text=(prefix + ' ' + say(key, **fields)).strip(), options=options or [])
        return result

    def ask_name(prefix=''):
        if not row.cart:
            row.step = ''
            row.save()
            result.update(text=(prefix + ' ' + say('delivery_continue_chat')).strip(), options=[{'label': 'Ver menú', 'value': 'menu'}])
            return result
        known = (row.name or conversation.profile_name or '').strip()
        return ask('nombre', 'checkout_name', [{'label': known[:20], 'value': 'delivery_name'}] if len(known) >= 2 else [], prefix)

    def located(location):
        quotation = quote(org, location['lat'], location['lng'])
        result['quote'] = {k: float(v) if isinstance(v, Decimal) else v for k, v in quotation.items()}
        if not quotation['cobertura']:
            result['text'] = quotation.get('mensaje') or say('delivery_out')
            return result
        from tenancy.models import Restaurant
        row.location = location
        row.restaurant = Restaurant.objects.get(organization=org, slug=quotation['sede']['slug'])
        row.save()
        methods = ', '.join(say('delivery_method_' + m) for m in quotation['metodos'])
        text = say('delivery_quote', sede=quotation['sede']['nombre'], distancia=quotation['distancia_km'], envio=money(quotation['envio']), metodos=methods)
        if quotation.get('gratis_desde'):
            text += f" Envío gratis desde $ {money(quotation['gratis_desde'])} en platos."
        if crm.consented(customer):
            save_address(location)
            return ask_name(text)
        return ask('consentimiento', 'delivery_consent', [{'label': say('delivery_accept'), 'value': 'delivery_accept'},
            {'label': say('delivery_decline'), 'value': 'delivery_decline'}], text, policy=f'{settings.DINER_PUBLIC_URL}/{org.slug}/privacidad')

    def save_address(location):
        crm.save_address(customer, {'label': 'Casa', 'text': location['address'] or f"{location['lat']}, {location['lng']}",
            'details': location.get('details', ''), 'latitude': Decimal(location['lat']), 'longitude': Decimal(location['lng'])})

    if value == 'delivery_checkout':
        if not row.cart:
            return ask('', 'checkout_empty', [{'label': 'Ver menú', 'value': 'menu'}])
        if row.location and row.restaurant_id:
            return ask_name()
    elif value in ('delivery_accept', 'delivery_decline'):
        require(row.location, 'Envíe de nuevo la ubicación antes de autorizar sus datos.', 'location_required', 400)
        if value == 'delivery_accept':
            customer = crm.authorize(org, conversation.wa_id, conversation.profile_name[:120] or 'Cliente', 'whatsapp')
            save_address(row.location)
        return ask_name()
    elif value and value.startswith('delivery_address:'):
        require(crm.consented(customer), 'No encontramos la dirección.', 'not_found', 404)
        address_id = value.partition(':')[2]
        require(address_id.isdecimal(), 'No encontramos la dirección.', 'not_found', 404)
        address = customer.addresses.filter(pk=int(address_id)).first()
        require(address, 'No encontramos la dirección.', 'not_found', 404)
        return located({'lat': str(address.latitude), 'lng': str(address.longitude), 'address': address.text, 'details': address.details})
    elif action.get('type') == 'location':
        from sales.services import text
        lat, lng = coordinates(action.get('lat'), action.get('lng'))
        return located({'lat': str(lat), 'lng': str(lng), 'address': text(action.get('address') or '', 300), 'details': text(action.get('details', ''), 200)})
    elif value == 'delivery_cancel':
        return ask('', 'checkout_cancelled')
    elif row.step == 'nombre' and (value == 'delivery_name' or action.get('type') == 'text'):
        name = (row.name or conversation.profile_name or '').strip() if value == 'delivery_name' else action['value'].strip()
        if not 2 <= len(name) <= 120 or not any(c.isalpha() for c in name):
            return ask('nombre', 'checkout_bad_name')
        row.name = name
        return ask('telefono', 'checkout_phone', [{'label': say('checkout_phone_same'), 'value': 'delivery_phone_same'}])
    elif row.step == 'telefono' and (value == 'delivery_phone_same' or action.get('type') == 'text'):
        number = crm.phone(conversation.wa_id if value == 'delivery_phone_same' else action['value'], required=False)
        if not number:
            return ask('telefono', 'checkout_bad_phone', [{'label': say('checkout_phone_same'), 'value': 'delivery_phone_same'}])
        row.phone = number
        return ask('indicaciones', 'checkout_details', [{'label': say('checkout_no_details'), 'value': 'delivery_no_details'}])
    elif row.step == 'indicaciones' and (value == 'delivery_no_details' or action.get('type') == 'text'):
        row.details = '' if value == 'delivery_no_details' else action['value'].strip()[:200]
        return summary(row, conversation, customer, say, result)
    elif row.step == 'pago' and value and value.startswith('delivery_pay:'):
        return pay(row, value.partition(':')[2], say, result)
    # Sin ubicación todavía: se pide (o se ofrece la dirección guardada).
    link = create_link(conversation, restaurant)
    row.step = ''
    row.save()
    result.update(text=say('delivery_ask') + ' ' + say('delivery_link', url=link['url']), request_location=True)
    if crm.consented(customer):
        address = customer.addresses.order_by('-last_used_at', 'id').first()
        if address:
            result['text'] = say('delivery_saved', label=address.label, address=address.text) + ' ' + result['text']
            result['options'] = [{'label': say('delivery_use'), 'value': f'delivery_address:{address.pk}'}]
    return result


def summary(row, conversation, customer, say, result):
    """Crea (o rehace) la visita de domicilio con los platos y la entrega, y muestra el total con los medios de pago."""
    from experience_app.adapters.core.pos import resolve
    from experience_app.models import CartLine, Diner, TableSession
    from experience_app.services import catalog, sessions
    from experience_app.views.sessions import cart_of
    from .models import SessionDelivery
    from .services import set_delivery
    restaurant = row.restaurant
    session = row.session if row.session_id and row.session.state in TableSession.OPEN_STATES and not row.session.orders.exists() else None
    if session is None:
        session = TableSession.objects.create(restaurant_slug=restaurant.organization.slug, venue_slug=restaurant.slug)
        diner = Diner.objects.create(session=session)
    else:
        diner = session.diners.order_by('created_at').first()
        CartLine.objects.filter(session=session, order__isnull=True).delete()
        SessionDelivery.objects.filter(session=session).delete()
    tenant = resolve(session.restaurant_slug, session.venue_slug, None)
    catalog.invalidate(session.restaurant_slug, session.venue_slug)
    missing = []
    for item in row.cart:
        try:
            product = catalog.find_product(tenant, item['producto'])
        except Exception:
            product = None
        if product is None or product.sold_out:
            missing.append(item['nombre'])
            continue
        sessions.add_line(session, diner, product, item['cantidad'])
    row.session = session
    row.cart = [i for i in row.cart if i['nombre'] not in missing]
    prefix = say('checkout_missing', items=', '.join(missing)) + ' ' if missing else ''
    if not row.cart:
        row.step = ''
        row.save()
        result.update(text=prefix + say('checkout_empty'), options=[{'label': 'Ver menú', 'value': 'menu'}])
        return result
    location = row.location
    try:
        set_delivery(session, diner, {'lat': location['lat'], 'lng': location['lng'], 'direccion': location.get('address') or 'Ubicación compartida por WhatsApp',
            'indicaciones': row.details or location.get('details', ''), 'telefono': row.phone, 'nombre': row.name, 'guardar': False, 'acepta_datos': False})
    except Problem as problem:
        row.step = ''
        row.save()
        result.update(text=say('checkout_failed', detail=problem.body['message']), options=[])
        return result
    if crm.consented(customer):
        SessionDelivery.objects.filter(session=session).update(customer=customer)
    cart = cart_of(session, diner)
    delivery = cart['domicilio']
    food = sum((Decimal(str(line['subtotal'])) for line in cart['lineas']), Decimal(0))
    if food < Decimal(str(delivery.get('minimo') or 0)):
        row.step = ''
        row.save()
        result.update(text=prefix + say('checkout_minimum', minimum=money(delivery['minimo'])), options=[{'label': 'Ver menú', 'value': 'menu'}])
        return result
    lines = '\n'.join(f"• {line['cantidad']} × {line['nombre']}: $ {money(line['subtotal'])}" for line in cart['lineas'])
    if Decimal(str(delivery.get('recargo') or 0)):
        lines += '\n(Precios para domicilio)'
    fee = 'gratis' if not cart['envio'] else f"$ {money(cart['envio'])}"
    address = ' · '.join(filter(None, (location.get('address'), row.details)))
    row.step = 'pago'
    row.save()
    result.update(text=prefix + say('checkout_summary', address=address or 'la ubicación que compartió', lines=lines, fee=fee, total=money(cart['total'])),
                  options=[{'label': say('pay_' + m), 'value': f'delivery_pay:{m}'} for m in delivery['metodos']][:3])
    return result


def pay(row, method, say, result):
    """Confirma el pedido: contra entrega va a la cocina; en línea queda esperando el pago con un enlace."""
    from experience_app.services import orders
    require(row.session_id, 'Escoja de nuevo cómo quiere pagar.', 'invalid_action', 400)
    session = row.session
    diner = session.diners.order_by('created_at').first()
    try:
        order, _ = orders.confirm(session, diner, prepay=True, delivery_payment=method)
    except Problem as problem:
        result.update(text=say('checkout_failed', detail=problem.body['message']), options=[])
        return result
    except Exception as error:
        result.update(text=say('checkout_failed', detail=str(getattr(error, 'detail', '') or 'inténtelo de nuevo en un momento.')), options=[])
        return result
    name = row.name.split()[0] if row.name else ''
    if method == 'online':
        text = say('checkout_link', url=pay_link(session, diner))
    else:
        text = say('checkout_done', name=name, total=money(order.total or 0))
    row.cart, row.step, row.session = [], '', None
    row.save()
    result.update(text=text, options=[])
    return result
