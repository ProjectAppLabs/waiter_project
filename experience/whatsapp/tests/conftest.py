from datetime import timedelta
from unittest.mock import Mock

import pytest
from cryptography.fernet import Fernet
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account, Session
from accounts.services import digest
from tenancy.models import Organization, OrganizationModule, Restaurant
from whatsapp.models import WhatsAppAccount


@pytest.fixture(autouse=True)
def configuracion(settings, monkeypatch):
    settings.WA_ACCESS_TOKEN = 'token-local-reservado'
    settings.WA_PHONE_NUMBER_ID = '111'
    settings.WA_WABA_ID = '222'
    settings.META_APP_SECRET = 'secreto-reservado'
    settings.WA_VERIFY_TOKEN = 'verificador-reservado'
    settings.META_APP_ID = '333'
    settings.WA_SIGNUP_CONFIG_ID = '444'
    settings.WA_GRAPH_VERSION = 'v25.0'
    settings.WA_TEST_RECIPIENTS = ['573004771554']
    settings.PAYMENTS_FERNET_KEY = Fernet.generate_key().decode()
    # Toda salida de red debe pasar por una simulación explícita de la prueba.
    def prohibida(*args, **kwargs):
        raise AssertionError('La prueba intentó una conexión real.')
    monkeypatch.setattr('requests.sessions.Session.request', prohibida)


@pytest.fixture
def entorno(db):
    org = Organization.objects.create(slug='restaurante', name='Restaurante', status='active')
    otra = Organization.objects.create(slug='otro', name='Otro restaurante', status='active')
    OrganizationModule.objects.create(organization=org, key='asistente_whatsapp', active=True, starts=timezone.now())
    restaurant = Restaurant.objects.create(organization=org, slug='centro', name='Centro')
    owner = Account.objects.create(organization=org, username='dueno', name='Dueño', role='owner', active=True, activated=True)
    Session.objects.create(account=owner, token_hash=digest('sesion'), expires=timezone.now()+timedelta(hours=1))
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    client.cookies['waiter_sid'] = 'sesion'
    account = WhatsAppAccount.objects.create(organization=org, restaurant=restaurant, phone_number_id='111', waba_id='222')
    return org, otra, owner, account, client


@pytest.fixture
def meta(monkeypatch):
    respuesta = Mock(status_code=200)
    respuesta.json.return_value = {'messages': [{'id': 'wamid.salida'}], 'success': True}
    enviar = Mock(return_value=respuesta)
    monkeypatch.setattr('requests.post', enviar)
    return enviar


def evento(*, wamid='wamid.entrada', numero='111', estado=None, timestamp=None):
    value = {'metadata': {'phone_number_id': numero}, 'contacts': [{'wa_id': '573004771554', 'profile': {'name': 'Ana'}}]}
    at = str(timestamp if timestamp is not None else int(timezone.now().timestamp()))
    if estado:
        value['statuses'] = [{'id': wamid, 'recipient_id': '573004771554', 'status': estado, 'timestamp': at}]
    else:
        value['messages'] = [{'from': '573004771554', 'id': wamid, 'timestamp': at, 'type': 'text', 'text': {'body': 'Hola'}}]
    return {'object': 'whatsapp_business_account', 'entry': [{'id': '222', 'changes': [{'field': 'messages', 'value': value}]}]}
