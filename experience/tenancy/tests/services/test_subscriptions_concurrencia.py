"""El cron de suscripciones frente a otras escrituras y a otra corrida, con conexiones reales en hilos."""
import threading
import time
from datetime import UTC, date, datetime
from unittest.mock import patch

import pytest
from django.db import connection

from sales.services import writing
from tenancy.models import PlatformAudit, SubscriptionCharge
from tenancy.subscriptions import enforce_subscriptions
from tenancy.tests.helpers import account, organization, restaurant

pytestmark = pytest.mark.django_db(transaction=True)
DIA_DEL_RECORDATORIO = datetime(2026, 10, 12, 13, tzinfo=UTC)


def deudora():
    """Organización con dueño y una cuenta que vence el 15/10: el 12/10 le toca el recordatorio."""
    org = organization('deudora', status='active', monthly_price=450000)
    restaurant(org)
    account(org)
    return SubscriptionCharge.objects.create(organization=org, period='2026-10', amount=450000, due_date=date(2026, 10, 15))


def corrida(resultados):
    """Una ejecución del cron en su propio hilo y con su propia conexión, como dos procesos de cron."""
    try:
        resultados.append(enforce_subscriptions())
    finally:
        connection.close()


def smtp_lento(enviando, envios, segundos):
    """Frontera SMTP simulada: anota el envío, avisa que empezó y tarda lo indicado."""
    def send(mail, *args, **kwargs):
        envios.append(mail.to)
        enviando.set()
        time.sleep(segundos)
        return 1
    return send


# Falla si una escritura operativa de otra organización espera mientras el cron envía el aviso de correo de una
# organización distinta: el correo no puede salir con las organizaciones bloqueadas.
def test_correo_lento_no_detiene_escrituras_de_otra_organizacion():
    """Mientras sale el aviso de una organización, la caja de otra escribe sin esperar al SMTP."""
    cargo = deudora()
    ajena = organization('ajena', status='active')
    sede = restaurant(ajena, 'sede-ajena')
    enviando, envios, resultados = threading.Event(), [], []
    with patch('django.utils.timezone.now', return_value=DIA_DEL_RECORDATORIO), \
            patch('tenancy.subscriptions.EmailMultiAlternatives.send', smtp_lento(enviando, envios, 3)):
        hilo = threading.Thread(target=corrida, args=(resultados,))
        hilo.start()
        assert enviando.wait(20)
        inicio = time.monotonic()
        with writing(ajena, sede):
            espera = time.monotonic() - inicio
        hilo.join()
    cargo.refresh_from_db()
    assert espera < 1
    assert resultados[0]['reminders'] == 1
    assert cargo.reminder_sent_at is not None


# Falla si dos corridas solapadas del cron envían o auditan dos veces el mismo aviso.
@pytest.mark.skipif(not connection.features.has_select_for_update, reason="El envío concurrente requiere bloqueos de filas del motor de producción.")
def test_corridas_solapadas_envian_un_solo_aviso():
    """La segunda corrida empieza mientras la primera envía: el aviso sale y se audita una sola vez."""
    deudora()
    enviando, envios, resultados = threading.Event(), [], []
    with patch('django.utils.timezone.now', return_value=DIA_DEL_RECORDATORIO), \
            patch('tenancy.subscriptions.EmailMultiAlternatives.send', smtp_lento(enviando, envios, 2)):
        primera = threading.Thread(target=corrida, args=(resultados,))
        primera.start()
        assert enviando.wait(20)
        segunda = threading.Thread(target=corrida, args=(resultados,))
        segunda.start()
        primera.join()
        segunda.join()
    assert len(envios) == 1
    assert sorted(r['reminders'] for r in resultados) == [0, 1]
    assert PlatformAudit.objects.filter(action='subscription.reminder').count() == 1
