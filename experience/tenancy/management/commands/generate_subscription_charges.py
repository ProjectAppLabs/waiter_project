"""Generación mensual idempotente; ejecutar el día 1."""
from django.core.management.base import BaseCommand, CommandError
from tenancy.http import Problem
from tenancy.subscriptions import generate_charges


class Command(BaseCommand):
    help = 'Genera las cuentas de suscripción del mes, sin duplicarlas.'

    def add_arguments(self, parser):
        parser.add_argument('--period', help='Periodo YYYY-MM; por omisión, el mes local de cada organización.')

    def handle(self, *args, **options):
        try:
            count = generate_charges(options['period'])
        except Problem as exc:
            raise CommandError(exc.body['message']) from exc
        self.stdout.write(f'Cuentas creadas: {count}.')
