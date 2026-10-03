from zoneinfo import ZoneInfo
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account, Attendance, Session
from tenancy.models import Organization, PlatformAudit, PlatformSession, PlatformUser
from tenancy.validators import validate_slug, validate_username
from .helpers import PASSWORD, account, organization, platform_client, platform_user, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/platform/v1'


def body(**kwargs):
    return {'name': 'Nuevo cliente', 'slug': 'nuevo-cliente',
            'owner': {'name': 'Sofía Mesera', 'email': 'sofia@ejemplo.co'}, **kwargs}


@pytest.mark.parametrize('slug', ['a', 'a'*41, 'Mayuscula', 'con espacio', 'con--guion', '-inicio', 'fin-',
                                  'plataforma', 'www', 'api', 'menu', 'admin', 'app'])
def test_invalid_slug(slug):
    # Falla si se aceptan formatos o identificadores reservados del contrato.
    with pytest.raises(ValidationError):
        validate_slug(slug)


@pytest.mark.parametrize('username', ['ab', 'a'*33, 'MAYUSCULAS', 'con-guion', 'con espacio', 'sofía'])
def test_invalid_username(username):
    # Falla si un usuario sale del alfabeto y longitud pactados.
    with pytest.raises(ValidationError):
        validate_username(username)


def test_create_organization_invites_owner_and_audits():
    # Falla si el alta no crea dueño, propuesta normalizada, correo y auditoría en conjunto.
    user = platform_user()
    client = platform_client(user)
    response = client.post(BASE+'/organizations', body(monthly_price=450000), format='json')
    assert response.status_code == 201, response.data
    org = Organization.objects.get(slug='nuevo-cliente')
    owner = org.accounts.get()
    assert owner.username == 'sofia.mesera' and owner.role == 'owner'
    assert not owner.activated and not owner.restaurants.exists()
    assert response.data['invite_sent'] is True
    assert response.data['organization']['monthly_price'] == 450000
    assert len(mail.outbox) == 1
    assert 'codigo=sofia.mesera' in mail.outbox[0].alternatives[0].content
    assert PlatformAudit.objects.get().action == 'organization.created'
    detail = client.get(BASE+'/organizations/nuevo-cliente').data
    assert detail['owner']['status'] == 'pending'
    assert detail['audit'][0]['actor'] == user.id


def test_creation_survives_mail_failure():
    # Falla si un error del correo borra al cliente o deja un código que impide reintentar.
    client = platform_client(platform_user())
    with patch('accounts.services.EmailMultiAlternatives.send', side_effect=OSError('sin correo')):
        response = client.post(BASE+'/organizations', body(), format='json')
    assert response.status_code == 201 and response.data['invite_sent'] is False
    owner = Account.objects.get()
    assert Organization.objects.count() == 1 and owner.invite_code_hash == ''
    assert owner.invite_sent_at is None
    assert client.post(BASE+'/organizations/nuevo-cliente/resend_invite').data['sent'] is True


def test_invalid_owner_rolls_back_organization():
    # Falla si los datos inválidos del dueño dejan una organización huérfana.
    client = platform_client(platform_user())
    response = client.post(BASE+'/organizations', body(owner={'name': 'Ana', 'email': 'inválido'}), format='json')
    assert response.status_code == 400
    assert not Organization.objects.exists() and not PlatformAudit.objects.exists()


def test_platform_cookie_and_logout():
    # Falla si el token se guarda sin hash, dura más de 12 horas o continúa vivo tras salir.
    user = platform_user()
    client = platform_client(user)
    cookie = client.cookies['waiter_platform_sid']
    session = PlatformSession.objects.get()
    assert cookie['httponly'] and cookie['samesite'] == 'Lax'
    assert len(cookie.value) == 64 and session.token_hash != cookie.value
    assert timedelta(hours=11, minutes=59) < session.expires-timezone.now() <= timedelta(hours=12)
    assert client.get(BASE+'/auth/me').data['user']['id'] == user.id
    assert client.post(BASE+'/auth/logout').data == {'ok': True}
    assert client.get(BASE+'/auth/me').status_code == 401


@pytest.mark.parametrize('login', ['PROJECTAPP', 'PROJECTAPP@PROJECTAPP.CO'])
def test_platform_case_insensitive_login(login):
    # Falla si la plataforma distingue mayúsculas en el usuario o el correo.
    platform_user()
    response = APIClient().post(BASE+'/auth/login', {'login': login, 'password': PASSWORD}, format='json')
    assert response.status_code == 200


def test_suspend_revokes_sessions_and_attendance():
    # Falla si suspender permite seguir operando o reactivar recupera tokens antiguos.
    org = organization()
    person = account(org)
    pos = pos_client(person)
    token = pos.cookies['waiter_sid'].value
    client = platform_client(platform_user())
    assert client.post(BASE+'/organizations/burger-house/suspend', {'reason': 'Pago pendiente'}, format='json').status_code == 200
    assert not Session.objects.exists()
    assert Attendance.objects.get().check_out is not None
    for path in ('/auth/me', '/restaurants', '/team', '/notifications'):
        assert pos.get('/api/pos/v1'+path).data['error'] == 'organization_suspended'
    assert pos.post('/api/pos/v1/auth/login', {'login': person.username, 'password': PASSWORD}, format='json').status_code == 403
    assert client.post(BASE+'/organizations/burger-house/reactivate').data['organization']['status'] == 'active'
    pos.cookies['waiter_sid'] = token
    assert pos.get('/api/pos/v1/auth/me').status_code == 401
    assert set(PlatformAudit.objects.values_list('action', flat=True)) == {'organization.suspended', 'organization.reactivated'}


def test_operator_permissions():
    # Falla si un operador suspende clientes o administra el personal interno, o pierde las altas autorizadas.
    org = organization()
    user = platform_user(role='operator')
    client = platform_client(user)
    assert client.get(BASE+'/team').status_code == 200
    assert client.get(BASE+'/organizations').status_code == 200
    assert client.post(BASE+'/organizations', body(), format='json').status_code == 201
    assert client.patch(BASE+'/organizations/'+org.slug, {'plan': 'pro'}, format='json').status_code == 200
    for action in ('suspend', 'reactivate'):
        assert client.post(BASE+f'/organizations/{org.slug}/{action}', {'reason': 'Prueba'}, format='json').status_code == 403
    assert client.post(BASE+'/team', {'name': 'Ana', 'email': 'ana@ejemplo.co', 'role': 'admin'}, format='json').status_code == 403
    assert client.post(BASE+f'/team/{user.id}/deactivate').status_code == 403
    assert client.post(BASE+f'/team/{user.id}/resend_invite').status_code == 403


def test_team_invite_deactivate_and_audit():
    # Falla si el alta interna expone secretos, no envía enlace de plataforma o la baja deja acceso.
    client = platform_client(platform_user())
    response = client.post(BASE+'/team', {'name': 'Ana Pérez', 'email': 'ana@ejemplo.co', 'role': 'operator'}, format='json')
    assert response.status_code == 201, response.data
    user = PlatformUser.objects.get(username='ana.perez')
    assert '/login?codigo=ana.perez' in mail.outbox[0].alternatives[0].content
    assert 'password' not in response.data['user'] and 'invite_code_hash' not in response.data['user']
    assert client.post(BASE+f'/team/{user.id}/deactivate').status_code == 200
    user.refresh_from_db()
    assert not user.active and not user.invite_code_hash
    assert set(PlatformAudit.objects.values_list('action', flat=True)) == {'platform_user.invited', 'platform_user.deactivated'}


@pytest.mark.parametrize('field,value', [('slug', 'otro-slug'), ('status', 'active'), ('max_restaurants', 0),
                                         ('timezone', 'No/Existe'), ('monthly_price', -1), ('id', 'otro')])
def test_invalid_organization_patch(field, value):
    # Falla si editar permite saltarse las acciones de estado o las validaciones de plan.
    org = organization()
    client = platform_client(platform_user())
    assert client.patch(BASE+'/organizations/'+org.slug, {field: value}, format='json').status_code == 400


def test_audit_last_fifty():
    # Falla si el detalle expone auditorías de otra organización o más de cincuenta eventos.
    org, other = organization(), organization('otro-cliente')
    actor = platform_user()
    PlatformAudit.objects.bulk_create([PlatformAudit(actor=actor, organization=org, action='organization.updated') for _ in range(55)])
    PlatformAudit.objects.create(actor=actor, organization=other, action='organization.suspended')
    response = platform_client(actor).get(BASE+'/organizations/'+org.slug)
    assert len(response.data['audit']) == 50
    assert all(row['organization'] == str(org.pk) for row in response.data['audit'])


def test_platform_admin_command():
    # Falla si el comando guarda la contraseña en claro o deja sin invitación al administrador pendiente.
    call_command('create_platform_admin', name='Uno', email='uno@ejemplo.co', username='uno', password=PASSWORD, stdout=StringIO())
    user = PlatformUser.objects.get(username='uno')
    assert user.activated and user.password != PASSWORD
    call_command('create_platform_admin', name='Dos', email='dos@ejemplo.co', username='dos', stdout=StringIO())
    user = PlatformUser.objects.get(username='dos')
    assert not user.activated and user.invite_code_hash


def test_email_uniqueness_database():
    # Falla si la base permite correos equivalentes por mayúsculas en ProjectApp.
    platform_user()
    with pytest.raises(IntegrityError), transaction.atomic():
        platform_user(username='otro', email='PROJECTAPP@PROJECTAPP.CO')


@pytest.mark.parametrize('value', [42, [], {}, True])
def test_malformed_date_is_json_error(value):
    # Falla si un tipo ajeno al contrato de fecha causa un error interno al crear la organización.
    client = platform_client(platform_user())
    response = client.post(BASE+'/organizations', body(trial_ends=value), format='json')
    assert response.status_code == 400 and response.data['error'] == 'invalid_data'
    assert not Organization.objects.exists()


def test_platform_deactivation_revokes_cookie():
    # Falla si una persona de ProjectApp desactivada puede seguir usando su sesión anterior.
    admin = platform_user()
    operator = platform_user(role='operator', username='operador')
    operator_client = platform_client(operator)
    assert platform_client(admin).post(BASE+f'/team/{operator.id}/deactivate').status_code == 200
    assert operator_client.get(BASE+'/auth/me').status_code == 401
    assert not PlatformSession.objects.filter(user=operator).exists()


def test_status_follows_trial_date():
    # Falla si una organización sin fecha de prueba nace en prueba (el asistente promete que nace activa), si con fecha
    # no nace en prueba, si al reactivarla no vuelve a prueba mientras su fecha siga vigente, o si la prueba depende de
    # la hora a la que se corra.
    client = platform_client(platform_user())
    active = client.post(BASE+'/organizations', body(), format='json').data['organization']
    assert active['status'] == 'active'
    future = (timezone.localdate() + timedelta(days=15)).isoformat()
    trial = client.post(BASE+'/organizations', body(slug='en-prueba', trial_ends=future), format='json').data['organization']
    assert trial['status'] == 'trial'
    client.post(BASE+'/organizations/en-prueba/suspend', {'reason': 'prueba'}, format='json')
    assert client.post(BASE+'/organizations/en-prueba/reactivate', format='json').data['organization']['status'] == 'trial'
    # «Ayer» en la zona de la organización, como compara el servidor (en UTC ya es mañana desde las 19:00 de Bogotá).
    org = Organization.objects.get(slug='en-prueba')
    org_today = timezone.now().astimezone(ZoneInfo(org.timezone)).date()
    Organization.objects.filter(pk=org.pk).update(trial_ends=org_today - timedelta(days=1))
    client.post(BASE+'/organizations/en-prueba/suspend', {'reason': 'prueba'}, format='json')
    assert client.post(BASE+'/organizations/en-prueba/reactivate', format='json').data['organization']['status'] == 'active'


@pytest.mark.parametrize('origin, allowed', [('http://localhost:3000', True), ('http://frisby.localhost:3000', True),
                                             ('https://frisby.localhost:3000', False), ('http://malo.com', False), ('http://localhost:3001', False)])
def test_write_origin_accepts_pos_subdomains(origin, allowed):
    # Falla si una organización que entra por su subdominio no puede escribir, o si cualquier otro origen sí puede.
    user = platform_user()
    client = APIClient()
    response = client.post(BASE+'/auth/login', {'login': user.username, 'password': PASSWORD}, format='json', HTTP_ORIGIN=origin)
    assert (response.status_code == 200) is allowed, response.data
