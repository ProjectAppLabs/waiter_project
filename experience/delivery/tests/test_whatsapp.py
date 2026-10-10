"""Ubicación y autorización de WhatsApp, sin llamadas reales a Meta ni a Google."""
from datetime import timedelta
from unittest.mock import Mock

import pytest
from django.utils import timezone

from assistant.engine import handle
from assistant.evaluator import JevEvaluator
from delivery.models import DeliveryLink, ConversationDelivery
from delivery.links import create_link
from loyalty.models import Customer, CustomerAddress
from tenancy.models import OrganizationModule
from whatsapp.models import WhatsAppAccount, WhatsAppConversation, WhatsAppMessage
from whatsapp.processing import on_incoming_message
from whatsapp.webhook import parse_events
from delivery.tests.test_delivery import env

pytestmark = pytest.mark.django_db


@pytest.fixture
# Falla si una prueba usa una conversación sin identidad o envía mensajes reales a Meta.
def conversation(env, monkeypatch):
    e = env
    OrganizationModule.objects.create(organization=e['org'], key='asistente_whatsapp', active=True, starts=timezone.now())
    account = WhatsAppAccount.objects.create(organization=e['org'], restaurant=e['venue'], phone_number_id='123', waba_id='456')
    row = WhatsAppConversation.objects.create(account=account, wa_id='573001234567', profile_name='Ana', last_inbound_at=timezone.now())
    calls = []
    def post(*args, **kwargs):
        calls.append(kwargs['json'])
        return Mock(status_code=200, json=lambda: {'messages': [{'id': f'wamid-{len(calls)}'}]})
    monkeypatch.setattr('requests.post', post)
    return row, calls


@pytest.mark.parametrize('message', ['domicilio', 'a domicilio', 'que me lo traigan', 'envío'])
# Falla si un atajo con domicilio activo sigue remitiendo al teléfono del restaurante.
def test_assistant_delivery_shortcuts(env, conversation, message):
    row, calls = conversation
    reply = handle('whatsapp', env['venue'], row.wa_id, message, products=[])
    assert reply['route'] == 'domicilio' and reply.delivery['request_location']
    assert 'Ubica la entrega' in reply['text'] and 'comuníquese' not in reply['text']
    assert DeliveryLink.objects.get().conversation == row
    menu = handle('menu', env['venue'], env['diner'], message, products=[])
    assert menu['route'] == 'domicilio' and not menu['cards'] and not menu.add


# Falla si Jev no puede clasificar domicilios o su ruta no produce la misma acción.
def test_jev_delivery(env, monkeypatch):
    monkeypatch.setattr(JevEvaluator, 'evaluate', lambda *args: {'ruta': {'choice': 'domicilio', 'confidence': .99}})
    reply = handle('menu', env['venue'], env['diner'], '¿Me llevan el almuerzo hasta mi casa?', products=[])
    assert reply['route'] == 'domicilio' and reply.delivery
    from assistant.evaluator import ROUTES
    assert 'ubicación de entrega' in ROUTES['domicilio']


# Falla si Meta entrega ubicación y el núcleo la ignora o si guarda direcciones antes de «Acepto».
def test_location_webhook_and_consent(env, conversation):
    row, calls = conversation
    raw = {'id': 'entrada-1', 'from': row.wa_id, 'type': 'location', 'location': {'latitude': 4.651, 'longitude': -74.05, 'address': 'Calle 1', 'name': 'Casa'}}
    event = parse_events({'object': 'whatsapp_business_account', 'entry': [{'changes': [{'field': 'messages', 'value': {
        'metadata': {'phone_number_id': '123'}, 'messages': [raw]}}]}]})[0]
    assert event.action == {'type': 'location', 'lat': 4.651, 'lng': -74.05, 'address': 'Calle 1'}
    message = WhatsAppMessage.objects.create(conversation=row, direction='in', type='location', text='', raw=raw, status='received', received_at=timezone.now())
    on_incoming_message(message)
    assert not CustomerAddress.objects.exists() and not Customer.objects.filter(normalized_phone='+573001234567').exists()
    assert calls[-1]['interactive']['type'] == 'button'
    assert calls[-1]['interactive']['action']['buttons'][0]['reply']['id'] == 'delivery_accept'
    assert '3000' in calls[-1]['interactive']['body']['text'].replace(',', '')
    message = WhatsAppMessage.objects.create(conversation=row, direction='in', type='interactive', status='received', raw={
        'interactive': {'button_reply': {'id': 'delivery_accept', 'title': 'Acepto'}}}, received_at=timezone.now())
    on_incoming_message(message)
    customer = Customer.objects.get(normalized_phone='+573001234567')
    assert customer.data_consent_channel == 'whatsapp' and customer.addresses.count() == 1
    reply = handle('whatsapp', env['venue'], row.wa_id, action={'type': 'location', 'lat': '4.651', 'lng': '-74.05', 'address': 'Calle 1'}, products=[])
    assert customer.addresses.count() == 1 and reply['route'] == 'domicilio'


# Falla si el botón de ubicación no usa el formato de Meta o no queda en la bandeja.
def test_request_location_message(env, conversation):
    row, calls = conversation
    message = WhatsAppMessage.objects.create(conversation=row, direction='in', type='text', text='domicilio', status='received', received_at=timezone.now())
    on_incoming_message(message)
    assert calls[-1]['interactive']['type'] == 'location_request_message'
    assert calls[-1]['interactive']['action'] == {'name': 'send_location'}
    assert WhatsAppMessage.objects.filter(conversation=row, direction='out', type='interactive', status='sent').count() == 1


# Falla si un enlace acepta otra conversación, datos adicionales, caducidad o un segundo uso.
def test_link_routes_and_binding(env, conversation):
    row, calls = conversation
    e = env
    base = f'/api/v1/{e["org"].slug}/domicilio/enlace'
    assert e['client'].post(base, {'conversation_id': row.pk}, format='json').status_code == 401
    response = e['client'].post(base, {'conversation_id': row.pk}, format='json', HTTP_X_INTERNAL_KEY='clave-interna-de-prueba')
    assert response.status_code == 201, response.data
    token = response.data['token']
    url = f'/api/v1/domicilio/ubicar/{token}'
    metadata = e['client'].get(url)
    assert metadata.status_code == 200 and 'telefono' not in metadata.data
    data = {'lat': 4.651, 'lng': -74.05, 'direccion': 'Calle 2', 'indicaciones': 'Casa verde'}
    assert e['client'].post(url, {**data, 'conversation_id': 999}, format='json').status_code == 400
    result = e['client'].post(url, data, format='json')
    assert result.status_code == 200, result.data
    assert result.data['cotizacion']['cobertura'] and calls[-1]['to'] == row.wa_id
    assert e['client'].post(url, data, format='json').status_code == 409
    assert e['client'].get(url + 'alterado').status_code == 404
    link = create_link(row, e['venue'])
    expired = f'/api/v1/domicilio/ubicar/{link["token"]}'
    DeliveryLink.objects.filter(nonce=DeliveryLink.objects.latest('pk').nonce).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert e['client'].get(expired).status_code == 404
    from tenancy.tests.helpers import organization, restaurant
    foreign = restaurant(organization('otra'))
    from tenancy.http import Problem
    with pytest.raises(Problem) as error:
        create_link(row, foreign)
    assert error.value.body['error'] == 'not_found'


# Falla si un enlace firmado puede enviarse desde un origen ajeno o volver a ligarse a otra conversación.
def test_link_conversation_tampering(env, conversation):
    row, calls = conversation
    link = create_link(row, env['venue'])
    other = WhatsAppConversation.objects.create(account=row.account, wa_id='573009999999', last_inbound_at=timezone.now())
    DeliveryLink.objects.all().update(conversation=other)
    url = f'/api/v1/domicilio/ubicar/{link["token"]}'
    assert env['client'].get(url).status_code == 404
    assert env['client'].post(url, {}, format='json', HTTP_ORIGIN='https://ajeno.co').status_code == 403


# Falla si un pedido nuevo deja de ofrecer la dirección previamente autorizada.
def test_saved_address_offer(env, conversation):
    row, calls = conversation
    from loyalty.delivery import authorize, save_address
    customer = authorize(env['org'], row.wa_id, 'Ana', 'whatsapp')
    save_address(customer, {'label': 'Casa', 'text': 'Calle 1', 'latitude': '4.6510000', 'longitude': '-74.0500000', 'details': ''})
    reply = handle('whatsapp', env['venue'], row.wa_id, 'domicilio', products=[])
    assert 'Casa (Calle 1)' in reply['text']
    chosen = handle('whatsapp', env['venue'], row.wa_id, action={'type': 'option', 'value': reply['options'][0]['value']}, products=[])
    assert chosen.delivery['quote']['envio'] == 3000


# Falla si WhatsApp ignora domicilios cuando la cuenta cubre varias sedes sin una sede fija.
def test_organization_whatsapp_selects_covered_venue(env, conversation):
    from tenancy.tests.helpers import restaurant
    from delivery.models import DeliverySettings
    row, calls = conversation
    row.account.restaurant = None
    row.account.save()
    nearby = restaurant(env['org'], 'cerca', latitude=4.651, longitude=-74.05)
    DeliverySettings.objects.create(restaurant=nearby, enabled=True, methods=['cash'])
    message = WhatsAppMessage.objects.create(conversation=row, direction='in', type='location', status='received', received_at=timezone.now(),
        raw={'location': {'latitude': 4.651, 'longitude': -74.05, 'address': 'Calle 1'}})
    on_incoming_message(message)
    assert calls and 'Cerca' in calls[-1]['interactive']['body']['text']
    assert not CustomerAddress.objects.exists()
