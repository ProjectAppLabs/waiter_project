import pytest
from django.db import IntegrityError, transaction

from accounts.models import Account, Session
from tenancy.tests.helpers import account, organization, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/pos/v1'


def person_data(restaurants, **kwargs):
    return {'name': 'Sofía Mesera', 'email': 'sofia@ejemplo.co', 'role': 'waiter',
            'restaurant_ids': [r.id for r in restaurants], **kwargs}


def test_restaurant_limit_and_permissions():
    # Falla si el dueño rebasa su plan o un encargado crea restaurantes.
    org = organization(max_restaurants=1)
    client = pos_client(account(org))
    response = client.post(BASE+'/restaurants', {'name': 'Centro', 'slug': 'centro'}, format='json')
    assert response.status_code == 201, response.data
    assert client.post(BASE+'/restaurants', {'name': 'Norte', 'slug': 'norte'}, format='json').data['error'] == 'restaurant_limit'
    admin = account(org, 'admin', 'encargado', [org.restaurants.get()])
    assert pos_client(admin).post(BASE+'/restaurants', {'name': 'Norte', 'slug': 'norte'}, format='json').status_code == 403


def test_restaurant_edit_scope():
    # Falla si el encargado puede editar un restaurante que no tiene asignado.
    org = organization()
    rest, other = restaurant(org), restaurant(org, 'norte')
    client = pos_client(account(org, 'admin', 'encargado', [rest]))
    assert client.patch(BASE+f'/restaurants/{rest.id}', {'access_margin_minutes': 15}, format='json').status_code == 200
    assert client.patch(BASE+f'/restaurants/{other.id}', {'name': 'Cambiado'}, format='json').status_code == 404
    assert [r['id'] for r in client.get(BASE+'/restaurants').data['restaurants']] == [rest.id]


@pytest.mark.parametrize('role,count,ok', [('waiter', 0, False), ('waiter', 1, True), ('waiter', 2, False),
                                        ('cashier', 0, False), ('cashier', 1, True), ('cashier', 2, False),
                                        ('admin', 0, False), ('admin', 1, True), ('admin', 2, True),
                                        ('owner', 0, True), ('owner', 1, False)])
def test_restaurant_count_per_role(role, count, ok):
    # Falla si las asignaciones incumplen el número de restaurantes permitido por rol.
    org = organization()
    rests = [restaurant(org), restaurant(org, 'norte')]
    client = pos_client(account(org))
    response = client.post(BASE+'/team', person_data(rests[:count], role=role), format='json')
    assert response.status_code == (201 if ok else 400), response.data


def test_username_suggestion_suffix_and_immutable():
    # Falla si la propuesta no agrega .2 al colisionar o si se permite editar el usuario.
    org = organization()
    rest = restaurant(org)
    client = pos_client(account(org))
    first = client.post(BASE+'/team', person_data([rest]), format='json').data
    assert first['person']['username'] == 'sofia.mesera' and first['invite_sent']
    second = client.post(BASE+'/team', person_data([rest], email='otra@ejemplo.co'), format='json').data
    assert second['person']['username'] == 'sofia.mesera.2'
    assert client.patch(BASE+f'/team/{first["person"]["id"]}', {'username': 'cambio'}, format='json').status_code == 400


def test_admin_cannot_grant_owner_or_manage_other_restaurants():
    # Falla si el encargado cambia personas con asignaciones fuera de su alcance o concede dueño.
    org = organization()
    rest, other = restaurant(org), restaurant(org, 'norte')
    owner = account(org)
    admin = account(org, 'admin', 'encargado', [rest])
    elsewhere = account(org, 'admin', 'otra.persona', [rest, other])
    client = pos_client(admin)
    assert client.post(BASE+'/team', person_data([], role='owner'), format='json').status_code == 403
    assert client.post(BASE+'/team', person_data([other]), format='json').status_code == 403
    for person in (owner, elsewhere):
        assert client.patch(BASE+f'/team/{person.id}', {'name': 'Cambio'}, format='json').status_code == 403
        assert client.post(BASE+f'/team/{person.id}/deactivate').status_code == 403
        assert client.post(BASE+f'/team/{person.id}/resend_invite').status_code == 403
    assert {p['id'] for p in client.get(BASE+'/team').data['people']} == {admin.id}
    assert client.post(BASE+'/team', person_data([rest]), format='json').status_code == 201


def test_update_revokes_session_and_email_code():
    # Falla si al cambiar correo o rol sigue vivo el código anterior o una sesión con permisos antiguos.
    org = organization()
    rest = restaurant(org)
    owner = account(org)
    person = account(org, 'waiter', 'persona', [rest], invite_code_hash='anterior')
    pos_client(person)
    client = pos_client(owner)
    response = client.patch(BASE+f'/team/{person.id}', {'email': 'nuevo@ejemplo.co', 'role': 'cashier'}, format='json')
    assert response.status_code == 200, response.data
    person.refresh_from_db()
    assert not person.invite_code_hash and not Session.objects.filter(account=person).exists()
    assert person.attendances.get().check_out is not None


def test_deactivate_closes_access_and_self_protection():
    # Falla si la baja conserva acceso o si alguien desactiva su propia cuenta.
    org = organization()
    rest = restaurant(org)
    owner = account(org)
    worker = account(org, 'waiter', 'mesero', [rest])
    worker_client = pos_client(worker)
    client = pos_client(owner)
    assert client.post(BASE+f'/team/{owner.id}/deactivate').status_code == 400
    assert client.post(BASE+f'/team/{worker.id}/deactivate').status_code == 200
    assert worker_client.get(BASE+'/auth/me').status_code == 401
    assert worker.attendances.get().check_out is not None


@pytest.mark.parametrize('field,value', [('shift_start', -1), ('shift_start', 24), ('shift_end', 25),
                                        ('shift_start', True), ('email', 'sin-correo'), ('username', 'con-guion')])
def test_person_input_validation(field, value):
    # Falla si se guardan horas, correos o usuarios inválidos en la administración de personas.
    org = organization()
    rest = restaurant(org)
    client = pos_client(account(org))
    assert client.post(BASE+'/team', person_data([rest], **{field: value}), format='json').status_code == 400


def test_restaurants_must_belong_to_organization():
    # Falla si incluso el dueño asigna restaurantes de otro cliente.
    org = organization()
    rest = restaurant(organization('otro-cliente'))
    assert pos_client(account(org)).post(BASE+'/team', person_data([rest]), format='json').status_code == 400


def test_account_email_unique_per_org():
    # Falla si el correo se duplica por mayúsculas dentro de una organización o se prohíbe entre clientes distintos.
    org = organization()
    account(org)
    with pytest.raises(IntegrityError), transaction.atomic():
        account(org, username='otro', email='DUENO@EJEMPLO.CO')
    account(organization('otro-cliente'))
    assert Account.objects.count() == 2


def test_null_margin_returns_validation_error():
    # Falla si un margen nulo provoca un 500 en vez de una validación JSON.
    org = organization()
    rest = restaurant(org)
    client = pos_client(account(org))
    assert client.patch(BASE+f'/restaurants/{rest.id}', {'access_margin_minutes': None}, format='json').status_code == 400


@pytest.mark.parametrize('role', ['waiter', 'cashier'])
def test_operational_roles_cannot_manage_people(role):
    # Falla si un mesero o cajero obtiene acceso al equipo o a sus mutaciones.
    org = organization()
    rest = restaurant(org)
    person = account(org, role, 'operador', [rest])
    client = pos_client(person)
    assert client.get(BASE+'/team').status_code == 403
    assert client.post(BASE+'/team', person_data([rest]), format='json').status_code == 403
    assert client.patch(BASE+f'/team/{person.id}', {'role': 'admin'}, format='json').status_code == 403


def test_reserved_slugs_apply_only_to_organizations():
    # Falla si los identificadores reservados de subdominio se prohíben también dentro de un restaurante.
    client = pos_client(account(organization()))
    response = client.post(BASE+'/restaurants', {'name': 'Menú', 'slug': 'menu'}, format='json')
    assert response.status_code == 201
