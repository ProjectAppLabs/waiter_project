"""Generación mensual idempotente: el periodo explícito permite cobrar el consumo al cierre."""
from django.core.management.base import BaseCommand, CommandError
from tenancy.http import Problem
from tenancy.subscriptions import generate_charges


class Command(BaseCommand):
    help = 'Genera mensualidad por local y consumo registrado. Para liquidar uso completo, indica un periodo cerrado con --period.'

    def add_arguments(self, parser):
        parser.add_argument('--period', help='Periodo YYYY-MM; por omisión, el mes local de cada organización.')

    def handle(self, *args, **options):
        try:
            count = generate_charges(options['period'])
        except Problem as exc:
            raise CommandError(exc.body['message']) from exc
        self.stdout.write(f'Cuentas creadas: {count}.')
