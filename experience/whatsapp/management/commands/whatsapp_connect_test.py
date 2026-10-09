from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from tenancy.http import Problem
from tenancy.models import Organization, Restaurant
from whatsapp.client import graph_request
from whatsapp.services import connect_test


class Command(BaseCommand):
    help = 'Vincula el número de prueba configurado a una organización.'

    def add_arguments(self, parser):
        parser.add_argument('--org', required=True, help='Identificador de la organización.')
        parser.add_argument('--restaurant', type=int, help='Identificador del local receptor.')

    def handle(self, *args, **options):
        org = Organization.objects.filter(slug=options['org']).first()
        if not org:
            raise CommandError('No encontramos la organización.')
        restaurant = Restaurant.objects.filter(pk=options['restaurant'], organization=org).first() if options['restaurant'] else None
        if options['restaurant'] and not restaurant:
            raise CommandError('No encontramos el local en esta organización.')
        try:
            account = connect_test(org, restaurant)
        except Problem as exc:
            raise CommandError(exc.body['message']) from None
        # El número visible y el nombre para la consola; si Meta no responde, la vinculación sirve igual.
        try:
            info = graph_request('get', settings.WA_PHONE_NUMBER_ID, token=settings.WA_ACCESS_TOKEN, params={'fields': 'display_phone_number,verified_name,quality_rating'})
            account.phone = str(info.get('display_phone_number', ''))[:80]
            account.name = str(info.get('verified_name', ''))[:200]
            account.quality = str(info.get('quality_rating', ''))[:30]
            account.save(update_fields=['phone', 'name', 'quality'])
        except Problem:
            self.stdout.write('No se pudo leer el número desde Meta; queda vinculado sin el número visible.')
        self.stdout.write('Número de prueba vinculado.')
