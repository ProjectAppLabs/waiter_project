"""Cliente del registro central. ÚNICO lugar del bloque 3 que conoce su URL y su clave."""
from dataclasses import dataclass, field

import requests
from django.conf import settings
from django.core.cache import cache

from experience_app.adapters.odoo.client import OdooCredentials


@dataclass(frozen=True)
class Tenant:
    restaurant_slug: str
    restaurant_name: str
    venue_slug: str
    venue_name: str
    table_token: str | None
    table_number: int | None
    odoo_table_id: int | None
    odoo: OdooCredentials
    brand: dict = field(default_factory=dict)


    @property
    def organization_slug(self):
        return self.restaurant_slug

    @property
    def organization_name(self):
        return self.restaurant_name


class TenantNotFound(Exception):
    """Restaurante, sede o mesa inexistente o revocada: "Esta mesa no está disponible"."""


class RegistryUnavailable(Exception):
    pass


def _path(restaurant: str, venue: str, token: str | None) -> str:
    base = f'/internal/v1/resolve/{restaurant}/{venue}/'
    return base + (f't/{token}/' if token else '')


def _to_tenant(body: dict) -> Tenant:
    table = body.get('table') or {}
    o = body['odoo']
    return Tenant(
        restaurant_slug=body['restaurant']['slug'], restaurant_name=body['restaurant']['name'],
        venue_slug=body['venue']['slug'], venue_name=body['venue']['name'],
        table_token=table.get('token'), table_number=table.get('number'), odoo_table_id=table.get('odoo_table_id'),
        odoo=OdooCredentials(url=o['url'], db=o['db'], login=o['login'], password=o['password'], pos_config_id=o['pos_config_id']),
        brand=body['restaurant'].get('brand') or {},
    )


def resolve(restaurant: str, venue: str, token: str | None = None) -> Tenant:
    if not venue:
        venues = list_restaurants(restaurant)
        if not venues:
            raise TenantNotFound(restaurant)
        venue = venues[0]['slug']
    # Se cachea unos minutos: cada petición del comensal resuelve, y el registro no debe ser el cuello.
    key = f'tenant:{restaurant}/{venue}/{token or "-"}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        response = requests.get(settings.REGISTRY_URL + _path(restaurant, venue, token),
                                headers={'X-Internal-Key': settings.REGISTRY_INTERNAL_KEY}, timeout=10)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise RegistryUnavailable(str(exc)) from exc
    if response.status_code == 404:
        raise TenantNotFound(restaurant, venue, token)
    if response.status_code != 200:
        raise RegistryUnavailable(f'registro respondió {response.status_code}')
    tenant = _to_tenant(response.json())
    cache.set(key, tenant, settings.TENANT_CACHE_SECONDS)
    return tenant


def list_restaurants(organization: str) -> list[dict]:
    """Lee el índice interno de la organización; nunca lo publica con credenciales."""
    try:
        response = requests.get(
            settings.REGISTRY_URL + f'/internal/v1/organizaciones/{organization}/restaurantes/',
            headers={'X-Internal-Key': settings.REGISTRY_INTERNAL_KEY}, timeout=10)
    except (requests.ConnectionError, requests.Timeout) as exc:
        raise RegistryUnavailable(str(exc)) from exc
    if response.status_code == 404:
        raise TenantNotFound(organization)
    if response.status_code != 200:
        raise RegistryUnavailable(f'registro respondió {response.status_code}')
    return response.json()
