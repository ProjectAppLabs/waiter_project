import pytest

from notifications.models import Notification
from tenancy.tests.helpers import account, organization, pos_client, restaurant

pytestmark = pytest.mark.django_db
BASE = '/api/pos/v1/notifications'


def test_own_general_and_cross_tenant_visibility():
    # Falla si se mezclan avisos privados, restaurantes ajenos o datos de otro cliente.
    org = organization()
    rest, other = restaurant(org), restaurant(org, 'norte')
    person = account(org, 'waiter', 'mesero', [rest])
    coworker = account(org, 'cashier', 'cajero', [rest])
    own = Notification.objects.create(organization=org, recipient=person, kind='system', title='Propio')
    general = Notification.objects.create(organization=org, restaurant=rest, kind='kitchen', title='General')
    hidden = [
        Notification.objects.create(organization=org, recipient=coworker, kind='system', title='Privado'),
        Notification.objects.create(organization=org, restaurant=other, kind='system', title='Otro local'),
        Notification.objects.create(organization=organization('otro-cliente'), kind='system', title='Otro cliente'),
    ]
    client = pos_client(person)
    assert {n['id'] for n in client.get(BASE).data['notifications']} == {own.id, general.id}
    assert client.post(BASE+f'/{own.id}/read').data == {'ok': True}
    own.refresh_from_db()
    assert own.read
    for row in hidden:
        assert client.post(BASE+f'/{row.id}/read').status_code == 404
    assert client.post(BASE+'/read_all').status_code == 200
    general.refresh_from_db()
    assert general.read and not Notification.objects.filter(pk__in=[n.id for n in hidden], read=True).exists()


def test_owner_sees_all_restaurant_general_notifications():
    # Falla si el dueño necesita asignaciones explícitas para ver avisos generales o el límite no se respeta.
    org = organization()
    rest, other = restaurant(org), restaurant(org, 'norte')
    for row in (rest, other):
        Notification.objects.create(organization=org, restaurant=row, kind='cash', title='Caja')
    client = pos_client(account(org))
    assert len(client.get(BASE).data['notifications']) == 2
    assert len(client.get(BASE+'?limit=1').data['notifications']) == 1
    assert client.get(BASE+'?limit=no').status_code == 400
