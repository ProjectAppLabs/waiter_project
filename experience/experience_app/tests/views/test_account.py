"""Cuenta del comensal: registro, verificación demo, perfil con historial, salir; y la cuenta que viaja con la cookie."""
from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.adapters.core.pos import PlacedOrder
from experience_app.models import Diner, DinerAccount, TableSession
from experience_app.tests.conftest import TABLE

PAYLOAD = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}
SIGNUP = {'nombre': 'Camila Rojas', 'correo': 'Camila@Correo.com', 'celular': '+57 310 555 4821', 'aceptaDatos': True, 'novedades': False}
REGISTER, VERIFY, PROFILE, LOGOUT = (reverse(n) for n in ('account-register', 'account-verify', 'account-profile', 'account-logout'))
SENT = PlacedOrder(id=13, reference='260-1-1', state='draft', total=87822, tax=14022, paid=0)


@pytest.fixture
def diner(api_client, table_tenant):
    return api_client.post(reverse('open-session'), PAYLOAD, format='json').json()


def signup(api_client, **overrides):
    account_id = api_client.post(REGISTER, {**SIGNUP, **overrides}, format='json').json()['id']
    return api_client.post(VERIFY, {'id': account_id, 'codigo': '123456'}, format='json')


# Falla si ocurre este error: un registro que no cree la cuenta, una verificación que no la ligue a la cookie, o un perfil sin sus datos.
@pytest.mark.django_db
def test_register_verify_and_read_the_profile(api_client, diner):
    """Atrapa un registro que no cree la cuenta, una verificación que no la ligue a la cookie, o un perfil sin sus datos."""
    created = api_client.post(REGISTER, SIGNUP, format='json')
    assert created.status_code == 201
    assert created.json()['codigoDemo'] is True
    account = DinerAccount.objects.get(id=created.json()['id'])
    assert (account.verified, account.email, account.accepts_data, account.marketing) == (False, 'camila@correo.com', True, False)
    assert api_client.get(PROFILE).status_code == 404  # pendiente de verificar: aún no hay cuenta en este dispositivo
    verified = api_client.post(VERIFY, {'id': str(account.id), 'codigo': '482913'}, format='json')
    assert verified.status_code == 200
    assert verified.json()['cuenta']['verificada'] is True
    assert Diner.objects.get(id=diner['comensal']['id']).account_id == account.id
    profile = api_client.get(PROFILE).json()
    assert (profile['cuenta']['nombre'], profile['cuenta']['celular'], profile['cuenta']['descuentoDisponible']) == ('Camila Rojas', '+57 310 555 4821', True)
    assert profile['pedidos'] == []


# Falla si ocurre este error: una cuenta sin nombre, con un correo roto o sin aceptar la política de datos (Ley 1581).
@pytest.mark.django_db
def test_registration_validates_the_three_fields_and_the_data_policy(api_client, diner):
    """Atrapa una cuenta sin nombre, con un correo roto o sin aceptar la política de datos (Ley 1581)."""
    def error(**overrides):
        response = api_client.post(REGISTER, {**SIGNUP, **overrides}, format='json')
        assert response.status_code == 400
        return response.json()['detail']

    assert 'nombre' in error(nombre='')
    assert 'correo' in error(correo='camila-arroba-correo')
    assert 'celular' in error(celular='abc')
    assert 'política de datos' in error(aceptaDatos=False)
    assert DinerAccount.objects.count() == 0


# Falla si ocurre este error: una verificación con cualquier texto (o con un id inventado) que ligue una cuenta.
@pytest.mark.django_db
def test_verification_demands_six_digits_and_a_known_account(api_client, diner):
    """Atrapa una verificación con cualquier texto (o con un id inventado) que ligue una cuenta."""
    account_id = api_client.post(REGISTER, SIGNUP, format='json').json()['id']
    assert api_client.post(VERIFY, {'id': account_id, 'codigo': '12345'}, format='json').status_code == 400
    assert api_client.post(VERIFY, {'id': account_id, 'codigo': 'abcdef'}, format='json').status_code == 400
    assert api_client.post(VERIFY, {'id': '00000000-0000-0000-0000-000000000000', 'codigo': '123456'}, format='json').status_code == 404
    assert Diner.objects.get(id=diner['comensal']['id']).account_id is None


# Falla si ocurre este error: una cuenta creada o leída sin comensal (la cookie es la única identidad).
@pytest.mark.django_db
def test_account_endpoints_need_the_diner_cookie(api_client, table_tenant):
    """Atrapa una cuenta creada o leída sin comensal (la cookie es la única identidad)."""
    assert api_client.post(REGISTER, SIGNUP, format='json').status_code == 404
    assert api_client.get(PROFILE).status_code == 404
    assert api_client.post(LOGOUT).status_code == 404


# Falla si otro dispositivo puede recuperar el perfil con un correo y seis dígitos.
@pytest.mark.django_db
def test_demo_never_recovers_an_existing_account(api_client, diner):
    """Falla si otro dispositivo puede recuperar el perfil con un correo y seis dígitos."""
    first = signup(api_client).json()['cuenta']['id']
    other = api_client.__class__()
    other.post(reverse('open-session'), PAYLOAD, format='json')
    assert other.post(REGISTER, SIGNUP, format='json').status_code == 400
    assert other.post(VERIFY, {'id': first, 'codigo': '123456'}, format='json').status_code == 400
    assert other.get(PROFILE).status_code == 404
    assert DinerAccount.objects.count() == 1


# Falla si ocurre este error: un "salir" que borre la cuenta (y con ella el historial) en vez de desligar la cookie.
@pytest.mark.django_db
def test_logout_unlinks_the_account_and_keeps_it_for_later(api_client, diner):
    """Atrapa un "salir" que borre la cuenta (y con ella el historial) en vez de desligar la cookie."""
    signup(api_client)
    assert api_client.post(LOGOUT).json() == {'ok': True}
    assert api_client.get(PROFILE).status_code == 404
    assert DinerAccount.objects.filter(verified=True).count() == 1


# Falla si ocurre este error: una cuenta perdida al volver otro día: el comensal nuevo de la misma cookie debe heredarla.
@pytest.mark.django_db
def test_the_account_travels_with_the_cookie_to_the_next_visit(api_client, diner):
    """Atrapa una cuenta perdida al volver otro día: el comensal nuevo de la misma cookie debe heredarla."""
    signup(api_client)
    TableSession.objects.filter(id=diner['sesion']['id']).update(state=TableSession.PAID)
    again = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()
    assert again['sesion']['id'] != diner['sesion']['id']
    assert api_client.get(PROFILE).status_code == 200


# Falla si ocurre este error: un historial vacío tras pedir, sin el total o sin el estado; o que muestre pedidos de mesas ajenas.
@pytest.mark.django_db
def test_history_lists_the_orders_of_every_session_the_account_took_part_in(api_client, diner, catalog_stub):
    """Atrapa un historial vacío tras pedir, sin el total o sin el estado; o que muestre pedidos de mesas ajenas."""
    signup(api_client)
    sid = diner['sesion']['id']
    api_client.post(reverse('add-line', args=[sid]), {'producto_id': 3, 'cantidad': 2}, format='json')
    with patch('experience_app.services.orders.resolve', return_value=TABLE), patch('experience_app.services.orders.Client'), \
            patch('experience_app.services.orders.pos.ensure_open_session', return_value=4), \
            patch('experience_app.services.orders.pos.create_order', return_value=SENT), \
            patch('experience_app.services.benefits.account_benefits', return_value={'tarjeta': 71}), \
            patch('experience_app.services.orders.pos.fire_course', return_value=21), patch('experience_app.services.orders.pos.set_table_call'):
        order_id = api_client.post(reverse('confirm', args=[sid]), format='json').json()['pedido']
    with patch('experience_app.services.account.Client') as client:
        client.return_value.call_kw.return_value = []
        history = api_client.get(PROFILE).json()['pedidos']
    assert len(history) == 1
    entry = history[0]
    assert (entry['id'], entry['total'], entry['mesa'], entry['estado'], entry['sede']) == (order_id, 83430.9, 8, 'pendiente_pago', 'poblado')
    assert (entry['mio'], entry['descuento']) == (83430.9, 4391.1)  # 5 % sobre mis 87.822
    TableSession.objects.filter(id=sid).update(state=TableSession.PAID)
    assert api_client.get(PROFILE).json()['pedidos'][0]['estado'] == 'pagado'
    stranger = api_client.__class__()
    stranger.post(reverse('open-session'), PAYLOAD, format='json')
    signup(stranger, correo='otro@correo.com')
    assert stranger.get(PROFILE).json()['pedidos'] == []  # misma mesa, otra cuenta: sin líneas suyas no es su pedido


# Falla si conocer el UUID permite verificar desde otra cookie o reutilizar el código.
@pytest.mark.django_db
def test_pending_code_is_bound_to_requesting_cookie_and_single_use(api_client, diner):
    """Falla si conocer el UUID permite verificar desde otra cookie o reutilizar el código."""
    pending = api_client.post(REGISTER, SIGNUP, format='json').json()['id']
    other = api_client.__class__()
    other.post(reverse('open-session'), PAYLOAD, format='json')
    data = {'id': pending, 'codigo': '123456'}
    assert other.post(VERIFY, data, format='json').status_code == 400
    assert api_client.post(VERIFY, data, format='json').status_code == 200
    assert api_client.post(VERIFY, data, format='json').status_code == 400


# Falla si habilitar demo permite registro o verificación en producción.
@pytest.mark.django_db
def test_demo_fails_closed_in_production(api_client, diner, settings):
    """Falla si habilitar demo permite registro o verificación en producción."""
    pending = api_client.post(REGISTER, SIGNUP, format='json').json()['id']
    settings.IS_PRODUCTION = True
    settings.DINER_DEMO_ENABLED = True
    assert api_client.post(REGISTER, SIGNUP, format='json').status_code == 503
    assert api_client.post(VERIFY, {'id': pending, 'codigo': '123456'}, format='json').status_code == 503
    assert not DinerAccount.objects.get(id=pending).verified


# Falla si el desafío puede usarse indefinidamente.
@pytest.mark.django_db
def test_demo_code_expires(api_client, diner):
    """Falla si el desafío puede usarse indefinidamente."""
    from django.utils import timezone
    pending = api_client.post(REGISTER, SIGNUP, format='json').json()['id']
    DinerAccount.objects.filter(id=pending).update(created_at=timezone.now() - timezone.timedelta(minutes=11))
    assert api_client.post(VERIFY, {'id': pending, 'codigo': '123456'}, format='json').status_code == 400


# Falla si el historial no actualiza pagos o incluye consumo de otras personas.
@pytest.mark.django_db
def test_history_refreshes_paid_orders_in_one_call_and_reports_only_own_total(api_client, diner, catalog_stub):
    from experience_app.models import Order, TableSession, Diner, CartLine
    from experience_app.services import account
    signup(api_client)
    person = Diner.objects.get(id=diner['comensal']['id'])
    session = person.session
    order = Order.objects.create(session=session, state=Order.SENT, odoo_order_id=900, total=50000)
    CartLine.objects.create(session=session, diner=person, order=order, status=CartLine.CONFIRMED, product_id=3, name='Mi plato', qty=1, unit_price=10000, discount=5)
    with patch('experience_app.services.account.resolve', return_value=TABLE), patch('experience_app.services.account.Client') as client:
        client.return_value.call_kw.return_value = [{'id': 900, 'state': 'paid'}]
        rows = account.history(person.account)
        client.return_value.call_kw.assert_called_once_with('pos.order', 'read', [[900], ['state']])
        assert (rows[0]['estado'], rows[0]['total'], rows[0]['totalMesa'], rows[0]['descuento']) == ('pagado', 9500, 50000, 500)
        session.refresh_from_db()
        assert session.state == TableSession.PAID
        account.history(person.account)
        assert client.return_value.call_kw.call_count == 1
