import json
from io import StringIO
from unittest.mock import Mock, patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from whatsapp.models import WhatsAppAccount, WhatsAppMessage
from whatsapp.webhook import verify_signature
from .conftest import evento
from .test_webhook import guardar


def test_comando_vincula_prueba_idempotente(entorno):
    # Falla si el comando duplica cuentas o permite asignar un local ajeno.
    org, other, _, account, _ = entorno
    output = StringIO()
    with patch('requests.get') as get:
        get.return_value = Mock(status_code=200, json=lambda: {'display_phone_number': '+1 555-633-1020', 'verified_name': 'Test Number', 'quality_rating': 'GREEN'})
        call_command('whatsapp_connect_test', org=org.slug, restaurant=account.restaurant_id, stdout=output)
        get.return_value = Mock(status_code=500, json=lambda: {'error': {'code': 1}})
        call_command('whatsapp_connect_test', org=org.slug, stdout=output)
    assert WhatsAppAccount.objects.count() == 1
    # También falla si el número visible no se guarda, o si una caída de Meta impide la vinculación de prueba.
    assert WhatsAppAccount.objects.get().phone == '+1 555-633-1020'
    assert 'sin el número visible' in output.getvalue()
    assert WhatsAppAccount.objects.get().token_encrypted == ''
    with pytest.raises(CommandError):
        call_command('whatsapp_connect_test', org=other.slug, restaurant=account.restaurant_id)


def test_comando_envia_y_exige_ventana(entorno, meta):
    # Falla si el envío de terminal omite el registro o permite texto fuera de ventana.
    output = StringIO()
    call_command('whatsapp_send_test', '3004771554', stdout=output)
    assert WhatsAppMessage.objects.get().wamid == 'wamid.salida'
    with pytest.raises(CommandError, match='24 horas'):
        call_command('whatsapp_send_test', '3004771554', text='Hola', stdout=output)


def test_comando_procesa_pendientes(entorno, meta):
    # Falla si el comando ignora eventos pendientes o duplica los ya procesados.
    row = guardar(evento())
    output = StringIO()
    call_command('process_whatsapp_events', stdout=output)
    call_command('process_whatsapp_events', stdout=output)
    row.refresh_from_db()
    assert row.processed_at and row.attempts == 1
    assert WhatsAppMessage.objects.count() == 1


def test_comando_simula_firma_sin_filtrar(settings):
    # Falla si el simulador firma otro cuerpo, sigue redirecciones o imprime secretos.
    output = StringIO()
    with patch('requests.get', return_value=Mock(status_code=200, text='12345')), patch('requests.post', return_value=Mock(status_code=200)) as post:
        call_command('whatsapp_simulate_webhook', text='Hola simulado', stdout=output)
        args = post.call_args.kwargs
        assert args['allow_redirects'] is False
        assert verify_signature(args['data'], args['headers']['X-Hub-Signature-256'], settings.META_APP_SECRET)
        assert json.loads(args['data'])['entry'][0]['changes'][0]['value']['messages'][0]['text']['body'] == 'Hola simulado'
    for secret in [settings.WA_ACCESS_TOKEN, settings.META_APP_SECRET, settings.WA_VERIFY_TOKEN]:
        assert secret not in output.getvalue()


def test_comando_sin_configuracion(settings):
    # Falla si el simulador inicia una llamada sin secreto o acepta una dirección sin HTTP.
    with pytest.raises(CommandError, match='HTTP'):
        call_command('whatsapp_simulate_webhook', url='file:///webhooks/whatsapp')
    settings.META_APP_SECRET = ''
    with pytest.raises(CommandError, match='configurar'):
        call_command('whatsapp_simulate_webhook')
