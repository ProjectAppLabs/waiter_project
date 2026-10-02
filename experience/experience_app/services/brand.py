"""Marca de la organización y logo con caché por versión.

El contexto resuelto ofrece los valores iniciales si no se puede actualizar la marca.
Los fallos no se cachean para permitir la recuperación en la siguiente petición.
"""
from tenancy.http import Problem
from experience_app.adapters.core import pos
from experience_app.adapters.core.pos import Client
import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core.cache import cache
from django.urls import reverse

from django.db import DatabaseError
from experience_app.adapters.core.context import RestaurantContext, RestaurantNotFound
from experience_app.utils.brand import theme

log = logging.getLogger(__name__)
# El logo se cachea por versión (write_date de la compañía): un logo nuevo es una clave nueva, así que la caché
# puede vivir más que la marca sin servir nunca un logo viejo.
LOGO_CACHE_SECONDS = max(settings.BRAND_CACHE_SECONDS, 3600)
# Textos de la marca: (clave en la vista del comensal, atributo en CompanyBrand). El contexto resuelto usa las mismas claves.
TEXT_FIELDS = [('lema', 'tagline'), ('saludo', 'greeting'), ('mesero', 'waiter_name'), ('bienvenida', 'welcome')]
# Centinela de caché: None es un valor legítimo del logo ("no hay"), así que "no está en caché" necesita otro.
_MISSING = object()


def _key(restaurant: str, venue: str) -> str:
    return f'brand:org:{restaurant}'


def _logo_key(tenant: RestaurantContext, version: str) -> str:
    return f'logo:org:{tenant.restaurant_slug}/{version}'


def get_company_brand(tenant: RestaurantContext) -> pos.CompanyBrand | None:
    """La marca tal como está en el sistema propio, desde caché. None si el sistema propio no responde (no se cachea)."""
    key = _key(tenant.restaurant_slug, tenant.venue_slug)
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        company = pos.read_company_brand(Client(tenant))
    except (DatabaseError, Problem, RestaurantNotFound) as exc:
        # Conserva los valores del contexto si falla la lectura actualizada.
        log.warning('marca de %s/%s: el sistema propio no la entregó (%s); se usan los valores del contexto', tenant.restaurant_slug, tenant.venue_slug, exc)
        return None
    cache.set(key, company, settings.BRAND_CACHE_SECONDS)
    return company


def invalidate(restaurant: str, venue: str) -> None:
    cache.delete(_key(restaurant, venue))


def get_logo(tenant: RestaurantContext, company: pos.CompanyBrand) -> tuple[bytes, str] | None:
    """(bytes, content-type) del logo, o None si el sistema propio no lo tiene, no es un ráster o no lo entregó. Una lectura al sistema propio por versión.

    El None de "no hay / no es ráster / pesa de más" también se cachea: una marca que aún dice "hay logo" no manda al sistema propio a
    cada comensal. El de "el sistema propio no respondió" NO se cachea: la marca puede estar en caché una hora diciendo "hay logo" y el
    logo debe salir en cuanto el sistema propio vuelva, no una hora después.
    """
    key = _logo_key(tenant, company.version)
    cached = cache.get(key, _MISSING)
    if cached is not _MISSING:
        return cached
    try:
        found = pos.fetch_company_logo(Client(tenant))
    except (DatabaseError, Problem, RestaurantNotFound) as exc:
        # Incluye OperationalError. La vista responde 404 "sin logo": un <img> solo entiende "no hay imagen".
        log.warning('logo de %s/%s: el sistema propio no lo entregó (%s); no se cachea', tenant.restaurant_slug, tenant.venue_slug, exc)
        return None
    cache.set(key, found, LOGO_CACHE_SECONDS)
    return found


def logo_url(restaurant: str, venue: str, version: str) -> str:
    # La versión va en la URL: cuando el restaurante cambia el logo, el navegador lo pide de nuevo aunque la caché sea larga.
    return f"{reverse('company-logo', args=[restaurant, venue])}?{urlencode({'v': version})}"


def brand_inputs(tenant: RestaurantContext) -> dict:
    """Color, tipografía y redondeo de la marca SIN derivar (marca actual > contexto resuelto; vacío o None si nadie los fijó).

    Los usa la plantilla del menú (plantillas/services.py) como valores por defecto de sus tokens: ahí no vale el
    tema derivado, porque un color que nadie eligió no debe pisar el acento del diseño de la plantilla.
    """
    initial = tenant.brand
    company = get_company_brand(tenant)
    return {'color': (company and company.color) or initial.get('color') or '',
            'fuente': (company and company.font) or initial.get('fuente') or '',
            'radio': (company and company.radius) or initial.get('radio') or None}


def brand_view(tenant: RestaurantContext) -> dict:
    """Marca pública con el tema derivado del color final de la organización."""
    initial = tenant.brand
    company = get_company_brand(tenant)
    view = {'nombre': (company and company.name) or initial.get('nombre') or tenant.restaurant_name}
    for key, attr in TEXT_FIELDS:
        view[key] = (company and getattr(company, attr)) or initial.get(key) or ''
    if company and company.has_logo:
        view['logo'] = logo_url(tenant.restaurant_slug, tenant.venue_slug, company.version)
    else:
        view['logo'] = initial.get('logo') or None
    color = (company and company.color) or initial.get('color') or ''
    font = (company and company.font) or initial.get('fuente') or ''
    radius = (company and company.radius) or initial.get('radio')
    return {**view, **theme(color, font, radius)}
