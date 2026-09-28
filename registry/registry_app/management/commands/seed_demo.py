"""Siembra la demo: una organización, un restaurante sobre el Odoo del compose y un token por mesa.

Aprovisionamiento, no lógica de negocio: lee las mesas de Odoo por JSON-RPC una vez
para saber sus ids, y no vuelve a hablar con Odoo nunca más.
"""

import requests
from django.core.management.base import BaseCommand, CommandError

from registry_app.models import Restaurant, TableToken, Venue


def _odoo_tables(url: str, db: str, login: str, password: str, config_id: int = 1) -> list[dict]:
    s = requests.Session()
    auth = s.post(
        f"{url}/web/session/authenticate",
        json={"jsonrpc": "2.0", "params": {"db": db, "login": login, "password": password}},
        timeout=20,
    ).json()
    if not auth.get("result", {}).get("uid"):
        raise CommandError('Odoo rechazó las credenciales del restaurante.')
    config = s.post(f'{url}/web/dataset/call_kw', json={'jsonrpc': '2.0', 'params': {
        'model': 'pos.config', 'method': 'search_read', 'args': [[['id', '=', config_id]], ['id']], 'kwargs': {},
    }}, timeout=20).json()
    if not config.get('result'):
        raise CommandError('El config indicado no existe o no está disponible en esta base de Odoo.')
    res = s.post(
        f"{url}/web/dataset/call_kw",
        json={
            "jsonrpc": "2.0",
            "params": {
                "model": "restaurant.table",
                "method": "search_read",
                "args": [[["active", "=", True], ["floor_id.pos_config_ids", "in", [config_id]]], ["id", "table_number"]],
                "kwargs": {},
            },
        },
        timeout=20,
    ).json()
    return res["result"]


class Command(BaseCommand):
    help = "Crea burger-house/poblado apuntando al Odoo del compose y emite un token por mesa."

    def add_arguments(self, parser):
        parser.add_argument("--odoo-url", default="http://192.168.56.10:8069")
        parser.add_argument("--db", default="projectapp")
        parser.add_argument("--login", default="admin")
        parser.add_argument("--password", default="admin")
        parser.add_argument("--restaurant", default="burger-house")
        parser.add_argument("--venue", default="poblado")
        parser.add_argument("--config-id", type=int, default=1)

    def handle(self, *args, **o):
        restaurant, _ = Restaurant.objects.get_or_create(
            slug=o["restaurant"], defaults={"name": o["restaurant"].replace("-", " ").title()}
        )
        venue, _ = Venue.objects.get_or_create(
            restaurant=restaurant,
            slug=o["venue"],
            defaults={
                "name": o["venue"].title(),
                "odoo_url": o["odoo_url"],
                "odoo_db": o["db"],
                "odoo_login": o["login"],
                "odoo_secret": "",
                "pos_config_id": o["config_id"],
            },
        )
        venue.odoo_password = o["password"]
        venue.save()
        for t in _odoo_tables(o["odoo_url"], o["db"], o["login"], o["password"], o["config_id"]):
            token, created = TableToken.objects.get_or_create(
                venue=venue, odoo_table_id=t["id"], defaults={"table_number": t["table_number"]}
            )
            self.stdout.write(
                f"{'nuevo ' if created else 'existe'}  mesa {t['table_number']:>2}  /{restaurant.slug}/{venue.slug}/t/{token.token}"
            )
        self.stdout.write(self.style.SUCCESS(f"domicilio: /{restaurant.slug}/{venue.slug}"))
