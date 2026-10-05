"""Escenarios de pago existentes y bloqueo de red para las pruebas de cobertura."""
from unittest.mock import patch

import pytest

from experience_app.tests.views.test_online_payments import configuration as configuracion
from experience_app.tests.views.test_online_payments import setup as escenario


@pytest.fixture(autouse=True)
def sin_red():
    with patch('requests.sessions.Session.request', side_effect=AssertionError('La pasarela debe estar simulada.')):
        yield


@pytest.fixture
def crear_anticipo(escenario):
    import uuid
    from experience_app.models import PaymentAttempt
    from experience_app.payments.crypto import encrypt
    from experience_app.tests.views.test_online_payments import SECRETS

    def crear(**valores):
        return PaymentAttempt.objects.create(gateway=escenario[4], reservation_token=uuid.uuid4().hex,
            amount_in_cents=5105100, method='BANCOLOMBIA_QR', credentials_cipher=encrypt(SECRETS), **valores)

    return crear
