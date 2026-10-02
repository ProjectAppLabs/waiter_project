"""Pago simulado: liquida ventas, deja huella en el log y valida el acceso y el importe."""
import logging
from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.models import Order, TableSession
from experience_app.tests.test_core import core

PAYLOAD = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}


@pytest.fixture
def session_id(api_client, table_tenant):
    return api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']


# Falla si el pago demo no liquida ventas, usa el monto del navegador o pierde la referencia del log.
@pytest.mark.django_db
def test_simulated_payment_records_sales_and_logs_the_reference(core, caplog):
    from experience_app.tests.test_core import opened
    from sales.models import Payment
    client, sid = opened(core)
    client.post(reverse('confirm', args=[sid]), {}, format='json')
    order = Order.objects.get(session_id=sid)
    with caplog.at_level(logging.INFO):
        response = client.post(reverse('simulated-payment', args=[sid]), {'metodo': 'Tarjeta', 'monto': 1}, format='json')
    assert response.status_code == 200
    body = response.json()
    assert (body['estado'], body['demo'], body['metodo'], body['monto']) == ('aprobado', True, 'tarjeta', float(order.total))
    assert Payment.objects.get(order_id=order.odoo_order_id).reference == body['referencia']
    assert any(body['referencia'] in record.getMessage() and 'sin cobro real' in record.getMessage() for record in caplog.records)


# Falla si ocurre este error: un método inventado, un monto negativo o un pago desde otra mesa.
@pytest.mark.django_db
def test_simulated_payment_validates_method_amount_and_diner(api_client, session_id):
    """Atrapa un método inventado, un monto negativo o un pago desde otra mesa."""
    url = reverse('simulated-payment', args=[session_id])
    assert api_client.post(url, {'metodo': 'bitcoin', 'monto': 10}, format='json').status_code == 400
    assert api_client.post(url, {'metodo': 'nequi', 'monto': -1}, format='json').status_code == 409
    assert api_client.post(url, {'metodo': 'nequi', 'monto': 'mucho'}, format='json').status_code == 409
    assert api_client.__class__().post(url, {'metodo': 'nequi', 'monto': 10}, format='json').status_code == 404


# Falla si la bandera demo permite aparentar pagos en producción.
@pytest.mark.django_db
def test_demo_payment_is_disabled_in_production(api_client, session_id, settings):
    """Falla si la bandera demo permite aparentar pagos en producción."""
    settings.IS_PRODUCTION = True
    settings.DINER_DEMO_ENABLED = True
    Order.objects.create(session_id=session_id, state=Order.SENT, total=100)
    response = api_client.post(reverse('simulated-payment', args=[session_id]), {'metodo': 'pse'}, format='json')
    assert response.status_code == 503


# Falla si una segunda ronda se paga usando solo el total de la anterior.
@pytest.mark.django_db
def test_payment_rejects_open_lines_even_with_an_old_confirmed_order(api_client, session_id, catalog_stub):
    """Falla si una segunda ronda se paga usando solo el total de la anterior."""
    Order.objects.create(session_id=session_id, state=Order.SENT, total=100)
    api_client.post(reverse('add-line', args=[session_id]), {'producto_id': 3}, format='json')
    response = api_client.post(reverse('simulated-payment', args=[session_id]), {'metodo': 'pse'}, format='json')
    assert response.status_code == 409


# Falla si el pago simulado permite liquidar solo una parte de la cuenta.
@pytest.mark.django_db
@pytest.mark.parametrize('scope', ['mine', 'parts'])
def test_split_payment_is_rejected(api_client, session_id, scope):
    """Falla si el pago simulado permite liquidar solo una parte de la cuenta."""
    from experience_app.models import CartLine, Diner
    owner = Diner.objects.get(session_id=session_id)
    other = Diner.objects.create(session_id=session_id)
    order = Order.objects.create(session_id=session_id, state=Order.SENT, total=300)
    CartLine.objects.create(session_id=session_id, diner=owner, order=order, status=CartLine.CONFIRMED,
                            product_id=3, name='Uno', unit_price=100)
    CartLine.objects.create(session_id=session_id, diner=other, order=order, status=CartLine.CONFIRMED,
                            product_id=4, name='Otro', unit_price=200)
    response = api_client.post(reverse('simulated-payment', args=[session_id]),
                               {'metodo': 'pse', 'reparto': scope, 'monto': 1}, format='json')
    assert response.status_code == 400
    assert response.json()['error'] == 'payment_scope'
