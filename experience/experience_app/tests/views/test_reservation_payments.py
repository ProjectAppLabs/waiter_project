"""Anticipo de una reserva pagado por enlace: el token es la llave, el sistema propio dice cuánto, y nunca hay dos cobros vivos."""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from experience_app.models import PaymentAttempt, PaymentGateway
from experience_app.payments import wompi
from experience_app.payments.crypto import PaymentUnavailable, encrypt
from experience_app.services import online_payments, reservation_payments
from experience_app.tests.conftest import TABLE

pytestmark = pytest.mark.django_db
SECRETS = {'private_key': 'prv_test_12345678', 'events': 'test_events_12345678', 'integrity': 'test_integrity_12345678'}
MERCHANT = {'name': 'Demo', 'accepted_payment_methods': wompi.METHODS, 'presigned_acceptance': {'acceptance_token': 'terms', 'permalink': 'https://wompi.co/terms'},
            'presigned_personal_data_auth': {'acceptance_token': 'personal', 'permalink': 'https://wompi.co/privacy'}}
TOKEN = 'UFLe_VaK1Qx627Ebdh2IMtiA9lIBurnn'
PUBLIC = {'code': 'RV101', 'customer': 'Camila', 'date': '2030-10-15', 'time_label': '19:30', 'people': 2, 'table_number': 7,
          'state': 'confirmed', 'deposit_state': 'pending', 'amount_in_cents': 5000000}
URL = f'/api/v1/burger-house/poblado/reservas/{TOKEN}/pagos/'


@pytest.fixture(autouse=True)
def configuration(settings):
    settings.PAYMENTS_FERNET_KEY = Fernet.generate_key().decode()
    settings.PAYMENTS_LIVE_ENABLED = False
    settings.DINER_PUBLIC_URL = 'http://menu.test'


@pytest.fixture
def core_client():
    """el sistema propio simulado: `state` es lo que responde waiter_deposit_public; las llamadas quedan registradas."""
    client = MagicMock()
    client.state = dict(PUBLIC)
    client.call_kw.side_effect = lambda model, method, args: (client.state if args[0] == TOKEN else False) if method == 'waiter_deposit_public' else {'paid': True}
    with patch.object(reservation_payments, 'resolve', return_value=TABLE), patch.object(online_payments, 'resolve', return_value=TABLE), \
            patch.object(reservation_payments, 'Client', return_value=client), patch.object(online_payments, 'Client', return_value=client), \
            patch.object(wompi, 'merchant', return_value=MERCHANT):
        yield client


@pytest.fixture
def gateway():
    return PaymentGateway.objects.create(restaurant_slug='burger-house', venue_slug='poblado', public_key='pub_test_12345678', environment='test', enabled=True, secrets_cipher=encrypt(SECRETS))


def body(**patch_):
    return {'id': str(uuid.uuid4()), 'method': 'BANCOLOMBIA_QR', 'email': 'camila@example.com', 'accepted': True, 'personal_data_accepted': True,
            'acceptance_token': 'terms', 'accept_personal_auth': 'personal', 'expected_amount_in_cents': 5000000, **patch_}


def remote(attempt, status='PENDING'):
    return {'id': 'tx-9', 'reference': attempt.reference, 'status': status, 'amount_in_cents': attempt.amount_in_cents, 'currency': 'COP',
            'payment_method_type': attempt.method, 'payment_method': {'extra': {'qr_image': 'PHN2Zy8+'}}}


# Falla si el enlace deja ver datos privados, si un token ajeno o mal formado devuelve algo distinto de 404, o si el
# monto y los medios no salen del sistema propio y del comercio.
def test_the_link_shows_the_reservation_and_how_to_pay_only_to_whoever_has_the_token(api_client, core_client, gateway):
    data = api_client.get(URL).json()
    assert data['reservation'] == PUBLIC and data['amount_in_cents'] == 5000000 and data['available'] is True
    assert data['methods'] == wompi.METHODS and data['public_key'] == 'pub_test_12345678' and data['attempt'] is None
    assert 'private_key' not in str(data) and 'integrity' not in str(data)
    assert api_client.get(URL.replace(TOKEN, 'x' * 32)).status_code == 404
    assert api_client.get(URL.replace(TOKEN, 'corto')).status_code == 404
    assert api_client.get(URL, HTTP_ORIGIN='https://otro.sitio').status_code == 403


# Falla si una reserva pagada, cancelada o sin costo sigue ofreciendo cobrar, o si sin pasarela se promete un pago.
@pytest.mark.parametrize('change', [{'deposit_state': 'paid'}, {'deposit_state': 'none', 'amount_in_cents': 0}, {'state': 'cancelled'}, {'state': 'no_show'}])
def test_nothing_to_pay_means_no_payment_form_and_no_charge(api_client, core_client, gateway, change):
    core_client.state.update(change)
    data = api_client.get(URL).json()
    assert data['amount_in_cents'] is None and data['available'] is False
    with patch.object(wompi, 'create') as create:
        assert api_client.post(URL, body(), format='json').status_code == 409
    create.assert_not_called()
    assert PaymentAttempt.objects.count() == 0


# Falla si desactivar la pasarela oculta los datos públicos de la reserva.
def test_without_an_enabled_gateway_the_page_still_shows_the_reservation(api_client, core_client):
    data = api_client.get(URL).json()
    assert data['reservation']['code'] == 'RV101' and data['available'] is False and data['amount_in_cents'] == 5000000


# Falla si el navegador puede decidir el monto, si un doble clic o una segunda pestaña crean dos cobros, o si el intento
# de reserva se mezcla con una visita.
def test_the_amount_comes_from_core_and_there_is_never_a_second_live_charge(api_client, core_client, gateway):
    with patch.object(wompi, 'create', return_value={'id': 'tx-9'}) as create, patch.object(wompi, 'read', side_effect=lambda *a: remote(PaymentAttempt.objects.get())):
        assert api_client.post(URL, body(expected_amount_in_cents=100), format='json').status_code == 409
        create.assert_not_called()
        first = body()
        created = api_client.post(URL, first, format='json').json()
        assert created['status'] == 'PENDING' and created['amount_in_cents'] == 5000000 and created['qr_image'] == 'PHN2Zy8+' and created['order_id'] is None
        assert api_client.post(URL, first, format='json').json()['id'] == created['id']
        assert api_client.post(URL, body(), format='json').status_code == 409
        assert create.call_count == 1
    attempt = PaymentAttempt.objects.get()
    assert (attempt.reservation_token, attempt.reservation_code, attempt.session_id, attempt.order_id) == (TOKEN, 'RV101', None, None)
    assert create.call_args.args[4] == f'http://menu.test/burger-house/poblado/reserva/{TOKEN}'
    assert api_client.get(URL).json()['attempt']['id'] == created['id']
    other = f'/api/v1/burger-house/poblado/reservas/{"y" * 32}/pagos/{created["id"]}/'
    assert api_client.get(other).status_code == 404


# Falla si un timeout del anticipo genera otro intento de cobro.
def test_a_timeout_keeps_the_attempt_and_never_posts_again(api_client, core_client, gateway):
    with patch.object(wompi, 'create', side_effect=PaymentUnavailable()) as create:
        first = body()
        assert api_client.post(URL, first, format='json').json()['status'] == 'UNKNOWN'
        assert api_client.post(URL, first, format='json').json()['status'] == 'UNKNOWN'
        assert api_client.post(URL, body(), format='json').status_code == 409
    assert create.call_count == 1


# Falla si una aprobación de sandbox marca pagada la reserva real, o si una de producción no lo hace con el monto y la
# referencia exactos, o si el sistema propio caído deja el pago sin señal de revisión.
def test_only_a_live_approval_settles_the_reservation_in_call(core_client, gateway, settings):
    sandbox = PaymentAttempt.objects.create(gateway=gateway, reservation_token=TOKEN, reservation_code='RV101', amount_in_cents=5000000, method='NEQUI', provider_id='tx-9', credentials_cipher=encrypt(SECRETS))
    online_payments.apply_remote(sandbox, remote(sandbox, 'APPROVED'))
    assert not any(call.args[1] == 'waiter_deposit_paid' for call in core_client.call_kw.call_args_list)
    PaymentAttempt.objects.all().delete()
    settings.PAYMENTS_LIVE_ENABLED = True
    gateway.environment = 'prod'
    gateway.save()
    live = PaymentAttempt.objects.create(gateway=gateway, reservation_token=TOKEN, reservation_code='RV101', amount_in_cents=5000000, method='NEQUI', provider_id='tx-9', credentials_cipher=encrypt(SECRETS))
    settled = online_payments.apply_remote(live, remote(live, 'APPROVED'))
    assert settled.reconciled and not settled.needs_review
    core_client.call_kw.assert_called_with('waiter.reservation', 'waiter_deposit_paid', [TOKEN, 5000000, live.reference])
    core_client.call_kw.side_effect = lambda *a: {'paid': False, 'reason': 'amount_changed'}
    PaymentAttempt.objects.filter(id=live.id).update(reconciled=False)
    live.refresh_from_db()
    assert online_payments.reconcile(live).needs_review is True


# Falla si un pago queda sin destino o pertenece a visita y reserva a la vez.
def test_a_payment_must_belong_to_a_visit_or_a_reservation(gateway):
    from django.db import IntegrityError, transaction
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentAttempt.objects.create(gateway=gateway, amount_in_cents=100, method='NEQUI', credentials_cipher='x')
