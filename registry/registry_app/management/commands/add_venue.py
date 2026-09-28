"""Da de alta un restaurante dentro de la base de Odoo de su organización."""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from registry_app.management.commands.seed_demo import _odoo_tables
from registry_app.models import Restaurant, Venue, TableToken


class Command(BaseCommand):
    help = 'Añade un restaurante de la misma organización y emite los tokens de sus mesas.'

    def add_arguments(self, parser):
        parser.add_argument('org')
        parser.add_argument('slug')
        parser.add_argument('nombre')
        parser.add_argument('--pos-config-id', type=int, required=True)

    def handle(self, *args, **options):
        if slugify(options['slug']) != options['slug'] or not 1 <= len(options['slug']) <= 60 or options['pos_config_id'] < 1:
            raise CommandError('Indica un slug válido y un config positivo.')
        if not options['nombre'].strip() or len(options['nombre']) > 120:
            raise CommandError('Indica un nombre de hasta 120 caracteres.')
        organization = Restaurant.objects.filter(slug=options['org'], active=True).first()
        source = organization.venues.order_by('id').first() if organization else None
        if source is None:
            raise CommandError('La organización necesita un restaurante ya aprovisionado.')
        if organization.venues.filter(pos_config_id=options['pos_config_id']).exclude(slug=options['slug']).exists():
            raise CommandError('Ese config ya pertenece a otro restaurante de la organización.')
        tables = _odoo_tables(source.odoo_url, source.odoo_db, source.odoo_login, source.odoo_password,
                              options['pos_config_id'])
        with transaction.atomic():
            Restaurant.objects.select_for_update().get(pk=organization.pk)
            venue, created = Venue.objects.get_or_create(restaurant=organization, slug=options['slug'], defaults={
                'name': options['nombre'], 'pos_config_id': options['pos_config_id'],
                'odoo_url': source.odoo_url, 'odoo_db': source.odoo_db, 'odoo_login': source.odoo_login,
                'odoo_secret': source.odoo_secret,
            })
            if venue.pos_config_id != options['pos_config_id']:
                raise CommandError('Ese slug ya está asignado a otro config.')
            for table in tables:
                TableToken.objects.get_or_create(venue=venue, odoo_table_id=table['id'],
                                                defaults={'table_number': table['table_number']})
        self.stdout.write(self.style.SUCCESS(f'{"Creado" if created else "Actualizado"}: /{organization.slug}/{venue.slug}'))
