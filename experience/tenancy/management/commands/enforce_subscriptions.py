"""Avisos, vencimientos y suspensión; ejecutar a diario."""
from django.core.management.base import BaseCommand
from tenancy.subscriptions import enforce_subscriptions


class Command(BaseCommand):
    help = 'Marca cuentas vencidas, envía avisos y suspende por mora.'

    def handle(self, *args, **options):
        result = enforce_subscriptions()
        self.stdout.write(f"Vencidas: {result['overdue']}; avisos: {result['reminders']}; "
                          f"suspensiones: {result['suspended']}; fallos de correo: {result['mail_failed']}.")
