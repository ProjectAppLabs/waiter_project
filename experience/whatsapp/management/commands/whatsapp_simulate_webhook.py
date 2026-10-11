import json
import time
import uuid
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from tenancy.http import Problem
from whatsapp.services import configured
from whatsapp.webhook import sign


class Command(BaseCommand):
    help = 'Simula la verificación y un mensaje firmado de Meta en el webhook local.'

    def add_arguments(self, parser):
        parser.add_argument('--url', default='http://localhost:8000/webhooks/whatsapp', help='Dirección local del webhook.')
        parser.add_argument('--text', default='Hola Waiter (simulado)', help='Mensaje entrante simulado.')

    def handle(self, *args, **options):
        try:
            configured('META_APP_SECRET', 'WA_VERIFY_TOKEN', 'WA_PHONE_NUMBER_ID')
        except Problem as exc:
            raise CommandError(exc.body['message']) from None
        url = options['url']
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise CommandError('Usa una dirección HTTP válida para simular el webhook.')
        sender = settings.WA_TEST_RECIPIENTS[0] if settings.WA_TEST_RECIPIENTS else '573004771554'
        body = json.dumps({'object': 'whatsapp_business_account', 'entry': [{'id': settings.WA_WABA_ID, 'changes': [
            {'field': 'messages', 'value': {'metadata': {'phone_number_id': settings.WA_PHONE_NUMBER_ID},
             'contacts': [{'wa_id': sender, 'profile': {'name': 'Cliente de prueba'}}],
             'messages': [{'from': sender, 'id': f'wamid.SIMULADO{uuid.uuid4().hex}', 'timestamp': str(int(time.time())),
                           'type': 'text', 'text': {'body': options['text']}}]}}
        ]}]}).encode()
        try:
            verification = requests.get(url, params={'hub.mode': 'subscribe', 'hub.verify_token': settings.WA_VERIFY_TOKEN, 'hub.challenge': '12345'}, timeout=10, allow_redirects=False)
            if verification.status_code != 200 or verification.text != '12345':
                raise CommandError('La verificación local de WhatsApp falló.')
            response = requests.post(url, data=body, headers={'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body, settings.META_APP_SECRET)}, timeout=10, allow_redirects=False)
            if response.status_code != 200:
                raise CommandError('El webhook local rechazó el evento simulado.')
        except requests.RequestException:
            raise CommandError('No se pudo contactar con el webhook local.') from None
        self.stdout.write('Verificación y evento simulado aceptados.')
