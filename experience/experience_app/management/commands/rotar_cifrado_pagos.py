"""Vuelve a cifrar las credenciales de pago con la llave maestra vigente (cifrado de sobre v2).

Sirve para dos cosas: pasar lo guardado con el cifrado anterior (Fernet) al nuevo, y rotar la llave maestra (se
antepone la nueva en PAYMENTS_MASTER_KEYS, se corre este comando y después se quita la vieja). Nunca imprime secretos.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from experience_app.models import PaymentAttempt, PaymentGateway
from experience_app.payments.crypto import decrypt, encrypt, gateway_context, needs_rotation


class Command(BaseCommand):
    help = 'Vuelve a cifrar las credenciales de pago con la llave maestra vigente.'

    def handle(self, *args, **options):
        gateways = attempts = 0
        with transaction.atomic():
            for gateway in PaymentGateway.objects.select_for_update().exclude(secrets_cipher=''):
                if needs_rotation(gateway.secrets_cipher):
                    context = gateway_context(gateway)
                    gateway.secrets_cipher = encrypt(decrypt(gateway.secrets_cipher, context), context)
                    gateway.save(update_fields=['secrets_cipher'])
                    gateways += 1
            for attempt in PaymentAttempt.objects.select_for_update().exclude(credentials_cipher=''):
                if needs_rotation(attempt.credentials_cipher):
                    attempt.credentials_cipher = encrypt(decrypt(attempt.credentials_cipher))
                    attempt.save(update_fields=['credentials_cipher'])
                    attempts += 1
        self.stdout.write(f'Pasarelas recifradas: {gateways}. Intentos de pago recifrados: {attempts}.')
