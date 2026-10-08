import logging
import re
from datetime import timedelta
from smtplib import SMTPException
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


@pytest.mark.parametrize('platform', [False, True])
@pytest.mark.parametrize('failure, exception_type', [('exception', 'SMTPException'), ('no_delivery', 'RuntimeError')])
def test_mail_failure_logs_only_safe_diagnosis_and_preserves_retry(platform, failure, exception_type, settings, caplog):
    # Falla si el correo falla sin diagnóstico, revela datos privados, borra el código anterior o impide reintentar.
    settings.POS_URL = 'https://pos.example.test'
    settings.PLATFORM_URL = 'https://plataforma.example.test'
    person, client, base = setup_identity(platform)
    person.name = 'Nombre privado de invitación'
    person.email = 'invitacion.privada@example.test'
    person.username = 'usuario.privado.invite'
    person.save(update_fields=['name', 'email', 'username'])
    with patch('accounts.services.secrets.randbelow', return_value=654321):
        assert invitation(person)
    person.refresh_from_db()
    retry_at = person.invite_sent_at
    person.invite_sent_at -= timedelta(minutes=2)
    person.invite_attempts = 2
    person.save(update_fields=['invite_sent_at', 'invite_attempts'])
    fields = ('invite_code_hash', 'invite_expires', 'invite_attempts', 'invite_sent_at', 'password')
    previous = {field: getattr(person, field) for field in fields}
    link = (settings.PLATFORM_URL if platform else settings.POS_URL) + '/login?codigo=' + person.username
    private_values = (person.name, person.email, person.username, '123456', link, 'detalle sensible del servidor')

    with (
        caplog.at_level(logging.WARNING, logger='accounts.services'),
        patch('accounts.services.secrets.randbelow', return_value=123456),
        patch('accounts.services.timezone.now', return_value=retry_at),
    ):
        with patch('accounts.services.EmailMultiAlternatives.send') as send:
            if failure == 'exception':
                send.side_effect = SMTPException(' | '.join(private_values))
            else:
                send.return_value = 0
            response = client.post(base+'/request_code', {'login': person.username}, format='json')
        assert response.status_code == 200 and response.data == {'ok': True}
        person.refresh_from_db()
        assert {field: getattr(person, field) for field in fields} == previous
        assert person.active and not person.activated
        assert len(mail.outbox) == 1

        assert invitation(person, reset=True)
        person.refresh_from_db()
        assert len(mail.outbox) == 2 and code() == '123456'
        assert person.invite_code_hash != previous['invite_code_hash']
        assert person.invite_attempts == 0
        assert person.invite_sent_at == retry_at
        assert person.invite_expires == retry_at+timedelta(minutes=30)

    records = [record for record in caplog.records if record.name == 'accounts.services']
    assert len(records) == 1
    record = records[0]
    assert record.levelno == logging.WARNING
    assert record.getMessage() == f'invitation_send_failed exception_type={exception_type}'
    assert record.exc_info is None and record.stack_info is None
    captured = caplog.text + repr(record.__dict__)
    for private_value in private_values:
        assert private_value not in captured
