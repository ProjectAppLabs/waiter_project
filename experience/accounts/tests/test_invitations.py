import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.services import invitation
from tenancy.tests.helpers import PASSWORD, account, organization, platform_user, pos_client

pytestmark = pytest.mark.django_db


def code():
    return re.search(r'<strong>(\d{6})</strong>', mail.outbox[-1].alternatives[0].content).group(1)


def setup_identity(platform):
    person = platform_user(activated=False) if platform else account(organization(), activated=False)
    client = APIClient()
    if not platform:
        client.credentials(HTTP_X_WAITER_ORG=person.organization.slug)
    return person, client, '/api/platform/v1/auth' if platform else '/api/pos/v1/auth'


@pytest.mark.parametrize('platform', [False, True])
def test_invitation_single_use_and_hash(platform):
    # Falla si el código se almacena en claro, no activa o se reutiliza después de cambiar la contraseña.
    person, client, base = setup_identity(platform)
    assert invitation(person)
    person.refresh_from_db()
    value = code()
    assert value not in person.invite_code_hash
    assert timedelta(hours=47, minutes=59) < person.invite_expires-timezone.now() <= timedelta(hours=48)
    data = {'login': person.username.upper(), 'code': value, 'password': PASSWORD}
    assert client.post(base+'/activate', data, format='json').data == {'ok': True}
    person.refresh_from_db()
    assert person.activated and not person.invite_code_hash
    assert client.post(base+'/activate', data, format='json').data['error'] == 'invalid_code'
    assert client.post(base+'/login', {'login': person.email.upper(), 'password': PASSWORD}, format='json').status_code == 200


@pytest.mark.parametrize('platform', [False, True])
def test_code_expires(platform):
    # Falla si se acepta un código a partir de su vencimiento.
    person, client, base = setup_identity(platform)
    invitation(person)
    value = code()
    person.refresh_from_db()
    with patch('accounts.services.timezone.now', return_value=person.invite_expires):
        response = client.post(base+'/activate', {'login': person.username, 'code': value, 'password': PASSWORD}, format='json')
    assert response.status_code == 400 and response.data['error'] == 'invalid_code'


@pytest.mark.parametrize('platform', [False, True])
def test_five_attempts_invalidate_code(platform):
    # Falla si los intentos no persisten al responder 400 o el sexto intento puede usar el código correcto.
    person, client, base = setup_identity(platform)
    invitation(person)
    value = code()
    for _ in range(5):
        assert client.post(base+'/activate', {'login': person.username, 'code': 'incorrecto', 'password': PASSWORD}, format='json').status_code == 400
    person.refresh_from_db()
    assert person.invite_attempts == 5 and not person.invite_code_hash
    assert client.post(base+'/activate', {'login': person.username, 'code': value, 'password': PASSWORD}, format='json').status_code == 400


@pytest.mark.parametrize('platform', [False, True])
def test_resend_sixty_seconds_and_reset_thirty_minutes(platform):
    # Falla si se envían códigos antes de sesenta segundos o «olvidé» conserva las 48 horas del alta.
    person, client, base = setup_identity(platform)
    invitation(person)
    person.refresh_from_db()
    now = person.invite_sent_at
    old_hash = person.invite_code_hash
    with patch('accounts.services.timezone.now', return_value=now+timedelta(seconds=59)):
        assert client.post(base+'/request_code', {'login': person.username}, format='json').data == {'ok': True}
    person.refresh_from_db()
    assert person.invite_code_hash == old_hash and len(mail.outbox) == 1
    with patch('accounts.services.timezone.now', return_value=now+timedelta(seconds=60)):
        assert client.post(base+'/request_code', {'login': person.username}, format='json').data == {'ok': True}
    person.refresh_from_db()
    assert len(mail.outbox) == 2 and person.invite_expires == now+timedelta(minutes=31)
    assert client.post(base+'/request_code', {'login': 'desconocido'}, format='json').data == {'ok': True}


def test_reset_revokes_existing_session():
    # Falla si una recuperación de contraseña deja utilizable la cookie anterior.
    person = account(organization())
    client = pos_client(person)
    invitation(person, reset=True)
    assert client.post('/api/pos/v1/auth/activate', {'login': person.username, 'code': code(), 'password': 'nueva-contraseña'}, format='json').status_code == 200
    assert client.get('/api/pos/v1/auth/me').status_code == 401
