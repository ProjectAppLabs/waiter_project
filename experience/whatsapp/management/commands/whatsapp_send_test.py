from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from tenancy.http import Problem
from whatsapp.models import WhatsAppAccount, WhatsAppConversation
from whatsapp.services import number, send_template, send_text


class Command(BaseCommand):
    help = 'Envía una plantilla de prueba o texto dentro de la ventana de 24 horas.'

    def add_arguments(self, parser):
        parser.add_argument('numero', help='Número destinatario con indicativo de país.')
        parser.add_argument('--text', help='Texto libre; requiere un mensaje reciente del cliente.')

    def handle(self, *args, **options):
        account = WhatsAppAccount.objects.filter(phone_number_id=settings.WA_PHONE_NUMBER_ID, status='connected', token_encrypted='').first()
        if not account:
            raise CommandError('Primero vincula el número con whatsapp_connect_test.')
        try:
            if options['text'] is not None:
                conversation = WhatsAppConversation.objects.filter(account=account, wa_id=number(options['numero'])).first()
                if not conversation:
                    raise CommandError('La ventana de 24 horas está cerrada. Envía una plantilla.')
                send_text(conversation, options['text'])
            else:
                send_template(account, options['numero'])
        except Problem as exc:
            raise CommandError(exc.body['message']) from None
        self.stdout.write('Mensaje de prueba enviado y registrado.')
