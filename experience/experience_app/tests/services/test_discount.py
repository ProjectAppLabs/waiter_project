"""Descuento de primera compra: se aplica de verdad al confirmar, una sola vez, solo sobre las líneas del comensal."""
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from django.utils import timezone

from django.db import OperationalError
from experience_app.adapters.core.pos import PlacedOrder, OrderStatus
from experience_app.models import CartLine, DinerAccount
from experience_app.services import discount, sessions
from experience_app.tests.conftest import ANGUS, LIMONADA, TABLE

PAYLOAD = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}
SENT = PlacedOrder(id=13, reference='260-1-1', state='draft', total=87822, tax=14022, paid=0)


def verified_account(diner, **fields):
    defaults = {'name': 'Camila', 'email': f'camila-{diner.id}@correo.com', 'accepts_data': True, 'verified': True, 'verified_at': timezone.now()}
    account = DinerAccount.objects.create(organization_slug='burger-house', **{**defaults, **fields})
    diner.account = account
    diner.save(update_fields=['account'])
    return account


@pytest.fixture
def core_client():
    with patch('experience_app.services.orders.resolve', return_value=TABLE), patch('experience_app.services.orders.Client'), \
            patch('experience_app.services.orders.pos.ensure_open_session', return_value=4), \
            patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus('draft', 'none')), \
            patch('experience_app.services.orders.pos.create_order', return_value=SENT) as create, \
            patch('experience_app.services.benefits.account_benefits', return_value={'tarjeta': 71}), \
            patch('experience_app.services.orders.pos.fire_course', return_value=21), patch('experience_app.services.orders.pos.set_table_call'):
        yield create


@pytest.fixture
def table(two_diners, catalog_stub):
    session, ana, beto = two_diners
    sessions.add_line(session, ana, ANGUS, 2)
    sessions.add_line(session, beto, LIMONADA, 1)
    return session, ana, beto


def sent_lines(create):
    return {line.name: line.discount for line in create.call_args.kwargs['lines']}


# Falla si ocurre este error: un descuento que no llegue al sistema propio, que se aplique a las líneas de otro comensal, o que se pueda repetir.
@pytest.mark.django_db
def test_confirming_with_a_verified_account_discounts_only_my_lines_and_uses_it_up(table, core_client):
    """Atrapa un descuento que no llegue al sistema propio, que se aplique a las líneas de otro comensal, o que se pueda repetir."""
    from experience_app.services import orders
    session, ana, beto = table
    account = verified_account(ana)
    orders.confirm(session, ana)
    assert sent_lines(core_client) == {'Hamburguesa Angus': 5.0, 'Limonada de Coco': 0.0}
    account.refresh_from_db()
    assert account.discount_used_at is None and account.discount_order_id is not None
    assert not discount.applicable(ana)  # la cuenta cacheada antes de reservar no habilita otra proyección
    assert CartLine.objects.get(diner=ana).discount == Decimal('5.00')
    # Segunda ronda: la misma cuenta ya no descuenta, y la línea vieja viaja de nuevo CON su descuento (mismo uuid).
    sessions.add_line(session, ana, LIMONADA, 1)
    orders.confirm(session, ana)
    lines = core_client.call_args.kwargs['lines']
    assert [(line.name, line.discount) for line in lines] == [('Hamburguesa Angus', 5.0), ('Limonada de Coco', 0.0), ('Limonada de Coco', 0.0)]


# Falla si ocurre este error: el descuento de Ana aplicado porque confirmó Beto (o viceversa).
@pytest.mark.django_db
def test_the_confirming_diner_is_who_gets_the_discount(table, core_client):
    """Atrapa el descuento de Ana aplicado porque confirmó Beto (o viceversa)."""
    from experience_app.services import orders
    session, ana, beto = table
    verified_account(ana)
    orders.confirm(session, beto)
    assert sent_lines(core_client) == {'Hamburguesa Angus': 0.0, 'Limonada de Coco': 0.0}
    assert DinerAccount.objects.get().discount_used_at is None


# Falla si ocurre este error: un descuento para una cuenta pendiente, ya usada, o con el porcentaje en 0 en el POS.
@pytest.mark.django_db
def test_no_discount_without_a_verified_account_or_when_already_used_or_switched_off(table, core_client):
    """Atrapa un descuento para una cuenta pendiente, ya usada, o con el porcentaje en 0 en el POS."""
    from experience_app.services import orders
    session, ana, _ = table
    account = verified_account(ana, verified=False)
    orders.confirm(session, ana)
    assert sent_lines(core_client)['Hamburguesa Angus'] == 0.0
    account.verified, account.discount_used_at = True, timezone.now()
    account.save()
    sessions.add_line(session, ana, ANGUS, 1)
    orders.confirm(session, ana)
    assert all(d == 0.0 for d in sent_lines(core_client).values())
    account.discount_used_at = None
    account.save()
    sessions.add_line(session, ana, ANGUS, 1)
    with patch('experience_app.services.discount.percent_for', return_value=0.0):
        orders.confirm(session, ana)
    assert all(d == 0.0 for d in sent_lines(core_client).values())
    assert DinerAccount.objects.get().discount_used_at is None


# Falla si ocurre este error: un descuento "gastado" por un pedido que el sistema propio nunca recibió; el reintento debe llevarlo de nuevo.
@pytest.mark.django_db
def test_when_core_is_down_the_discount_is_not_marked_used(table, core_client):
    """Atrapa un descuento "gastado" por un pedido que el sistema propio nunca recibió; el reintento debe llevarlo de nuevo."""
    from experience_app.services import orders
    session, ana, _ = table
    account = verified_account(ana)
    core_client.side_effect = [OperationalError('down'), SENT]
    with pytest.raises(OperationalError):
        orders.confirm(session, ana)
    account.refresh_from_db()
    assert account.discount_used_at is None
    assert CartLine.objects.get(diner=ana).discount == 5
    assert account.discount_order_id is not None
    orders.confirm(session, ana)
    assert sent_lines(core_client)['Hamburguesa Angus'] == 5.0
    account.refresh_from_db()
    assert account.discount_used_at is None and account.discount_order_id is not None


# Falla si ocurre este error: un carrito que no anuncie el descuento por venir, o una cuenta que no lo reste ni lo muestre aplicado.
@pytest.mark.django_db
def test_cart_and_bill_expose_the_discount_block(table, core_client):
    """Atrapa un carrito que no anuncie el descuento por venir, o una cuenta que no lo reste ni lo muestre aplicado."""
    from experience_app.services import orders
    session, ana, beto = table
    cart = sessions.cart_view(session, ana, 5.0)
    assert cart['descuento'] == {'porcentaje': 5.0, 'monto': 0.0, 'aplicable': False, 'aplicado': False, 'registrado': False}
    verified_account(ana)
    ana.refresh_from_db()
    cart = sessions.cart_view(session, ana, 5.0)
    assert cart['descuento'] == {'porcentaje': 5.0, 'monto': 4391.1, 'aplicable': True, 'aplicado': False, 'registrado': True}
    assert cart['total'] == 87822.0 + 9900.0  # aún sin aplicar: los totales son a precio de lista
    assert sessions.cart_view(session, beto, 5.0)['descuento']['aplicable'] is False
    orders.confirm(session, ana)
    ana.refresh_from_db()
    bill = sessions.bill_summary(session, ana, 5.0)
    assert bill['descuento'] == {'porcentaje': 5.0, 'monto': 4391.1, 'aplicable': False, 'aplicado': True, 'registrado': True}
    assert (bill['mio'], bill['total']) == (83430.9, 83430.9 + 9900.0)  # netos: lo que el sistema propio cobra
    assert sessions.bill_summary(session, beto, 5.0)['descuento'] == {'porcentaje': 5.0, 'monto': 0.0, 'aplicable': False, 'aplicado': False, 'registrado': False}


# Falla si ocurre este error: un carrito con el 5 % del diseño cuando el restaurante fijó otro porcentaje en el POS.
@pytest.mark.django_db
def test_cart_endpoint_uses_the_venue_percentage(api_client, table_tenant, catalog_stub):
    """Atrapa un carrito con el 5 % del diseño cuando el restaurante fijó otro porcentaje en el POS."""
    from dataclasses import replace

    from experience_app.tests.conftest import CATALOG
    sid = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']
    with patch('experience_app.services.catalog.get_catalog', return_value=replace(CATALOG, signup_discount_percent=10.0)):
        body = api_client.post(reverse('add-line', args=[sid]), {'producto_id': 3}, format='json').json()
    assert body['descuento']['porcentaje'] == 10.0


# Falla si ocurre este error: un carrito roto (5xx) solo por no poder leer el porcentaje del descuento.
def test_percent_falls_back_to_the_design_when_core_or_the_initial_fail():
    """Atrapa un carrito roto (5xx) solo por no poder leer el porcentaje del descuento."""
    with patch('experience_app.services.catalog.get_catalog', side_effect=OperationalError('down')):
        assert discount.percent_for(TABLE) == 5.0


# Falla si un timeout deja reutilizar el descuento desde otra mesa/cookie.
@pytest.mark.django_db
def test_reservation_blocks_another_session_even_with_a_stale_account(table, core_client):
    """Falla si un timeout deja reutilizar el descuento desde otra mesa/cookie."""
    from experience_app.models import Diner, TableSession
    from experience_app.services import orders
    session, ana, _ = table
    account = verified_account(ana)
    other = TableSession.objects.create(restaurant_slug='burger-house', venue_slug='poblado')
    clone = Diner.objects.create(session=other, account=account)
    sessions.add_line(other, clone, ANGUS, 1)
    core_client.side_effect = [OperationalError('timeout'), SENT, SENT]
    with pytest.raises(OperationalError):
        orders.confirm(session, ana)
    orders.confirm(other, clone)
    assert all(line.discount == 0 for line in core_client.call_args.kwargs['lines'])
    orders.confirm(session, ana)
    assert sent_lines(core_client)['Hamburguesa Angus'] == 5.0


# Falla si cambia la cantidad después de un envío remoto con resultado incierto.
@pytest.mark.django_db
def test_uncertain_lines_cannot_be_edited_before_retry(table, core_client):
    """Falla si cambia la cantidad después de un envío remoto con resultado incierto."""
    from experience_app.services import orders
    from experience_app.utils.errors import ConfirmationBusy
    session, ana, _ = table
    stale_line = CartLine.objects.get(diner=ana)
    core_client.side_effect = OperationalError('timeout')
    with pytest.raises(OperationalError):
        orders.confirm(session, ana)
    with pytest.raises(ConfirmationBusy):
        sessions.update_line(stale_line, ana, qty=8)
    with pytest.raises(ConfirmationBusy):
        sessions.remove_line(stale_line, ana)


# Falla si dos confirmaciones simultáneas envían snapshots distintos al sistema propio.
@pytest.mark.django_db
def test_overlapping_confirmation_of_same_session_is_rejected(table, core_client):
    """Falla si dos confirmaciones simultáneas envían snapshots distintos al sistema propio."""
    from experience_app.services import orders
    from experience_app.utils.errors import ConfirmationBusy
    session, ana, _ = table
    def while_sending(*args, **kwargs):
        with pytest.raises(ConfirmationBusy):
            orders.confirm(session, ana)
        return SENT
    core_client.side_effect = while_sending
    orders.confirm(session, ana)
    assert core_client.call_count == 1
    session.refresh_from_db()
    assert not session.confirming


# Falla si pagar desde el celular acepta un pedido que el POS ya cobró.
@pytest.mark.django_db
def test_confirmation_without_new_lines_detects_a_pos_payment(table, core_client):
    """Falla si pagar desde el celular acepta un pedido que el POS ya cobró."""
    from experience_app.adapters.core.pos import OrderStatus
    from experience_app.services import orders
    from experience_app.utils.errors import SessionAlreadyPaid
    session, ana, _ = table
    orders.confirm(session, ana)
    with patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus('paid', 'served')):
        with pytest.raises(SessionAlreadyPaid):
            orders.confirm(session, ana)
    assert core_client.call_count == 1


# Falla si cambiar de correo permite repetir el descuento del dispositivo o teléfono.
@pytest.mark.django_db
@pytest.mark.parametrize('same_device', [True, False])
def test_new_email_cannot_repeat_benefit_on_device_or_normalized_phone(table, core_client, same_device):
    from experience_app.services import orders
    session, ana, beto = table
    verified_account(ana, phone='+57 310 555 4821')
    orders.confirm(session, ana)
    next_diner = ana if same_device else beto
    verified_account(next_diner, email='new@example.com', phone='' if same_device else '310-555-4821')
    sessions.add_line(session, next_diner, LIMONADA, 1)
    assert not discount.applicable(next_diner)
    orders.confirm(session, next_diner)
    assert core_client.call_args.kwargs['lines'][-1].discount == 0


# Falla si la cuenta omite platos abiertos o descuentos, o los envía a cocina al consultar.
@pytest.mark.django_db
def test_quote_includes_open_items_and_discount_without_sending_to_kitchen(table):
    session, ana, beto = table
    verified_account(ana)
    quote = sessions.bill_summary(session, ana, 5, include_open=True)
    assert quote['mio'] == 83430.9
    assert quote['total'] == 93330.9
    assert quote['partes'] == 2
    assert session.orders.count() == 0
    assert session.lines.filter(status=CartLine.OPEN).count() == 2
