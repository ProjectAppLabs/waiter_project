"""Comprueba umbrales y cierra episodios recuperados; apto para cron."""

from django.core.management.base import BaseCommand

from notifications.services import notify_low_stock


class Command(BaseCommand):
    help = "Crea avisos de existencias bajas sin duplicar los episodios abiertos."

    def handle(self, *args, **options):
        self.stdout.write(f"Avisos creados: {notify_low_stock()}")
