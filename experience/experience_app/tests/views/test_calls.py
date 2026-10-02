from unittest.mock import patch

import pytest
from django.urls import reverse

PAYLOAD = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}


@pytest.fixture
def odoo_call():
    with patch('experience_app.services.sessions.Client'), patch('experience_app.services.sessions.pos.set_table_call') as call:
        yield call


# Falla si ocurre este error: que el salón no vea "pidiendo" ni "pide mesero": las llamadas deben viajar por el adaptador del sistema propio.
@pytest.mark.django_db
def test_opening_a_table_marks_it_ordering_and_calling_the_waiter_reaches_call(api_client, table_tenant, odoo_call):
    """Atrapa que el salón no vea "pidiendo" ni "pide mesero": las llamadas deben viajar por el adaptador del sistema propio."""
    sid = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']
    assert odoo_call.call_args.args[1:] == (9, 'ordering')
    response = api_client.post(reverse('call-waiter', args=[sid]), format='json')
    assert response.json() == {'ok': True}
    assert odoo_call.call_args.args[1:] == (9, 'assist')


# Falla si ocurre este error: una cuenta que sume lo no confirmado, o que "lo mío" y "dividir" salgan de datos distintos.
@pytest.mark.django_db
def test_requesting_the_bill_returns_all_mine_and_split(api_client, table_tenant, catalog_stub, odoo_call):
    """Atrapa una cuenta que sume lo no confirmado, o que "lo mío" y "dividir" salgan de datos distintos."""
    sid = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']
    api_client.post(reverse('add-line', args=[sid]), {'producto_id': 3, 'cantidad': 2}, format='json')
    body = api_client.post(reverse('request-bill', args=[sid]), format='json').json()
    assert body['ok'] is True
    assert (body['total'], body['mio'], body['partes']) == (0.0, 0.0, 1)
    assert odoo_call.call_args.args[1:] == (9, 'bill')


# Falla si ocurre este error: un comensal sin la marca del restaurante (color, fuente, saludo): vería Waiter, no el local.
@pytest.mark.django_db
def test_entry_carries_the_restaurant_brand(api_client, table_tenant, catalog_stub):
    """Atrapa un comensal sin la marca del restaurante (color, fuente, saludo): vería Waiter, no el local."""
    body = api_client.get(reverse('entry-table', args=['burger-house', 'poblado', '8H2KQ7'])).json()
    assert body['contexto']['marca']['nombre'] == 'Burger House'
    assert body['contexto']['marca']['color'] == '#7A2E2A'
