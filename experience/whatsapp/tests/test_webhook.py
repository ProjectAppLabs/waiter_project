import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from django.db import IntegrityError, connections, transaction
from django.test import Client
from django.utils import timezone

from whatsapp.client import WhatsAppClient
from whatsapp.models import WhatsAppConversation, WhatsAppMessage, WhatsAppWebhookEvent
from whatsapp.processing import process_event
from whatsapp.webhook import IncomingMessage, StatusUpdate, parse_events, sign, verify_signature, verify_subscription
from .conftest import evento


def guardar(data):
    raw = json.dumps(data).encode()
    return WhatsAppWebhookEvent.objects.create(event_id=hashlib.sha256(raw).hexdigest(), raw_body=raw)


def test_verificacion_del_kit():
    # Falla si la verificación acepta un token equivocado o un modo incorrecto.
    params = {'hub.mode': 'subscribe', 'hub.verify_token': 'abc', 'hub.challenge': '99'}
    assert verify_subscription(params, 'abc') == (200, '99')
    assert verify_subscription({**params, 'hub.verify_token': 'x'}, 'abc')[0] == 403
    assert verify_subscription({}, 'abc')[0] == 403
    assert verify_subscription({**params, 'hub.mode': 'otro'}, 'abc')[0] == 403


def test_firma_del_kit():
    # Falla si se acepta un cuerpo alterado, un secreto vacío o una firma incorrecta.
    body = b'{"a":1}'
    signature = sign(body, 'secreto')
    assert verify_signature(body, signature, 'secreto')
    for data, header, secret in [(b'{"a":2}', signature, 'secreto'), (body, None, 'secreto'), (body, 'md5=abc', 'secreto'), (body, sign(body, ''), ''), (body, 'sha256=á', 'secreto')]:
        assert not verify_signature(data, header, secret)


def test_parseo_del_kit():
    # Falla si se pierde el nombre, el número receptor o los estados del evento.
    payload = evento()
    payload['entry'][0]['changes'][0]['value']['statuses'] = [{'id': 'wamid.0', 'status': 'read', 'timestamp': '2'}]
    message, status = parse_events(payload)
    assert isinstance(message, IncomingMessage)
    assert (message.text, message.profile_name, message.phone_number_id) == ('Hola', 'Ana', '111')
    assert isinstance(status, StatusUpdate)
    assert (status.status, status.message_id) == ('read', 'wamid.0')
    assert parse_events({'object': 'page'}) == []


@pytest.mark.parametrize('original,esperado', [('+57 300 477 1554', '573004771554'), ('3004771554', '573004771554'), ('1 (555) 633-1020', '15556331020')])
def test_normalizacion_del_kit(original, esperado):
    # Falla si la normalización pierde el indicativo de país o el celular colombiano.
    assert WhatsAppClient.normalize_number(original) == esperado


@pytest.mark.django_db
def test_verificacion_publica(settings):
    # Falla si el GET no devuelve exactamente el challenge o acepta credenciales vacías.
    client = Client()
    params = {'hub.mode': 'subscribe', 'hub.verify_token': settings.WA_VERIFY_TOKEN, 'hub.challenge': '99'}
    assert client.get('/webhooks/whatsapp', params).content == b'99'
    assert client.get('/webhooks/whatsapp', {**params, 'hub.verify_token': 'otro'}).status_code == 403
    settings.WA_VERIFY_TOKEN = ''
    assert client.get('/webhooks/whatsapp', params).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize('caso', ['sin_firma', 'alterada', 'sin_secreto'])
def test_firma_rechazada_no_guarda(settings, caso):
    # Falla si un webhook no autorizado deja datos en la base.
    raw = json.dumps(evento()).encode()
    signature = sign(raw, settings.META_APP_SECRET)
    if caso == 'sin_firma':
        signature = ''
    if caso == 'alterada':
        raw += b' '
    if caso == 'sin_secreto':
        settings.META_APP_SECRET = ''
    assert Client().post('/webhooks/whatsapp', raw, content_type='application/json', HTTP_X_HUB_SIGNATURE_256=signature).status_code == 403
    assert not WhatsAppWebhookEvent.objects.exists()


def test_webhook_responde_antes_del_procesamiento(entorno, settings, django_capture_on_commit_callbacks):
    # Falla si el webhook procesa dentro de la petición o lanza el hilo antes del commit.
    raw = json.dumps(evento()).encode()
    with patch('whatsapp.views.launch_event') as launch, patch('whatsapp.processing.process_event') as process:
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            response = Client().post('/webhooks/whatsapp', raw, content_type='application/json', HTTP_X_HUB_SIGNATURE_256=sign(raw, settings.META_APP_SECRET))
            assert response.json() == {'ok': True}
            assert WhatsAppWebhookEvent.objects.count() == 1
            launch.assert_not_called()
            process.assert_not_called()
        assert len(callbacks) == 1
        callbacks[0]()
        launch.assert_called_once()


def test_sobre_y_mensaje_duplicados(entorno, settings, meta):
    # Falla si reintentos del mismo sobre o wamid crean más de un mensaje o invocan dos veces el gancho.
    payload = evento()
    for raw in [json.dumps(payload).encode(), json.dumps(payload, indent=2).encode()]:
        Client().post('/webhooks/whatsapp', raw, content_type='application/json', HTTP_X_HUB_SIGNATURE_256=sign(raw, settings.META_APP_SECRET))
    assert WhatsAppWebhookEvent.objects.count() == 1
    row = WhatsAppWebhookEvent.objects.get()
    with patch('whatsapp.processing.on_incoming_message') as hook:
        assert process_event(row.pk)
        assert not process_event(row.pk)
        payload['entry'][0]['id'] = 'otro-sobre'
        assert process_event(guardar(payload).pk)
        hook.assert_called_once()
    assert WhatsAppMessage.objects.count() == 1
    assert WhatsAppConversation.objects.get().last_inbound_at is not None
    assert meta.call_args.kwargs['json']['status'] == 'read'
    row.refresh_from_db()
    assert row.attempts == 1


@pytest.mark.parametrize('estado', ['sent', 'delivered', 'failed'])
def test_estado_no_retrocede(entorno, estado):
    # Falla si un estado atrasado sustituye el estado leído o cruza cuentas.
    account = entorno[3]
    conversation = WhatsAppConversation.objects.create(account=account, wa_id='573004771554')
    message = WhatsAppMessage.objects.create(conversation=conversation, direction='out', wamid='wamid.salida', type='text', status='read', read_at=timezone.now())
    assert process_event(guardar(evento(wamid=message.wamid, estado=estado)).pk)
    message.refresh_from_db()
    assert message.status == 'read'
    assert getattr(message, f'{estado}_at') is not None


def test_numero_desconocido_no_asigna(entorno, caplog):
    # Falla si un número no conectado crea conversaciones en cualquier organización.
    assert process_event(guardar(evento(numero='999')).pk)
    assert not WhatsAppConversation.objects.exists()
    assert 'sin cuenta conectada' in caplog.text


def test_fecha_entrante_no_retrocede(entorno, meta):
    # Falla si un mensaje antiguo recibido tarde reduce la ventana de atención.
    assert process_event(guardar(evento()).pk)
    conversation = WhatsAppConversation.objects.get()
    before = conversation.last_inbound_at
    assert process_event(guardar(evento(wamid='wamid.viejo', timestamp=1)).pk)
    conversation.refresh_from_db()
    assert conversation.last_inbound_at == before


def test_indice_wamid_exacto_y_opcional(entorno):
    # Falla si MySQL tendría un índice parcial o permite dos mensajes con el mismo wamid.
    conversation = WhatsAppConversation.objects.create(account=entorno[3], wa_id='573004771554')
    values = {'conversation': conversation, 'direction': 'out', 'type': 'text', 'status': 'failed'}
    WhatsAppMessage.objects.create(**values)
    WhatsAppMessage.objects.create(**values)
    WhatsAppMessage.objects.create(**values, wamid='Abc')
    WhatsAppMessage.objects.create(**values, wamid='abc')
    with pytest.raises(IntegrityError), transaction.atomic():
        WhatsAppMessage.objects.create(**values, wamid='Abc')


def test_error_pendiente_y_recuperacion(entorno, meta):
    # Falla si un error de procesamiento pierde el evento o impide recuperarlo en el cron.
    row = guardar(evento())
    with patch('whatsapp.processing.on_incoming_message', side_effect=RuntimeError('dato reservado')):
        assert not process_event(row.pk)
    row.refresh_from_db()
    assert row.attempts == 1 and row.processed_at is None and 'dato reservado' not in row.error
    assert process_event(row.pk)
    row.refresh_from_db()
    assert row.attempts == 2 and row.error == ''


def test_lectura_fallida_conserva_mensaje(entorno, meta):
    # Falla si un fallo al marcar leído oculta el mensaje entrante o repite el gancho en el reintento.
    row = guardar(evento())
    meta.return_value.status_code = 400
    meta.return_value.json.return_value = {'error': {'code': 190}}
    with patch('whatsapp.processing.on_incoming_message') as hook:
        assert not process_event(row.pk)
        assert WhatsAppMessage.objects.count() == 1
        meta.return_value.status_code = 200
        meta.return_value.json.return_value = {'success': True}
        assert process_event(row.pk)
        hook.assert_called_once()


@pytest.mark.django_db
def test_cuerpo_firmado_ilegible_se_conserva(settings):
    # Falla si un evento firmado no obtiene el acuse inmediato aunque su contenido no sea JSON válido.
    raw = b'{'
    response = Client().post('/webhooks/whatsapp', raw, content_type='application/json', HTTP_X_HUB_SIGNATURE_256=sign(raw, settings.META_APP_SECRET))
    assert response.status_code == 200 and response.json() == {'ok': True}
    row = WhatsAppWebhookEvent.objects.get()
    assert bytes(row.raw_body) == raw
    assert not process_event(row.pk)


@pytest.mark.django_db(transaction=True)
def test_trabajadores_concurrentes_no_duplican(entorno, meta):
    # Falla si dos conexiones procesan el mismo evento dos veces o pierden el reintento ante un bloqueo SQLite.
    from threading import Barrier
    from django.db import OperationalError
    row = guardar(evento())
    barrier = Barrier(2)
    def procesar():
        try:
            barrier.wait(timeout=10)
            return process_event(row.pk)
        except OperationalError:
            # SQLite rechaza un escritor concurrente; el hilo deja ese evento al cron.
            return False
        finally:
            connections.close_all()
    with patch('whatsapp.processing.on_incoming_message') as hook:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: procesar(), range(2)))
        process_event(row.pk)
        assert sum(results) <= 1
        hook.assert_called_once()
    assert WhatsAppMessage.objects.count() == 1
    row.refresh_from_db()
    assert row.processed_at is not None and row.attempts == 1


@pytest.mark.django_db
def test_evento_con_error_permanente_se_descarta_tras_el_tope(settings):
    # Falla si un evento que nunca se puede procesar (cuerpo ilegible, o una lectura que Meta rechaza siempre) se
    # reintenta para siempre en cada pasada del cron, o si se descarta antes de agotar sus intentos.
    from whatsapp.processing import MAX_ATTEMPTS
    raw = b'{'
    Client().post('/webhooks/whatsapp', raw, content_type='application/json', HTTP_X_HUB_SIGNATURE_256=sign(raw, settings.META_APP_SECRET))
    row = WhatsAppWebhookEvent.objects.get()
    for _ in range(MAX_ATTEMPTS - 1):
        assert not process_event(row.pk)
        row.refresh_from_db()
        assert row.processed_at is None
    assert not process_event(row.pk)
    row.refresh_from_db()
    assert row.processed_at is not None and row.attempts == MAX_ATTEMPTS
    assert row.error.startswith(f'Descartado tras {MAX_ATTEMPTS} intentos.')
    assert not process_event(row.pk)
