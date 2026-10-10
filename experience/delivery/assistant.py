"""Decisiones de domicilio compartidas por el menú y WhatsApp; las frases viven en tones."""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from assistant.tones import phrases
from loyalty import delivery as crm
from tenancy.http import require
from whatsapp.models import WhatsAppConversation
from .coverage import candidates, coordinates, quote
from .models import ConversationDelivery


def enabled(restaurant):
    return candidates(restaurant.organization).exists()


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
    conversation = WhatsAppConversation.objects.select_related('account__organization').filter(account__organization=org, account__status='connected', wa_id=str(participant)).first()
    require(conversation, 'No encontramos la conversación.', 'not_found', 404)
    value = (action or {}).get('value')
    customer = crm.Customer.objects.filter(organization=org, normalized_phone=crm.phone(conversation.wa_id)).first()
    pending = ConversationDelivery.objects.filter(conversation=conversation, updated_at__gt=timezone.now() - timedelta(minutes=30)).first()
    location = None
    if value == 'delivery_accept':
        require(pending, 'Envíe de nuevo la ubicación antes de autorizar sus datos.', 'location_required', 400)
        customer = crm.authorize(org, conversation.wa_id, conversation.profile_name[:120] or 'Cliente', 'whatsapp')
        location = pending.location
    elif value and value.startswith('delivery_address:'):
        require(crm.consented(customer), 'No encontramos la dirección.', 'not_found', 404)
        address_id = value.partition(':')[2]
        require(address_id.isdecimal(), 'No encontramos la dirección.', 'not_found', 404)
        address = customer.addresses.filter(pk=int(address_id)).first()
        require(address, 'No encontramos la dirección.', 'not_found', 404)
        location = {'lat': str(address.latitude), 'lng': str(address.longitude), 'address': address.text, 'details': address.details}
    elif (action or {}).get('type') == 'location':
        from sales.services import text
        lat, lng = coordinates(action.get('lat'), action.get('lng'))
        location = {'lat': str(lat), 'lng': str(lng), 'address': text(action.get('address') or '', 300), 'details': text(action.get('details', ''), 200)}
    if location:
        quotation = quote(org, location['lat'], location['lng'])
        result['quote'] = {k: float(v) if isinstance(v, Decimal) else v for k, v in quotation.items()}
        if not quotation['cobertura']:
            result['text'] = say('delivery_out')
            return result
        ConversationDelivery.objects.update_or_create(conversation=conversation, defaults={'location': location})
        methods = ', '.join(say('delivery_method_' + m) for m in quotation['metodos'])
        result['text'] = say('delivery_quote', sede=quotation['sede']['nombre'], distancia=quotation['distancia_km'], envio=f"{quotation['envio']:,.0f}", metodos=methods)
        if crm.consented(customer):
            crm.save_address(customer, {'label': 'Casa', 'text': location['address'] or f"{location['lat']}, {location['lng']}",
                'details': location['details'], 'latitude': Decimal(location['lat']), 'longitude': Decimal(location['lng'])})
        else:
            result['text'] += ' ' + say('delivery_consent', policy=f'{settings.DINER_PUBLIC_URL}/{org.slug}/privacidad')
            result['options'] = [{'label': say('delivery_accept'), 'value': 'delivery_accept'}]
        result['text'] += ' ' + say('delivery_continue', url=f"{settings.DINER_PUBLIC_URL}/{org.slug}/{quotation['sede']['slug']}")
        return result
    link = create_link(conversation, restaurant)
    result.update(text=say('delivery_ask') + ' ' + say('delivery_link', url=link['url']), request_location=True)
    if crm.consented(customer):
        address = customer.addresses.order_by('-last_used_at', 'id').first()
        if address:
            result['text'] = say('delivery_saved', label=address.label, address=address.text) + ' ' + result['text']
            result['options'] = [{'label': say('delivery_use'), 'value': f'delivery_address:{address.pk}'}]
    return result
