from unittest.mock import patch
from uuid import uuid4

import pytest

from experience_app.models import AgentCartSelection, AgentConversation, CartLine
from experience_app.tests.conftest import TABLE

pytestmark = pytest.mark.django_db
ROW = {'active': True, 'available_in_pos': True, 'sale_ok': True, 'attribute_line_ids': [],
       'type': 'consu', 'is_storable': False, 'qty_available': 0}


@pytest.fixture
def selection(api_client, two_diners, catalog_stub):
    session, ana, beto = two_diners
    message = uuid4()
    AgentConversation.objects.create(restaurant=session.restaurant_slug, venue=session.venue_slug,
        channel='menu', participant=str(ana.id), history=[{'id': str(message), 'lineas': [{'producto': 3}]}])
    api_client.cookies['waiter_diner'] = ana.key
    with patch('experience_app.services.agent_cart.resolve', return_value=TABLE), \
         patch('experience_app.views.sessions.discount_percent', return_value=0), \
         patch('experience_app.services.agent_cart.Client') as client:
        client.return_value.call_kw.return_value = [ROW]
        yield f'/api/v1/sesiones/{session.id}/asistente/agregar/', {
            'mensaje': str(message), 'producto': 3, 'cantidad': 2, 'nota': 'Sin cebolla'}, beto, client


# Falla si el asistente duplica una adición o usa precios ajenos al catálogo.
def test_adds_real_price_once_and_returns_cart(selection, api_client):
    url, body, _, client = selection
    response = api_client.post(url, body, format='json')
    assert response.status_code == 200
    assert response.data['carrito']['mio'] == 87822
    assert CartLine.objects.get().note == 'Sin cebolla'
    assert CartLine.objects.get().order_id is None
    assert api_client.post(url, body, format='json').status_code == 200
    assert CartLine.objects.count() == 1
    assert client.return_value.call_kw.call_count == 1
    assert api_client.post(url, {**body, 'cantidad': 3}, format='json').status_code == 400
    line = CartLine.objects.get()
    line.delete()
    assert api_client.post(url, body, format='json').status_code == 200
    assert CartLine.objects.count() == 0  # a retry after removal never resurrects the line


# Falla si otra persona puede usar una recomendación privada.
def test_other_diner_cannot_use_recommendation(selection, api_client):
    url, body, beto, _ = selection
    api_client.cookies['waiter_diner'] = beto.key
    assert api_client.post(url, body, format='json').status_code == 400
    assert not CartLine.objects.exists()
    api_client.cookies.clear()
    assert api_client.post(url, body, format='json').status_code == 404


# Falla si el asistente agrega platos inactivos, agotados o con opciones pendientes.
@pytest.mark.parametrize('patch_row', [{'attribute_line_ids': [1]}, {'type': 'combo'},
    {'is_storable': True, 'qty_available': 1}, {'active': False}])
# Falla si se añade al carrito del agente un producto con opciones, combo, existencias insuficientes o inactivo.
def test_rejects_options_sold_out_and_inactive(selection, api_client, patch_row):
    url, body, _, client = selection
    client.return_value.call_kw.return_value = [{**ROW, **patch_row}]
    assert api_client.post(url, body, format='json').status_code == 400
    assert not CartLine.objects.exists()
    assert not AgentCartSelection.objects.exists()


# Falla si el navegador puede imponer precios o productos no recomendados.
def test_cannot_supply_prices_or_unrecommended_products(selection, api_client):
    url, body, _, _ = selection
    for change in [{'precio': 0}, {'producto': 7}, {'cantidad': 0}, {'mensaje': str(uuid4())}]:
        assert api_client.post(url, {**body, **change}, format='json').status_code == 400
    assert not CartLine.objects.exists()
