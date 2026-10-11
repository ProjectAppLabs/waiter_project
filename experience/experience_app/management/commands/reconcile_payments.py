"""Retry known pending/approved payments; never create a transaction or retry a charge."""
import uuid

from django.core.management.base import BaseCommand, CommandError

from experience_app.models import PaymentAttempt
from experience_app.payments import PROVIDERS
from experience_app.payments.crypto import decrypt
from experience_app.services.online_payments import refresh


class Command(BaseCommand):
    help = 'Consulta pagos pendientes y reintenta su conciliación con el POS. No crea cobros.'

    def add_arguments(self, parser):
        parser.add_argument('--payment', type=uuid.UUID)
        parser.add_argument('--transaction', help='ID verificado en Wompi para recuperar un intento sin respuesta.')

    def handle(self, *args, **options):
        if options['transaction'] and not options['payment']:
            raise CommandError('--transaction requiere --payment')
        payments = PaymentAttempt.objects.select_related('gateway', 'session', 'order').filter(status__in=['CREATING', 'UNKNOWN', 'PENDING', 'APPROVED'])
        if options['payment']:
            payments = payments.filter(id=options['payment'])
        else:
            payments = payments.exclude(status='APPROVED', reconciled=True).exclude(provider_id='').order_by('checked_at', 'created_at', 'id')[:100]
        # Desempate fijo: dos intentos sin revisar (checked_at nulo) salían en orden distinto en MySQL y SQLite.
        for payment in payments:
            try:
                if options['transaction']:
                    if payment.provider_id and payment.provider_id != options['transaction']:
                        raise CommandError('El intento ya tiene otra transacción asociada.')
                    remote = PROVIDERS[payment.gateway.provider].read(payment.gateway.environment, decrypt(payment.credentials_cipher), options['transaction'])
                    if remote.get('reference') != payment.reference or remote.get('currency') != 'COP' or remote.get('amount_in_cents') != payment.amount_in_cents:
                        raise CommandError('La transacción no corresponde a este intento.')
                    PaymentAttempt.objects.filter(id=payment.id, provider_id='').update(provider_id=options['transaction'])
                    payment.refresh_from_db()
                result = refresh(payment, force=True)
                self.stdout.write(f'{result.id}: {result.status}; conciliado={result.reconciled}; revisar={result.needs_review}')
            except Exception:
                # No provider payload/credentials in cron output. The attempt remains available for retry.
                self.stderr.write(f'{payment.id}: no se pudo conciliar; conservado para revisión.')
