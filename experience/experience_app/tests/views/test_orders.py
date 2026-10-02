from unittest.mock import patch

import pytest
from django.urls import reverse

from django.db import OperationalError
from experience_app.adapters.core.pos import PlacedOrder, OrderStatus
from experience_app.models import CartLine, Order, TableSession
from experience_app.tests.conftest import TABLE

PAYLOAD = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}
SENT = PlacedOrder(id=13, reference='260-1-1', state='draft', total=87822, tax=14022, paid=0)


@pytest.fixture
def core_client():
    with patch('experience_app.services.orders.resolve', return_value=TABLE), patch('experience_app.services.orders.Client'), \
            patch('experience_app.services.orders.pos.ensure_open_session', return_value=4), \
            patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus('draft', 'none')), \
            patch('experience_app.services.orders.pos.create_order', return_value=SENT) as create, \
            patch('experience_app.services.orders.pos.fire_course', return_value=21) as fire, patch('experience_app.services.orders.pos.set_table_call'):
        yield create, fire


@pytest.fixture
def cart(api_client, table_tenant, catalog_stub):
    sid = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']
    api_client.post(reverse('add-line', args=[sid]), {'producto_id': 3, 'cantidad': 2}, format='json')
    return sid


# Falla si ocurre este error: un pedido que llega al sistema propio sin uuid (duplicable) o que no va a cocina.
@pytest.mark.django_db
def test_confirm_reserves_the_order_for_payment_without_firing_kitchen(api_client, cart, core_client):
    """Atrapa un pedido que llega al sistema propio sin uuid (duplicable) o que no va a cocina."""
    create, fire = core_client
    body = api_client.post(reverse('confirm', args=[cart]), format='json').json()
    assert create.call_args.kwargs['order_uuid'] == body['pedido']
    assert create.call_args.kwargs['table_id'] == 9
    fire.assert_not_called()
    assert create.call_args.kwargs['requires_payment'] is True
    assert body['estado'] == 'pendiente_pago'
    assert Order.objects.get().state == Order.CHECKOUT
    assert Order.objects.get().sent_at is None
    assert body['total'] == 87822.0
    assert CartLine.objects.filter(status=CartLine.CONFIRMED).count() == 1


# Falla si ocurre este error: un carrito perdido por una caída del sistema propio, o un reintento que crea otro pedido.
@pytest.mark.django_db
def test_when_core_is_down_the_cart_survives_and_the_retry_reuses_the_uuid(api_client, cart, core_client):
    """Atrapa un carrito perdido por una caída del sistema propio, o un reintento que crea otro pedido."""
    create, _ = core_client
    create.side_effect = [OperationalError('down'), SENT]
    first = api_client.post(reverse('confirm', args=[cart]), format='json')
    assert first.status_code == 503
    assert CartLine.objects.filter(status=CartLine.OPEN).count() == 1
    retry = api_client.post(reverse('confirm', args=[cart]), format='json').json()
    assert str(Order.objects.get().id) == retry['pedido']
    assert create.call_args_list[0].kwargs['order_uuid'] == create.call_args_list[1].kwargs['order_uuid']


# Falla si ocurre este error: el doble toque en "confirmar": el segundo no debe llegar al sistema propio.
@pytest.mark.django_db
def test_confirming_twice_without_new_lines_returns_the_same_order_without_calling_call(api_client, cart, core_client):
    """Atrapa el doble toque en "confirmar": el segundo no debe llegar al sistema propio."""
    create, _ = core_client
    first = api_client.post(reverse('confirm', args=[cart]), format='json').json()
    again = api_client.post(reverse('confirm', args=[cart]), format='json')
    assert again.status_code == 200
    assert again.json()['pedido'] == first['pedido']
    assert create.call_count == 1


# Falla si ocurre este error: un estado del pedido que no refleje lo que cocina marcó.
@pytest.mark.django_db
@patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus(state='paid', kitchen='ready'))
def test_order_status_maps_core_state_and_kitchen_phase(read, api_client, cart, core_client):
    """Atrapa un estado del pedido que no refleje lo que cocina marcó."""
    order_id = api_client.post(reverse('confirm', args=[cart]), format='json').json()['pedido']
    body = api_client.get(reverse('order-detail', args=[order_id])).json()
    assert body['estado'] == 'listo'
    assert body['total'] == 87822.0


# Falla si ocurre este error: el IDOR: con el uuid del pedido, alguien de otra mesa no debe ver su estado.
@pytest.mark.django_db
def test_order_detail_requires_a_diner_of_that_table(api_client, cart, core_client):
    """Atrapa el IDOR: con el uuid del pedido, alguien de otra mesa no debe ver su estado."""
    order_id = api_client.post(reverse('confirm', args=[cart]), format='json').json()['pedido']
    stranger = api_client.__class__()
    assert stranger.get(reverse('order-detail', args=[order_id])).status_code == 404


# Falla si a un pedido que el salón ya cobró se le pueden seguir agregando líneas, o si la mesa no vuelve a empezar limpia.
@pytest.mark.django_db
@patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus(state='paid', kitchen='served'))
def test_a_paid_bill_ends_the_visit_and_the_next_tap_opens_a_new_session(read, api_client, cart, core_client):
    api_client.post(reverse('confirm', args=[cart]), format='json')
    api_client.post(reverse('add-line', args=[cart]), {'producto_id': 7}, format='json')
    response = api_client.post(reverse('confirm', args=[cart]), format='json')
    assert response.status_code == 409
    assert TableSession.objects.get(id=cart).state == TableSession.PAID
    again = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()
    assert again['sesion']['id'] != cart


# Falla si el siguiente comensal de la mesa hereda la sesión (y el carrito) de una cuenta que el salón ya cobró.
@pytest.mark.django_db
@patch('experience_app.services.sessions.pos.read_order_status', return_value=OrderStatus(state='paid', kitchen='served'))
def test_the_next_tap_after_the_floor_charged_the_bill_starts_a_clean_session(read, api_client, cart, core_client):
    api_client.post(reverse('confirm', args=[cart]), format='json')
    again = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()
    assert again['sesion']['id'] != cart
    assert TableSession.objects.get(id=cart).state == TableSession.PAID
    assert api_client.get(reverse('cart', args=[again['sesion']['id']])).json()['lineas'] == []

# Falla si un pedido sin pagar aparece en preparación.
@pytest.mark.django_db
@patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus(state='draft', kitchen='none'))
def test_unpaid_checkout_reports_pending_and_never_preparation(read,api_client,cart,core_client):
    oid=api_client.post(reverse('confirm',args=[cart]),format='json').json()['pedido']
    assert api_client.get(reverse('order-detail',args=[oid])).json()['estado']=='pendiente_pago'
    core_client[1].assert_not_called()

# Falla si el prepago cierra la visita mientras se prepara el pedido.
@pytest.mark.django_db
@patch('experience_app.services.sessions.pos.read_order_status', return_value=OrderStatus(state='paid', kitchen='cooking'))
def test_prepayment_keeps_the_visit_while_the_customer_waits(read,api_client,cart,core_client):
    api_client.post(reverse('confirm',args=[cart]),format='json')
    same=api_client.post(reverse('open-session'),PAYLOAD,format='json').json()
    assert same['sesion']['id']==cart
    assert TableSession.objects.get(id=cart).state==TableSession.CONFIRMED


# Falla si las notas se mezclan entre personas o se pierden al reintentar.
@pytest.mark.django_db
def test_checkout_notes_are_personal_and_survive_remote_retry(api_client, cart, core_client):
    from experience_app.models import Diner
    create, _ = core_client
    mine = CartLine.objects.get(session_id=cart)
    mine.note = 'Sin cebolla'
    mine.save()
    other_diner = Diner.objects.create(session_id=cart, name='Otro')
    other = CartLine.objects.create(session_id=cart, diner=other_diner, product_id=7, name='Otro plato', unit_price=10, allergens='Leche')
    create.side_effect = [OperationalError('down'), SENT]
    url = reverse('confirm', args=[cart])
    assert api_client.post(url, {'notas':'Salsa aparte', 'alergenos':'Maní'}, format='json').status_code == 503
    mine.refresh_from_db(); other.refresh_from_db()
    assert mine.note == 'Sin cebolla' and mine.checkout_note == 'Salsa aparte' and mine.allergens == 'Maní'
    assert other.allergens == 'Leche' and other.checkout_note == ''
    assert api_client.post(url, {'notas':'Cambio tardío', 'alergenos':''}, format='json').status_code == 201
    first = create.call_args_list[0].kwargs['lines']
    retry = create.call_args_list[1].kwargs['lines']
    assert [line.note for line in first] == [line.note for line in retry]
    assert any('Sin cebolla' in line.note and 'Salsa aparte' in line.note and 'ALERGIAS / ALÉRGENOS: Maní' in line.note for line in retry)


# Falla si se aceptan notas o alérgenos inválidos.
@pytest.mark.django_db
def test_checkout_rejects_invalid_allergen_and_note_input(api_client, cart, core_client):
    for data in [{'alergenos': ['Maní']}, {'notas': 'x'*501}]:
        assert api_client.post(reverse('confirm', args=[cart]), data, format='json').status_code == 400
    core_client[0].assert_not_called()
