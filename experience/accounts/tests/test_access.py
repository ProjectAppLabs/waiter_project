from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Attendance, Session
from accounts.services import access_window
from notifications.models import Notification
from tenancy.tests.helpers import PASSWORD, account, organization, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/pos/v1'


def at(hour, minute=0):
    return datetime(2026, 10, 1, hour, minute, tzinfo=dt_timezone.utc)


def test_public_org_unknown_and_suspended():
    # Falla si no se puede mostrar la marca y estado de una organización suspendida.
    client = APIClient()
    assert client.get(BASE+'/org').data['error'] == 'unknown_organization'
    org = organization(status='suspended')
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    response = client.get(BASE+'/org')
    assert response.status_code == 200 and response.data['organization']['status'] == 'suspended'
    assert response.data['organization']['brand']['brand_color'] == '#C1873A'


@pytest.mark.parametrize('login', ['DUENO', 'DUENO@EJEMPLO.CO'])
def test_login_identity_case_insensitive(login):
    # Falla si usuario o correo no resuelven la misma identidad sin distinguir mayúsculas.
    person = account(organization())
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=person.organization.slug)
    response = client.post(BASE+'/auth/login', {'login': login, 'password': PASSWORD}, format='json')
    assert response.status_code == 200
    assert response.data['account']['id'] == person.id
    assert response.data['account']['shift'] is None
    assert response.data['session_ends'].endswith('Z')
    cookie = response.cookies['waiter_sid']
    assert cookie['httponly'] and cookie['samesite'] == 'Lax'
    assert Session.objects.get().token_hash != cookie.value


@pytest.mark.parametrize('active,activated', [(True, False), (False, True)])
def test_unavailable_account_cannot_login(active, activated):
    # Falla si una cuenta pendiente o desactivada entra con una contraseña válida.
    person = account(organization(), active=active, activated=activated)
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=person.organization.slug)
    response = client.post(BASE+'/auth/login', {'login': person.username, 'password': PASSWORD}, format='json')
    assert response.status_code == 401 and response.data['error'] == 'invalid_credentials'


def test_outside_hours_notifies_only_management():
    # Falla si el rechazo no persiste avisos al dueño y encargado local, o los filtra a otros.
    org = organization()
    rest, other = restaurant(org), restaurant(org, 'norte')
    owner = account(org)
    admin = account(org, 'admin', 'encargado', [rest])
    account(org, 'admin', 'otro.encargado', [other])
    account(organization('otro-cliente'))
    worker = account(org, 'waiter', 'mateo', [rest], shift_start=14, shift_end=22)
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    with patch('accounts.services.timezone.now', return_value=at(4, 40)):
        response = client.post(BASE+'/auth/login', {'login': worker.username, 'password': PASSWORD}, format='json')
    assert response.status_code == 403
    assert response.data['error'] == 'outside_hours' and response.data['window'] == '14:00–22:00'
    assert set(Notification.objects.values_list('recipient_id', flat=True)) == {owner.id, admin.id}
    assert '23:40, fuera de su turno (14:00–22:00)' in Notification.objects.first().body
    assert not Session.objects.exists() and not Attendance.objects.exists()


@pytest.mark.parametrize('hour,minute,allowed', [(18, 29, False), (18, 30, True), (3, 0, True), (3, 30, False)])
def test_shift_margin_boundaries(hour, minute, allowed):
    # Falla si el margen no incluye el inicio o incluye indebidamente el fin de la ventana.
    org = organization()
    rest = restaurant(org)
    worker = account(org, 'cashier', 'cajero', [rest], shift_start=14, shift_end=22)
    assert access_window(worker, rest, at(hour, minute))['allowed'] is allowed


def test_midnight_shift():
    # Falla si un turno nocturno no reconoce la ventana comenzada el día anterior.
    org = organization()
    rest = restaurant(org)
    worker = account(org, 'waiter', 'mesero', [rest], shift_start=22, shift_end=6)
    result = access_window(worker, rest, at(7))
    assert result['allowed'] and result['end'] == at(11, 30)
    assert not access_window(worker, rest, at(17))['allowed']


@pytest.mark.parametrize('role,shift,expected_hours', [('owner', (14, 22), 16), ('admin', (14, 22), 16),
                                                     ('waiter', (None, None), 16), ('cashier', (0, 0), 16),
                                                     ('waiter', (14, 22), 8.5), ('cashier', (14, 22), 8.5)])
def test_session_end_by_role(role, shift, expected_hours):
    # Falla si dueño/encargado quedan restringidos o la sesión operativa sobrevive al fin de la ventana.
    org = organization()
    rest = restaurant(org)
    person = account(org, role, restaurants=[] if role == 'owner' else [rest], shift_start=shift[0], shift_end=shift[1])
    with patch('accounts.services.timezone.now', return_value=at(19)):
        client = pos_client(person)
        assert Session.objects.get().expires == at(19)+timedelta(hours=expected_hours)
        assert client.get(BASE+'/auth/me').status_code == 200


def test_me_does_not_open_attendance_logout_closes_it():
    # Falla si consultar sesión duplica asistencias o salir deja abierta la jornada.
    person = account(organization())
    client = pos_client(person)
    attendance = Attendance.objects.get()
    attendance.check_in = timezone.now()-timedelta(hours=2)
    attendance.save()
    assert client.get(BASE+'/auth/me').data['attendance_id'] == attendance.pk
    assert Attendance.objects.count() == 1
    response = client.post(BASE+'/auth/logout')
    assert response.status_code == 200 and response.data['worked_hours'] == pytest.approx(2, abs=0.01)
    attendance.refresh_from_db()
    assert attendance.check_out and not Session.objects.exists()
    assert client.get(BASE+'/auth/me').status_code == 401


def test_session_is_bound_to_organization():
    # Falla si una cookie permite leer datos de otra organización indicada por cabecera.
    person = account(organization())
    other = organization('otro-cliente')
    client = pos_client(person)
    client.credentials(HTTP_X_WAITER_ORG=other.slug)
    for path in ('auth/me', 'restaurants', 'team', 'notifications'):
        assert client.get(BASE+'/'+path).status_code == 401


def test_expired_session_closes_attendance_at_expiry():
    # Falla si una sesión vencida sigue operando o aumenta las horas trabajadas después de vencer.
    person = account(organization())
    client = pos_client(person)
    end = timezone.now()-timedelta(minutes=5)
    Session.objects.update(expires=end)
    assert client.get(BASE+'/auth/me').status_code == 401
    assert Attendance.objects.get().check_out == end


def test_change_password_wrong_current():
    # Falla si se puede cambiar la contraseña sin acreditar la actual.
    person = account(organization())
    client = pos_client(person)
    response = client.post(BASE+'/auth/change_password', {'current': 'incorrecta', 'next': 'contraseña-nueva'}, format='json')
    assert response.status_code == 403 and response.data['error'] == 'wrong_password'
    assert client.post(BASE+'/auth/change_password', {'current': PASSWORD, 'next': 'contraseña-nueva'}, format='json').status_code == 200


def test_login_cannot_select_other_restaurant():
    # Falla si el login acepta un restaurante ajeno a la asignación o a la organización.
    org = organization()
    rest, other = restaurant(org), restaurant(org, 'norte')
    person = account(org, 'waiter', 'mesero', [rest])
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    response = client.post(BASE+'/auth/login', {'login': person.username, 'password': PASSWORD, 'restaurant_id': other.id}, format='json')
    assert response.status_code == 403 and not Session.objects.exists()


@pytest.mark.parametrize('path,method,status', [('no-existe', 'get', 404), ('auth/login', 'get', 405),
                                              ('team/1', 'get', 405), ('restaurants/1', 'post', 405),
                                              ('notifications/read_all', 'get', 405)])
def test_invalid_routes_and_methods_return_json(path, method, status):
    # Falla si un método no contratado termina en HTML o provoca un error interno.
    response = getattr(APIClient(), method)(BASE+'/'+path)
    assert response.status_code == status and 'error' in response.data and 'message' in response.data


def test_foreign_origin_cannot_use_cookie():
    # Falla si un sitio ajeno puede ejecutar escrituras con la cookie autenticada.
    client = pos_client(account(organization()))
    assert client.post(BASE+'/auth/logout', HTTP_ORIGIN='https://ajeno.ejemplo.co').status_code == 403
    assert client.get(BASE+'/auth/me').status_code == 200
