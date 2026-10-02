from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.adapters.core.context import RestaurantNotFound


# Falla si ocurre este error: una entrada de mesa sin su número o sin carta.
@pytest.mark.django_db
def test_table_entry_returns_context_and_menu(api_client, table_tenant, catalog_stub):
    """Atrapa una entrada de mesa sin su número o sin carta."""
    body = api_client.get(reverse('entry-table', args=['burger-house', 'poblado', '8H2KQ7'])).json()
    assert body['contexto']['mesa'] == {'numero': 8, 'token': '8H2KQ7'}
    assert body['carta']['categorias'][0]['nombre'] == 'Bebidas'


# Falla si ocurre este error: un token revocado que responda con un 500 o con la carta de otro.
@pytest.mark.django_db
@patch('experience_app.views.context.resolve', side_effect=RestaurantNotFound())
def test_unknown_table_says_it_is_unavailable(resolve, api_client):
    """Atrapa un token revocado que responda con un 500 o con la carta de otro."""
    response = api_client.get(reverse('entry-table', args=['burger-house', 'poblado', 'NOPE']))
    assert response.status_code == 404
    assert response.json()['detail'] == 'Esta mesa no está disponible'


# Falla si ocurre este error: dos sesiones para la misma mesa, o un comensal que pierde su identidad al volver a tocar el NFC.
@pytest.mark.django_db
def test_everyone_who_taps_the_table_shares_one_session_and_keeps_their_cookie(api_client, table_tenant):
    """Atrapa dos sesiones para la misma mesa, o un comensal que pierde su identidad al volver a tocar el NFC."""
    payload = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}
    first = api_client.post(reverse('open-session'), payload, format='json').json()
    again = api_client.post(reverse('open-session'), payload, format='json').json()
    other = api_client.__class__().post(reverse('open-session'), payload, format='json').json()
    assert first['sesion']['id'] == again['sesion']['id'] == other['sesion']['id']
    assert first['comensal']['id'] == again['comensal']['id']
    assert other['comensal']['id'] != first['comensal']['id']
