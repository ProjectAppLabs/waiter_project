from decimal import Decimal
from unittest.mock import patch
import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from django.db import DatabaseError
from experience_app.models import CartLine, DinerAccount, Order
from experience_app.services import benefits, discount, orders, sessions
from experience_app.tests.conftest import ANGUS, LIMONADA, TABLE
pytestmark = pytest.mark.django_db

@pytest.fixture
def table(two_diners, catalog_stub):
    session, ana, beto = two_diners
    sessions.add_line(session, ana, ANGUS, 2)
    sessions.add_line(session, beto, LIMONADA, 1)
    client = APIClient()
    client.cookies['waiter_diner'] = ana.key
    return session, ana, beto, client

@pytest.fixture
def rpc():
    def call(model, method, args):
        assert model == 'pos.config'
        if method == 'waiter_coupon_quote':
            if args[1].upper() != 'FOOD20' or args[2] < 10000:
                raise DatabaseError('Cupón inválido o compra mínima insuficiente.')
            return {'codigo': 'FOOD20', 'nombre': 'Comida', 'porcentaje': 20, 'monto': round(args[2] * .2, 2)}
        if method == 'waiter_diner_benefits':
            return {'tarjeta': 71, 'puntos': 0, 'ganados': 0}
        raise AssertionError(method)
    with patch('experience_app.services.benefits.tenant_for', return_value=TABLE), patch('experience_app.services.benefits.Client') as client:
        client.return_value.call_kw.side_effect = call
        yield client.return_value.call_kw

# Falla si el cupón descuenta consumo ajeno o montos enviados por el navegador.
def test_coupon_quotes_only_owner_consumption_and_ignores_client_amount(table, rpc):
    session, ana, _, client = table
    url = reverse('diner-coupon', args=[session.id])
    result = client.put(url, {'codigo': 'food20', 'monto': .01, 'porcentaje': 99}, format='json')
    assert result.status_code == 200
    data = result.json()
    assert data['descuento']['codigo'] == 'FOOD20'
    assert data['descuento']['monto'] == 17564.4
    assert data['total'] == float(ANGUS.final_price * 2 + LIMONADA.final_price)
    assert rpc.call_args.args[2][-1] == ANGUS.final_price * 2
    ana.refresh_from_db()
    assert ana.coupon_code == 'FOOD20'
    assert sessions.bill_summary(session, ana, include_open=True)['mio'] == 70257.6
    assert client.delete(url).status_code == 200
    ana.refresh_from_db()
    assert ana.coupon_code == ''

# Falla si un cupón inválido o una petición sin identidad modifica el pedido.
def test_invalid_coupon_missing_cookie_and_confirming_do_not_change_order(table, rpc):
    session, ana, _, client = table
    url = reverse('diner-coupon', args=[session.id])
    assert APIClient().put(url, {'codigo': 'FOOD20'}, format='json').status_code == 404
    assert client.put(url, {'codigo': 'INVALID'}, format='json').status_code == 400
    session.confirming = True
    session.save()
    assert client.put(url, {'codigo': 'FOOD20'}, format='json').status_code == 423
    ana.refresh_from_db()
    assert not ana.coupon_code

# Falla si el cupón se acumula con otro descuento o afecta a otra persona.
def test_coupon_snapshot_reaches_pos_without_stacking_or_affecting_other_diner(table, rpc):
    session, ana, beto, _ = table
    ana.coupon_code = 'FOOD20'
    ana.account = DinerAccount.objects.create(organization_slug='burger-house', name='Ana', email='ana@example.invalid', verified=True)
    ana.save()
    order = Order.objects.create(session=session)
    lines = list(sessions.open_lines(session))
    benefits.reserve(TABLE, lines)
    assert orders._first_purchase_discount(TABLE, ana, lines, order) == (Decimal(0), [])
    payload = orders._to_order_lines(order, lines)
    assert (payload[0].discount, payload[0].coupon_code, payload[0].loyalty_card_id) == (20, 'FOOD20', 71)
    assert (payload[1].discount, payload[1].loyalty_card_id) == (0, None)
    ana.account.refresh_from_db()
    assert ana.account.discount_order is None
    rpc.reset_mock()
    benefits.reserve(TABLE, list(sessions.open_lines(session)))
    rpc.assert_not_called()
    assert CartLine.objects.get(diner=ana).account_id == ana.account_id
    assert CartLine.objects.get(diner=beto).account_id is None

# Falla si un cupón que ya no cumple el mínimo se confirma sin aviso.
def test_changed_minimum_is_shown_and_blocks_confirmation(table, rpc):
    session, ana, _, client = table
    client.put(reverse('diner-coupon', args=[session.id]), {'codigo': 'FOOD20'}, format='json')
    ana.refresh_from_db()
    CartLine.objects.filter(diner=ana).update(final_unit_price=1)
    data = discount.view(list(sessions.open_lines(session)), ana, 5)
    assert not data['aplicable'] and data['error']
    from rest_framework.exceptions import ValidationError
    with pytest.raises(ValidationError):
        benefits.reserve(TABLE, list(sessions.open_lines(session)))
    assert not CartLine.objects.get(diner=ana).benefits_reserved

# Falla si los beneficios usan una cuenta enviada por el navegador.
def test_rewards_require_own_account_and_use_server_identity(table, rpc):
    _, ana, _, client = table
    url = reverse('diner-rewards', args=['burger-house', 'poblado'])
    with patch('experience_app.views.benefits.resolve', return_value=TABLE):
        assert client.get(url).status_code == 401
        ana.account = DinerAccount.objects.create(organization_slug='burger-house', name='Ana', email='ana@example.invalid', verified=True)
        ana.save()
        assert client.get(url, {'id': 'someone-else'}).json()['puntos'] == 0
        assert rpc.call_args.args[2][1]['id'] == str(ana.account_id)

# Falla si la ubicación pública omite datos locales o expone datos privados.
def test_location_exposes_only_configured_address_and_coordinates(table):
    _, _, _, client = table
    from tenancy.models import Restaurant
    Restaurant.objects.filter(slug='poblado').update(street='Calle 10', city='Medellín', latitude=0, longitude=0)
    response = client.get(reverse('venue-location', args=['burger-house', 'poblado']))
    assert response.json() == {'direccion': 'Calle 10, Medellín', 'latitud': 0, 'longitud': 0}
