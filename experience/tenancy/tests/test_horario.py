"""Plan D · Horario de atención de cada sede."""
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from tenancy.hours import status
from tenancy.models import OpeningHours
from tenancy.tests.helpers import account, organization, pos_client, restaurant

pytestmark = pytest.mark.django_db
URL = '/api/pos/v1/restaurants/{}/hours'
SEMANA = {str(d): [[11, 15], [18, 22]] for d in range(5)} | {'5': [[12, 24]], '6': []}


def a_las(org, day, hour):
    return datetime(2026, 10, day, hour, 0, tzinfo=ZoneInfo(org.timezone))


# Falla si una sede sin horario deja de tratarse como abierta (lo de antes), o si con horario no se sabe si está abierta,
# a qué hora cierra o cuándo abre (más tarde hoy, mañana o el lunes si el domingo no abre).
def test_estado_abierto_y_proxima_apertura():
    org = organization()
    local = restaurant(org)
    assert status(local) == {'configurado': False, 'abierto': True}
    OpeningHours.objects.create(restaurant=local, weekly=SEMANA, overrides=[{'date': '2026-10-12', 'ranges': [], 'note': 'Festivo'}])
    lunes_1630 = status(local, a_las(org, 5, 16))
    assert lunes_1630['abierto'] is False and lunes_1630['abre'] == {'cuando': 'hoy', 'hora': '6 p. m.', 'fecha': '2026-10-05'}
    assert status(local, a_las(org, 5, 12)) | {} == {'configurado': True, 'abierto': True, 'hoy': [[11, 15], [18, 22]], 'cierra': '3 p. m.'}
    viernes_23 = status(local, a_las(org, 9, 23))
    assert viernes_23['abre'] == {'cuando': 'mañana', 'hora': '12 m.', 'fecha': '2026-10-10'}
    domingo = status(local, a_las(org, 11, 13))
    # El domingo no abre y el lunes 12 es festivo: abre el martes.
    assert domingo['abierto'] is False and domingo['abre'] == {'cuando': 'el martes', 'hora': '11 a. m.', 'fecha': '2026-10-13'}


# Falla si otra persona que no es el dueño cambia el horario, si se aceptan franjas inválidas, si guardar no queda en el
# historial o si quitarlo no vuelve la sede a «siempre abierta».
def test_el_duenio_define_el_horario():
    org = organization()
    local = restaurant(org)
    dueno = pos_client(account(org))
    mesero = pos_client(account(org, role='waiter', username='mesero', restaurants=[local]))
    assert mesero.put(URL.format(local.pk), {'weekly': SEMANA}, format='json').status_code == 403
    malo = {**SEMANA, '0': [[15, 11]]}
    assert dueno.put(URL.format(local.pk), {'weekly': malo}, format='json').status_code == 400
    respuesta = dueno.put(URL.format(local.pk), {'weekly': SEMANA, 'overrides': [{'date': '2026-12-25', 'ranges': [], 'note': 'Navidad'}]}, format='json')
    assert respuesta.status_code == 200 and respuesta.data['hours']['overrides'][0]['note'] == 'Navidad'
    assert dueno.get(URL.format(local.pk)).data['hours']['weekly']['5'] == [[12.0, 24.0]]
    from tenancy.models import OrganizationAudit
    assert OrganizationAudit.objects.filter(organization=org, entity='tenancy.openinghours').exists()
    assert dueno.delete(URL.format(local.pk)).data == {'hours': None, 'status': {'configurado': False, 'abierto': True}}
    ajena = restaurant(organization('ajena'), slug='otra')
    assert dueno.get(URL.format(ajena.pk)).status_code == 404
