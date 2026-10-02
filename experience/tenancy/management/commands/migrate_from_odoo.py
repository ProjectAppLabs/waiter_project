"""Punto de entrada administrativo de la migración T6."""
import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, IntegrityError
from django.db.models import F

from experience_app.adapters.odoo.client import OdooClient, OdooCredentials, OdooError
from tenancy.http import Problem
from tenancy.models import Organization, LegacySource
from tenancy.odoo_migration.base import ImportBase
from tenancy.odoo_migration.remap import remap_diner
from tenancy.odoo_migration.storage import storage_journal
from tenancy.odoo_migration.importer import Migrator


class Command(BaseCommand):
    help = 'Migra una organización desde Odoo; --remap-diner traduce además las referencias del comensal.'
    client_factory = staticmethod(OdooClient)

    def add_arguments(self, parser):
        for key in ('org', 'url', 'db', 'login', 'password'):
            parser.add_argument(f'--{key}', required=key == 'org')
        parser.add_argument('--company-id', type=int)
        parser.add_argument('--batch-size', type=int, default=200)
        parser.add_argument('--registry-tokens', help='JSON con venue (slug de sede), odoo_table_id, token y table_number.')
        parser.add_argument('--no-invite', action='store_true')
        parser.add_argument('--remap-diner', action='store_true')

    def handle(self, *args, **options):
        if not 1 <= options['batch_size'] <= 1000:
            raise CommandError('El tamaño del lote debe estar entre 1 y 1000.')
        credentials = [options[k] for k in ('url', 'db', 'login', 'password')]
        if not any(credentials) and options['remap_diner']:
            org = Organization.objects.filter(slug=options['org']).first()
            if not org or not LegacySource.objects.filter(organization=org).exists():
                raise CommandError('Importa primero la organización antes de remapear al comensal.')
            importer = ImportBase(None, org, batch_size=options['batch_size'])
            with transaction.atomic():
                Organization.objects.filter(pk=org.pk).update(name=F('name'))
                importer.reload_maps()
                remap_diner(importer)
            importer.render(self.stdout)
            self.stdout.write('Remapeo del comensal terminado.')
            return
        if not all(credentials):
            raise CommandError('Indica --url, --db, --login y --password para importar desde Odoo.')
        tokens = []
        if options['registry_tokens']:
            try:
                tokens = json.loads(Path(options['registry_tokens']).read_text())
                if not isinstance(tokens, list) or any(not isinstance(t, dict) or set(t) != {'venue', 'odoo_table_id', 'token', 'table_number'}
                    or not isinstance(t['venue'], str) or type(t['odoo_table_id']) is not int or type(t['table_number']) is not int
                    or not isinstance(t['token'], str) for t in tokens):
                    raise ValueError('Formato inválido')
            except (OSError, ValueError) as exc:
                raise CommandError('No se pudo leer el archivo de tokens del registro.') from exc
        creds = OdooCredentials(options['url'].rstrip('/'), options['db'], options['login'], options['password'], 0)
        client = self.client_factory(creds)
        try:
            with storage_journal() as journal, transaction.atomic():
                transaction.on_commit(journal.commit)
                org, org_created = Organization.objects.get_or_create(slug=options['org'], defaults={'name': options['org']})
                org.full_clean(exclude=['brand_logo'])
                importer = Migrator(client, org, batch_size=options['batch_size'], tokens=tokens, no_invite=options['no_invite'])
                importer.org_created = org_created
                importer.run(url=options['url'], database=options['db'], company_id=options['company_id'], remap=options['remap_diner'])
            importer.render(self.stdout)
            self.stdout.write(self.style.SUCCESS('Migración terminada. Revisa el informe antes de conmutar el motor.'))
        except (OdooError, Problem, ValidationError, IntegrityError, ValueError, KeyError) as exc:
            raise CommandError(f'No se aplicó la migración: {exc}') from exc
