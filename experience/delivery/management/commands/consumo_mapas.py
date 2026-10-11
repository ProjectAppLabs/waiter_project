"""Consultas pagas a Google Maps por día y organización, con su costo aproximado (Plan D)."""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.utils import timezone

from delivery.models import MapsUsage

# USD por consulta después de la cuota gratis de 10.000 al mes de cada tipo (precios de Google, octubre de 2026).
PRICE = {'geocoding': Decimal('0.005'), 'autocompletar': Decimal('0.00283'), 'lugar': Decimal('0.005')}


class Command(BaseCommand):
    help = 'Consultas a Google Maps de los últimos días, por organización y tipo, con el costo si se pasa de la cuota gratis.'

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=30)

    def handle(self, *args, dias, **options):
        since = timezone.localdate() - timedelta(days=dias)
        rows = MapsUsage.objects.filter(day__gte=since).values('organization__slug', 'kind').annotate(total=Sum('count')).order_by('organization__slug', 'kind')
        if not rows:
            self.stdout.write('Sin consultas a Google en el período.')
        for row in rows:
            cost = PRICE.get(row['kind'], Decimal(0)) * row['total']
            self.stdout.write(f"{row['organization__slug']:<24} {row['kind']:<14} {row['total']:>7}  ≈ USD {cost:.2f} sin cuota gratis")
