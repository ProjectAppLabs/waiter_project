"""Local preview using the tenant's POS catalog; never confirms or sends messages."""
from tenancy.http import Problem
from experience_app.adapters.core import pos
from experience_app.adapters.core.pos import Client
import json

from django.core.management.base import BaseCommand, CommandError

from django.db import DatabaseError
from experience_app.adapters.core.pos import resolve
from experience_app.services.waiter_agent import AgentUnavailable, propose


class Command(BaseCommand):
    help = 'Propone una acción con IA y catálogo real; consume API, sin crear pedidos.'

    def add_arguments(self, parser):
        parser.add_argument('restaurante')
        parser.add_argument('sede')
        parser.add_argument('mensaje')

    def handle(self, *args, **options):
        tenant = resolve(options['restaurante'], options['sede'])
        client = Client(tenant)
        try:
            sessions = client.call_kw('pos.session', 'search_read', [
                [['config_id', '=', tenant.config_id], ['state', '=', 'opened']], ['id']], {'limit': 1})
            if not sessions:
                raise CommandError('Abre la caja para consultar el catálogo operativo.')
            catalog = pos.load_catalog(client, sessions[0]['id'])
            products = [{'id': p.id, 'nombre': p.name, 'agotado': p.sold_out,
                         'descripcion': p.description, 'ingredientes': p.attributes.get('ingredientes', [])}
                        for p in catalog.products]
            result = propose(options['mensaje'], products)
        except (AgentUnavailable, ValueError):
            raise CommandError('No se pudo generar la propuesta. Revisa la configuración del agente.') from None
        except (DatabaseError, Problem):
            raise CommandError('No se pudo consultar el catálogo del POS.') from None
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
