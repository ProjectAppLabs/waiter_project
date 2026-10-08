"""Invitación y recuperación por las APIs de POS y ProjectApp, sin correo externo."""
import logging
import re
from datetime import UTC, datetime, timedelta
from smtplib import SMTPException
from unittest.mock import patch

import pytest
from django.core import mail
from rest_framework.test import APIClient

from accounts.services import invitation
from tenancy.tests.helpers import PASSWORD, account, organization, platform_user, pos_client

pytestmark = pytest.mark.django_db
INVITATION_FIELDS = ('invite_code_hash', 'invite_expires', 'invite_attempts', 'invite_sent_at', 'password', 'active', 'activated')


def code():
    """Lee el código que una persona recibe en el último correo del backend aislado."""
    return re.search(r'<strong>(\d{6})</strong>', mail.outbox[-1].alternatives[0].content).group(1)


def setup_identity(platform):
    """Prepara una cuenta pendiente y su entrada pública para POS o ProjectApp."""
    person = platform_user(activated=False) if platform else account(organization(), activated=False)
    client = APIClient()
    if not platform:
        client.credentials(HTTP_X_WAITER_ORG=person.organization.slug)
    return person, client, '/api/platform/v1/auth' if platform else '/api/pos/v1/auth'


@pytest.fixture(autouse=True)
def fixed_now(monkeypatch):
    """Controla el reloj del servicio para medir vencimientos y reenvíos exactos."""
    now = datetime(2026, 10, 8, 12, tzinfo=UTC)
    monkeypatch.setattr('accounts.services.timezone.now', lambda: now)
    return now


@pytest.fixture(params=[False, True], ids=['pos', 'projectapp'])
def identity(request):
    """Ejecuta cada caso de fallo sobre las dos entradas públicas de invitación."""
    return setup_identity(request.param)


@pytest.fixture
def invitation_to_retry(identity, settings, monkeypatch):
    """Conserva una invitación previa para comprobar rollback y reintento."""
    settings.POS_URL = 'https://pos.example.test'
    settings.PLATFORM_URL = 'https://plataforma.example.test'
    person, client, base = identity
    person.name = 'Nombre privado de invitación'
    person.email = 'invitacion.privada@example.test'
    person.username = 'usuario.privado.invite'
    person.save(update_fields=['name', 'email', 'username'])
    monkeypatch.setattr('accounts.services.secrets.randbelow', lambda _limit: 654321)
    assert invitation(person) is True
    person.refresh_from_db()
    person.invite_sent_at -= timedelta(minutes=2)
    person.invite_attempts = 2
    person.save(update_fields=['invite_sent_at', 'invite_attempts'])
    previous = {field: getattr(person, field) for field in INVITATION_FIELDS}
    private_values = (person.name, person.email, person.username, '123456',
                      settings.POS_URL, settings.PLATFORM_URL, 'detalle sensible del servidor')
    monkeypatch.setattr('accounts.services.secrets.randbelow', lambda _limit: 123456)
    return {'person': person, 'client': client, 'base': base, 'previous': previous,
            'private_values': private_values, 'private_pattern': '|'.join(map(re.escape, private_values))}


@pytest.fixture(params=['SMTPException', 'RuntimeError'])
def mail_failure(request, invitation_to_retry):
    """Simula un error SMTP o un envío sin entrega en la frontera externa."""
    failures = {'SMTPException': {'side_effect': SMTPException(' | '.join(invitation_to_retry['private_values']))},
                'RuntimeError': {'return_value': 0}}
    return request.param, failures[request.param]


@pytest.mark.parametrize('platform', [False, True])
def test_invitation_stores_only_hash(platform, fixed_now):
    """Guarda únicamente la huella del código con la duración de una invitación nueva."""
    # Falla si el código se almacena en claro o la invitación nueva no dura 48 horas.
    person, _, _ = setup_identity(platform)
    assert invitation(person) is True
    person.refresh_from_db()
    assert code() not in person.invite_code_hash
    assert person.invite_expires == fixed_now+timedelta(hours=48)


@pytest.mark.parametrize('platform', [False, True])
def test_activation_consumes_invitation(platform):
    """La activación permite entrar y consume definitivamente el código usado."""
    # Falla si activar no habilita el acceso, conserva el código o permite reutilizarlo.
    person, client, base = setup_identity(platform)
    invitation(person)
    data = {'login': person.username.upper(), 'code': code(), 'password': PASSWORD}
    assert client.post(base+'/activate', data, format='json').data == {'ok': True}
    person.refresh_from_db()
    assert person.activated is True
    assert person.invite_code_hash == ''
    assert client.post(base+'/activate', data, format='json').data['error'] == 'invalid_code'
    assert client.post(base+'/login', {'login': person.email.upper(), 'password': PASSWORD}, format='json').status_code == 200


@pytest.mark.parametrize('platform', [False, True])
def test_code_expires(platform):
    """Rechaza el código exactamente a partir de su vencimiento."""
    # Falla si se acepta un código a partir de su vencimiento.
    person, client, base = setup_identity(platform)
    invitation(person)
    value = code()
    person.refresh_from_db()
    with patch('accounts.services.timezone.now', return_value=person.invite_expires):
        response = client.post(base+'/activate', {'login': person.username, 'code': value, 'password': PASSWORD}, format='json')
    assert response.status_code == 400
    assert response.data['error'] == 'invalid_code'


@pytest.mark.parametrize('platform', [False, True])
def test_five_attempts_invalidate_code(platform):
    """Persiste cada rechazo y deshabilita el código al quinto intento fallido."""
    # Falla si los intentos no persisten al responder 400 o el sexto intento puede usar el código correcto.
    person, client, base = setup_identity(platform)
    invitation(person)
    value = code()
    responses = [client.post(base+'/activate', {'login': person.username, 'code': 'incorrecto', 'password': PASSWORD}, format='json')
                 for _ in range(5)]
    assert [response.status_code for response in responses] == [400]*5
    person.refresh_from_db()
    assert person.invite_attempts == 5
    assert person.invite_code_hash == ''
    assert client.post(base+'/activate', {'login': person.username, 'code': value, 'password': PASSWORD}, format='json').status_code == 400


@pytest.mark.parametrize('platform', [False, True])
def test_resend_at_sixty_seconds_resets_validity(platform):
    """Espera sesenta segundos entre envíos y limita la recuperación a treinta minutos."""
    # Falla si se envían códigos antes de sesenta segundos o «olvidé» conserva las 48 horas del alta.
    person, client, base = setup_identity(platform)
    invitation(person)
    person.refresh_from_db()
    now = person.invite_sent_at
    old_hash = person.invite_code_hash
    with patch('accounts.services.timezone.now', return_value=now+timedelta(seconds=59)):
        assert client.post(base+'/request_code', {'login': person.username}, format='json').data == {'ok': True}
    person.refresh_from_db()
    assert person.invite_code_hash == old_hash
    assert len(mail.outbox) == 1
    with patch('accounts.services.timezone.now', return_value=now+timedelta(seconds=60)):
        assert client.post(base+'/request_code', {'login': person.username}, format='json').data == {'ok': True}
    person.refresh_from_db()
    assert len(mail.outbox) == 2
    assert person.invite_expires == now+timedelta(minutes=31)
    assert client.post(base+'/request_code', {'login': 'desconocido'}, format='json').data == {'ok': True}


def test_reset_revokes_existing_session():
    """La recuperación reemplaza la contraseña y revoca la cookie anterior."""
    # Falla si una recuperación de contraseña deja utilizable la cookie anterior.
    person = account(organization())
    client = pos_client(person)
    invitation(person, reset=True)
    assert client.post('/api/pos/v1/auth/activate', {'login': person.username, 'code': code(), 'password': 'nueva-contraseña'}, format='json').status_code == 200
    assert client.get('/api/pos/v1/auth/me').status_code == 401


def test_successful_invitation_emits_no_warning(identity, caplog):
    """Reserva la advertencia para el fallo externo y confirma la entrega local."""
    # Falla si un correo entregado produce una advertencia indistinguible de un fallo.
    person, _, _ = identity
    with caplog.at_level(logging.WARNING, logger='accounts.services'):
        assert invitation(person) is True
    assert len(mail.outbox) == 1
    assert [record for record in caplog.records if record.name == 'accounts.services'] == []


def test_mail_failure_keeps_public_response(invitation_to_retry, mail_failure):
    """La entrada pública oculta el fallo externo igual que una cuenta desconocida."""
    # Falla si la recuperación devuelve un error que revela la cuenta o el estado del servidor de correo.
    context = invitation_to_retry
    _, send_behavior = mail_failure
    with patch('accounts.services.EmailMultiAlternatives.send', **send_behavior):
        response = context['client'].post(context['base']+'/request_code', {'login': context['person'].username}, format='json')
    assert response.status_code == 200
    assert response.data == {'ok': True}


def test_mail_failure_restores_previous_invitation(invitation_to_retry, mail_failure):
    """Revierte el código y conserva la identidad cuando el correo no se entrega."""
    # Falla si un correo fallido borra el código anterior, cambia la contraseña o deja un envío registrado.
    context = invitation_to_retry
    _, send_behavior = mail_failure
    with patch('accounts.services.EmailMultiAlternatives.send', **send_behavior):
        context['client'].post(context['base']+'/request_code', {'login': context['person'].username}, format='json')
    person = context['person']
    person.refresh_from_db()
    assert {field: getattr(person, field) for field in INVITATION_FIELDS} == context['previous']
    assert len(mail.outbox) == 1


def test_mail_failure_allows_immediate_retry(invitation_to_retry, mail_failure, fixed_now):
    """El rollback permite enviar de nuevo sin esperar otros sesenta segundos."""
    # Falla si el correo fallido bloquea el reintento o se envía un código con duración o contador incorrectos.
    context = invitation_to_retry
    _, send_behavior = mail_failure
    with patch('accounts.services.EmailMultiAlternatives.send', **send_behavior):
        context['client'].post(context['base']+'/request_code', {'login': context['person'].username}, format='json')
    person = context['person']
    assert invitation(person, reset=True) is True
    person.refresh_from_db()
    assert len(mail.outbox) == 2
    assert code() == '123456'
    assert person.invite_code_hash != context['previous']['invite_code_hash']
    assert person.invite_attempts == 0
    assert person.invite_sent_at == fixed_now
    assert person.invite_expires == fixed_now+timedelta(minutes=30)


def test_mail_failure_logs_safe_diagnosis(invitation_to_retry, mail_failure, caplog):
    """El diagnóstico distingue el fallo sin publicar datos personales ni secretos."""
    # Falla si el error no deja una señal útil o incluye identidad, código, enlace, mensaje o traceback.
    context = invitation_to_retry
    exception_type, send_behavior = mail_failure
    with caplog.at_level(logging.WARNING, logger='accounts.services'), patch('accounts.services.EmailMultiAlternatives.send', **send_behavior):
        context['client'].post(context['base']+'/request_code', {'login': context['person'].username}, format='json')
    records = [record for record in caplog.records if record.name == 'accounts.services']
    assert len(records) == 1
    record = records[0]
    assert record.levelno == logging.WARNING
    assert record.getMessage() == f'invitation_send_failed exception_type={exception_type}'
    assert record.exc_info is None
    assert record.stack_info is None
    assert re.search(context['private_pattern'], caplog.text+repr(record.__dict__)) is None
