from datetime import timedelta
from unittest.mock import Mock

import pytest
from django.utils import timezone

from assistant.engine import handle
from assistant.models import AssistantStanding
from assistant.profiles import identity
from whatsapp.models import WhatsAppAccount, WhatsAppConversation, WhatsAppMessage
from whatsapp.processing import on_incoming_message

pytestmark = pytest.mark.django_db


# Falla si el gancho no usa el núcleo, envía fuera de ventana o responde texto libre durante una restricción.
def test_gancho_ventana_y_restriccion(entorno, monkeypatch):
    org, local, _, _, _, _ = entorno
    cuenta = WhatsAppAccount.objects.create(organization=org, restaurant=local, phone_number_id='111', waba_id='222')
    conversacion = WhatsAppConversation.objects.create(account=cuenta, wa_id='573001234567', last_inbound_at=timezone.now())
    mensaje = WhatsAppMessage.objects.create(conversation=conversacion, direction='in', wamid='wamid.primero', type='text', text='menu')
    enviar = Mock()
    monkeypatch.setattr('whatsapp.services.send_text', enviar)
    # Plan D: tocar un plato lo anota en el pedido y responde con botones («Pedir a domicilio»).
    monkeypatch.setattr('whatsapp.services.send_buttons', enviar)
    on_incoming_message(mensaje)
    assert enviar.call_count == 1 and 'Hamburguesa' in enviar.call_args.args[1]
    conversacion.last_inbound_at = timezone.now() - timedelta(hours=24)
    conversacion.save()
    on_incoming_message(mensaje)
    assert enviar.call_count == 1
    conversacion.last_inbound_at = timezone.now()
    conversacion.save()
    clave, _ = identity('whatsapp', conversacion.wa_id, org)
    AssistantStanding.objects.filter(organization=org, participant=clave).update(level='restricted', until=timezone.now()+timedelta(minutes=30))
    mensaje.text = 'Hola de nuevo'
    on_incoming_message(mensaje)
    assert enviar.call_count == 1
    mensaje.type, mensaje.raw = 'interactive', {'interactive': {'button_reply': {'id': 'pick:1'}}}
    on_incoming_message(mensaje)
    assert enviar.call_count == 2


# Falla si un número sin sede asignada mezcla cartas de varios locales.
def test_numero_sin_sede_inequivoca(entorno, monkeypatch):
    from tenancy.tests.helpers import restaurant
    org, local, _, _, _, _ = entorno
    restaurant(org, 'otra')
    cuenta = WhatsAppAccount.objects.create(organization=org, phone_number_id='111', waba_id='222')
    conversacion = WhatsAppConversation.objects.create(account=cuenta, wa_id='573001234567', last_inbound_at=timezone.now())
    mensaje = WhatsAppMessage.objects.create(conversation=conversacion, direction='in', wamid='wamid.primero', type='text', text='menu')
    enviar = Mock()
    monkeypatch.setattr('whatsapp.services.send_text', enviar)
    on_incoming_message(mensaje)
    enviar.assert_not_called()
