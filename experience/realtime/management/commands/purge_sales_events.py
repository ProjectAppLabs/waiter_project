"""Limpia también días sin escrituras nuevas; puede ejecutarse desde cron."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from realtime.models import SalesEvent


class Command(BaseCommand):
    help = "Borra los eventos de ventas con más de un día."

    def handle(self, *args, **options):
        count, _ = SalesEvent.objects.filter(created_at__lt=timezone.now() - timedelta(days=1)).delete()
        self.stdout.write(f"Eventos eliminados: {count}")
