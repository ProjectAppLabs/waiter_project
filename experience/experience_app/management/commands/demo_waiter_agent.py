"""Local preview using the tenant's POS catalog; never confirms or sends messages."""
from experience_app.adapters.backend import backend_for, client_for
import json

from django.core.management.base import BaseCommand, CommandError

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import resolve
from experience_app.services.waiter_agent import AgentUnavailable, propose


class Command(BaseCommand):
    help = 'Propone una acción con IA y catálogo real; consume API, sin crear pedidos.'

    def add_arguments(self, parser):
        parser.add_argument('restaurante')
        parser.add_argument('sede')
        parser.add_argument('mensaje')

    def handle(self, *args, **options):
        tenant = resolve(options['restaurante'], options['sede'])
        client = client_for(tenant, OdooClient)
        try:
            sessions = client.call_kw('pos.session', 'search_read', [
                [['config_id', '=', tenant.config_id], ['state', '=', 'opened']], ['id']], {'limit': 1})
            if not sessions:
                raise CommandError('Abre la caja para consultar el catálogo operativo.')
            catalog = backend_for(tenant.restaurant_slug).load_catalog(client, sessions[0]['id'])
            products = [{'id': p.id, 'nombre': p.name, 'agotado': p.sold_out,
                         'descripcion': p.description, 'ingredientes': p.attributes.get('ingredientes', [])}
                        for p in catalog.products]
            result = propose(options['mensaje'], products)
        except (AgentUnavailable, ValueError):
            raise CommandError('No se pudo generar la propuesta. Revisa la configuración del agente.') from None
        except OdooError:
            raise CommandError('No se pudo consultar el catálogo del POS.') from None
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
