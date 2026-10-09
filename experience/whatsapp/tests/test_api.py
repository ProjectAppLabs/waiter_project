from datetime import timedelta
from unittest.mock import Mock, patch

import pytest
import requests
from django.utils import timezone

from experience_app.payments.crypto import decrypt
from tenancy.http import Problem
from tenancy.models import OrganizationModule
from whatsapp.client import WhatsAppError
from whatsapp.models import WhatsAppAccount, WhatsAppConversation, WhatsAppMessage
from whatsapp.services import send_template, send_text

BASE = '/api/pos/v1/whatsapp'


def test_respuesta_principal_y_sin_configuracion(entorno, settings):
    # Falla si la respuesta principal cambia de forma o expone identificadores privados.
    *_, client = entorno
    response = client.get(BASE)
    assert set(response.json()) == {'account', 'signup', 'recent'}
    assert set(response.json()['account']) == {'phone', 'name', 'quality', 'status', 'connected_at', 'test_number'}
    WhatsAppAccount.objects.all().delete()
    settings.META_APP_ID = settings.WA_SIGNUP_CONFIG_ID = ''
    assert client.get(BASE).json() == {'account': None, 'signup': None, 'recent': []}
    assert client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '222', 'phone_number_id': '111'}, format='json').status_code == 503


@pytest.mark.parametrize('role', ['admin', 'cashier', 'waiter'])
def test_solo_dueno(entorno, role):
    # Falla si otro rol accede a cualquiera de las rutas de la consola.
    _, _, owner, _, client = entorno
    owner.role = role
    owner.save()
    for method, path, body in [('get', '', None), ('post', '/connect', {}), ('post', '/disconnect', {}), ('post', '/test', {}), ('get', '/conversations/1', None), ('post', '/conversations/1/reply', {})]:
        assert getattr(client, method)(BASE+path, body, format='json').status_code == 403


def test_modulo_inactivo_y_sin_sesion(entorno):
    # Falla si una sesión o un módulo ausente permiten acceder a WhatsApp.
    org, _, _, _, client = entorno
    OrganizationModule.objects.filter(organization=org).delete()
    assert client.get(BASE).json()['error'] == 'module_inactive'
    client.cookies.clear()
    assert client.get(BASE).status_code == 401


def test_aislamiento_entre_organizaciones(entorno):
    # Falla si el dueño puede leer o responder una conversación de otra organización.
    org, other, _, _, client = entorno
    account = WhatsAppAccount.objects.create(organization=other, phone_number_id='999', waba_id='888')
    conversation = WhatsAppConversation.objects.create(account=account, wa_id='573004771554')
    assert client.get(BASE).json()['recent'] == []
    assert client.get(f'{BASE}/conversations/{conversation.pk}').status_code == 404
    assert client.post(f'{BASE}/conversations/{conversation.pk}/reply', {'text': 'Hola'}, format='json').status_code == 404
    assert client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '888', 'phone_number_id': '999'}, format='json').status_code == 409
    client.credentials(HTTP_X_WAITER_ORG=other.slug)
    assert client.get(BASE).status_code == 401


def test_registro_integrado_cifra_y_registra(entorno, settings):
    # Falla si connect omite intercambio, suscripción, registro o guarda token y PIN sin cifrar.
    *_, account, client = entorno
    token = 'token-negocio-reservado'
    with patch('requests.get') as get, patch('requests.post') as post:
        get.side_effect = [Mock(status_code=200, json=lambda: {'access_token': token}), Mock(status_code=200, json=lambda: {'display_phone_number': '+57 300 111 2233', 'verified_name': 'Restaurante', 'quality_rating': 'GREEN'})]
        post.return_value = Mock(status_code=200, json=lambda: {'success': True})
        response = client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '222', 'phone_number_id': '111'}, format='json')
    assert response.status_code == 200
    assert response.json()['account']['phone'] == '+57 300 111 2233'
    assert response.json()['account']['test_number'] is False
    assert get.call_args_list[0].args[0] == 'https://graph.facebook.com/v25.0/oauth/access_token'
    assert get.call_args_list[0].kwargs['params'] == {'client_id': settings.META_APP_ID, 'client_secret': settings.META_APP_SECRET, 'code': 'codigo'}
    assert post.call_args_list[0].args[0].endswith('/222/subscribed_apps')
    register = post.call_args_list[1]
    assert register.args[0].endswith('/111/register')
    pin = register.kwargs['json']['pin']
    assert pin.isdigit() and len(pin) == 6
    assert register.kwargs['json']['messaging_product'] == 'whatsapp'
    account.refresh_from_db()
    assert account.token_encrypted != token and decrypt(account.token_encrypted) == token
    assert account.pin_encrypted != pin and decrypt(account.pin_encrypted) == pin
    assert account.connected_by_id == entorno[2].pk


def test_desconexion_desuscribe_y_conserva_historial(entorno):
    # Falla si desconectar solo cambia el estado local o elimina conversaciones.
    *_, account, client = entorno
    WhatsAppConversation.objects.create(account=account, wa_id='573004771554')
    with patch('requests.delete', return_value=Mock(status_code=200, json=lambda: {'success': True})) as delete:
        response = client.post(BASE+'/disconnect', {}, format='json')
        assert response.status_code == 200
        assert response.json()['account']['status'] == 'disconnected'
        assert delete.call_args.args[0].endswith('/222/subscribed_apps')
        assert client.post(BASE+'/disconnect', {}, format='json').status_code == 200
        delete.assert_called_once()
    assert WhatsAppConversation.objects.count() == 1
    assert client.post(BASE+'/test', {'to': '3004771554'}, format='json').status_code == 409


@pytest.mark.parametrize('horas', [24, 25, None])
def test_texto_fuera_de_ventana_no_sale(entorno, horas, meta):
    # Falla si un texto libre sale sin un mensaje del cliente durante las últimas 24 horas.
    conversation = WhatsAppConversation.objects.create(account=entorno[3], wa_id='573004771554', last_inbound_at=timezone.now()-timedelta(hours=horas) if horas else None)
    with pytest.raises(Problem) as error:
        send_text(conversation, 'Hola')
    assert error.value.body['error'] == 'window_closed'
    assert not WhatsAppMessage.objects.exists()
    meta.assert_not_called()


def test_envio_plantilla_texto_y_detalle(entorno, meta):
    # Falla si los envíos no guardan su wamid, estado y contenido o el detalle omite mensajes.
    *_, account, client = entorno
    response = client.post(BASE+'/test', {'to': '3004771554'}, format='json')
    assert response.status_code == 200 and response.json()['message']['wamid'] == 'wamid.salida'
    assert meta.call_args.kwargs['json']['template'] == {'name': 'hello_world', 'language': {'code': 'en_US'}}
    conversation = WhatsAppConversation.objects.get()
    conversation.last_inbound_at = timezone.now()
    conversation.save()
    meta.return_value.json.return_value = {'messages': [{'id': 'wamid.texto'}]}
    response = client.post(f'{BASE}/conversations/{conversation.pk}/reply', {'text': 'Hola Ana'}, format='json')
    assert response.status_code == 200
    assert WhatsAppMessage.objects.get(wamid='wamid.texto').text == 'Hola Ana'
    detail = client.get(f'{BASE}/conversations/{conversation.pk}').json()
    assert len(detail['messages']) == 2 and detail['conversation']['window_open'] is True
    recent = client.get(BASE).json()['recent'][0]
    assert recent['last_message']['wamid'] == 'wamid.texto'


@pytest.mark.parametrize('codigo', [190, 131030, 131047, 132001, 999999])
def test_error_meta_traducido_sin_secretos(entorno, settings, meta, caplog, codigo):
    # Falla si el token, secreto o verify token aparecen en respuesta, excepción, base o registro.
    *_, account, client = entorno
    secrets = [settings.WA_ACCESS_TOKEN, settings.META_APP_SECRET, settings.WA_VERIFY_TOKEN]
    meta.return_value.status_code = 400
    meta.return_value.json.return_value = {'error': {'code': codigo, 'message': ' '.join(secrets)}}
    response = client.post(BASE+'/test', {'to': '3004771554'}, format='json')
    assert response.status_code == 502
    message = WhatsAppMessage.objects.get()
    assert message.status == 'failed' and message.error_code == str(codigo)
    evidence = response.content.decode() + caplog.text + repr(message.raw) + message.error_message
    for secret in secrets:
        assert secret not in evidence
    assert message.error_message == WhatsAppError(codigo).message


def test_error_de_red_sin_secretos(entorno, settings, meta, caplog):
    # Falla si una excepción de requests filtra la URL con las credenciales de OAuth.
    client = entorno[-1]
    with patch('requests.get', side_effect=requests.ConnectionError(settings.META_APP_SECRET)):
        response = client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '222', 'phone_number_id': '111'}, format='json')
    assert response.status_code == 502
    assert settings.META_APP_SECRET not in response.content.decode()+caplog.text


def test_destinatarios_restringidos_y_token_ausente(entorno, settings, meta):
    # Falla si el número de prueba envía a un destinatario no permitido o sin credenciales.
    account = entorno[3]
    with pytest.raises(Problem) as error:
        send_template(account, '573001234567')
    assert error.value.body['error'] == 'recipient_not_allowed'
    settings.WA_TEST_RECIPIENTS = []
    with pytest.raises(Problem):
        send_template(account, '573004771554')
    settings.WA_TEST_RECIPIENTS = ['573004771554']
    settings.WA_ACCESS_TOKEN = ''
    with pytest.raises(Problem) as error:
        send_template(account, '573004771554')
    assert error.value.status == 503
    meta.assert_not_called()


def test_registro_fallido_no_conecta(entorno):
    # Falla si se guarda una conexión cuando Meta rechaza registrar el número.
    account, client = entorno[3:]
    account.delete()
    with patch('requests.get', return_value=Mock(status_code=200, json=lambda: {'access_token': 'token'})), patch('requests.post') as post:
        post.side_effect = [Mock(status_code=200, json=lambda: {'success': True}), Mock(status_code=400, json=lambda: {'error': {'code': 190}})]
        assert client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '222', 'phone_number_id': '111'}, format='json').status_code == 502
    assert WhatsAppAccount.objects.get().status == 'disconnected'
    assert decrypt(WhatsAppAccount.objects.get().token_encrypted) == 'token'


def test_registro_http_oculta_consulta_oauth(settings, caplog):
    # Falla si el diagnóstico de urllib3 imprime secretos de la consulta OAuth o del webhook.
    import logging
    logger = logging.getLogger('urllib3.connectionpool')
    with caplog.at_level(logging.DEBUG, logger='urllib3.connectionpool'):
        logger.debug('GET /oauth/access_token?client_secret=%s', settings.META_APP_SECRET)
        logger.debug('GET /webhooks/whatsapp?hub.verify_token=%s', settings.WA_VERIFY_TOKEN)
    assert settings.META_APP_SECRET not in caplog.text
    assert settings.WA_VERIFY_TOKEN not in caplog.text


def test_confirmacion_pedido_usa_plantilla_y_organizacion(entorno, meta):
    # Falla si la confirmación del pedido usa otra organización o inicia la conversación con texto libre.
    from types import SimpleNamespace
    from whatsapp.services import send_order_confirmation
    org, other, _, account, _ = entorno
    order = SimpleNamespace(organization=org, restaurant_id=account.restaurant_id, delivery_phone='3004771554')
    assert send_order_confirmation(order).template == 'hello_world'
    order.organization = other
    with pytest.raises(Problem):
        send_order_confirmation(order)
    meta.assert_called_once()


def test_reintento_registro_conserva_pin(entorno):
    # Falla si perder la respuesta de Meta obliga a registrar el número con un PIN distinto.
    account, client = entorno[3:]
    account.delete()
    with patch('requests.get') as get, patch('requests.post', return_value=Mock(status_code=200, json=lambda: {'success': True})) as post:
        get.side_effect = [Mock(status_code=200, json=lambda: {'access_token': 'token'}), requests.Timeout('Tiempo agotado')]
        body = {'code': 'codigo', 'waba_id': '222', 'phone_number_id': '111'}
        assert client.post(BASE+'/connect', body, format='json').status_code == 502
        pin = post.call_args_list[1].kwargs['json']['pin']
        get.side_effect = [Mock(status_code=200, json=lambda: {'access_token': 'token'}), Mock(status_code=200, json=lambda: {'display_phone_number': '123', 'verified_name': 'Local', 'quality_rating': 'GREEN'})]
        assert client.post(BASE+'/connect', body, format='json').status_code == 200
        assert post.call_args_list[3].kwargs['json']['pin'] == pin


def test_coexistencia_busca_el_numero_y_no_lo_vuelve_a_registrar(entorno):
    # Falla si con la app WhatsApp Business del celular (coexistencia) se exige el número que Meta no manda, si el código
    # de un solo uso se cambia dos veces, o si se intenta registrar un número que ya está registrado en la app.
    *_, account, client = entorno
    token = 'token-negocio-coexistencia'
    with patch('requests.get') as get, patch('requests.post') as post:
        get.side_effect = [Mock(status_code=200, json=lambda: {'access_token': token}),
                           Mock(status_code=200, json=lambda: {'data': [{'id': '111'}]}),
                           Mock(status_code=200, json=lambda: {'display_phone_number': '+57 300 111 2233', 'verified_name': 'Restaurante', 'quality_rating': 'GREEN'})]
        post.return_value = Mock(status_code=200, json=lambda: {'success': True})
        response = client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '222', 'business_app': True}, format='json')
    assert response.status_code == 200, response.json()
    assert response.json()['account']['status'] == 'connected'
    assert [c.args[0].rsplit('/', 1)[-1] for c in get.call_args_list] == ['access_token', 'phone_numbers', '111']
    assert [c.args[0].rsplit('/', 2)[-2:] for c in post.call_args_list] == [['222', 'subscribed_apps']]
    account.refresh_from_db()
    assert account.phone_number_id == '111' and account.status == 'connected'


def test_coexistencia_sin_un_numero_claro_no_conecta(entorno):
    # Falla si una cuenta de WhatsApp sin números (o con varios) se conecta adivinando cuál usar.
    *_, account, client = entorno
    with patch('requests.get') as get, patch('requests.post') as post:
        get.side_effect = [Mock(status_code=200, json=lambda: {'access_token': 'tok'}), Mock(status_code=200, json=lambda: {'data': [{'id': '1'}, {'id': '2'}]})]
        response = client.post(BASE+'/connect', {'code': 'codigo', 'waba_id': '222', 'business_app': True}, format='json')
    assert response.status_code == 502
    assert 'No pudimos identificar el número' in response.json()['message']
    post.assert_not_called()
