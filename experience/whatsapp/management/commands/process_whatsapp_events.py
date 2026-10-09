from django.core.management.base import BaseCommand
from whatsapp.processing import process_pending


class Command(BaseCommand):
    help = 'Procesa hasta 100 eventos pendientes de WhatsApp; ejecutar cada minuto.'

    def handle(self, *args, **options):
        total = process_pending()
        self.stdout.write(f'Eventos procesados: {total}.')
