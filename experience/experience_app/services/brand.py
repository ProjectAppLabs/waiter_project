"""La marca que ve el comensal: lo que el restaurante puso en Odoo manda campo a campo; el registro pone el valor inicial.

Odoo no está en el camino caliente: la marca de la organización se cachea BRAND_CACHE_SECONDS (60 s por defecto), así que un
cambio en Configuración › Restaurante llega a los comensales en menos de un minuto sin una lectura a Odoo por
petición. Si Odoo falla, el comensal ve la marca del registro y nunca un 5xx por la marca; el fallo no se cachea
para que la próxima petición vuelva a intentarlo.
"""
import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core.cache import cache
from django.urls import reverse

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import Tenant
from experience_app.utils.brand import theme

log = logging.getLogger(__name__)
# El logo se cachea por versión (write_date de la compañía): un logo nuevo es una clave nueva, así que la caché
# puede vivir más que la marca sin servir nunca un logo viejo.
LOGO_CACHE_SECONDS = max(settings.BRAND_CACHE_SECONDS, 3600)
# Textos de la marca: (clave en la vista del comensal, atributo en CompanyBrand). En el registro la clave es la misma.
TEXT_FIELDS = [('lema', 'tagline'), ('saludo', 'greeting'), ('mesero', 'waiter_name'), ('bienvenida', 'welcome')]
# Centinela de caché: None es un valor legítimo del logo ("no hay"), así que "no está en caché" necesita otro.
_MISSING = object()


def _key(restaurant: str, venue: str) -> str:
    return f'brand:org:{restaurant}'


def _logo_key(tenant: Tenant, version: str) -> str:
    return f'logo:org:{tenant.restaurant_slug}/{version}'


def get_company_brand(tenant: Tenant) -> pos.CompanyBrand | None:
    """La marca tal como está en Odoo, desde caché. None si Odoo no responde o aún no tiene los campos (no se cachea)."""
    key = _key(tenant.restaurant_slug, tenant.venue_slug)
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        company = pos.read_company_brand(OdooClient(tenant.odoo))
    except OdooError as exc:
        # Incluye OdooUnavailable. Un error de negocio aquí es, en la práctica, el addon sin actualizar: el comensal
        # sigue viendo la marca del registro mientras tanto, nunca un error.
        log.warning('marca de %s/%s: Odoo no la entregó (%s); se usa la del registro', tenant.restaurant_slug, tenant.venue_slug, exc)
        return None
    cache.set(key, company, settings.BRAND_CACHE_SECONDS)
    return company


def invalidate(restaurant: str, venue: str) -> None:
    cache.delete(_key(restaurant, venue))


def get_logo(tenant: Tenant, company: pos.CompanyBrand) -> tuple[bytes, str] | None:
    """(bytes, content-type) del logo, o None si Odoo no lo tiene, no es un ráster o no lo entregó. Una lectura a Odoo por versión.

    El None de "no hay / no es ráster / pesa de más" también se cachea: una marca que aún dice "hay logo" no manda a Odoo a
    cada comensal. El de "Odoo no respondió" NO se cachea: la marca puede estar en caché una hora diciendo "hay logo" y el
    logo debe salir en cuanto Odoo vuelva, no una hora después.
    """
    key = _logo_key(tenant, company.version)
    cached = cache.get(key, _MISSING)
    if cached is not _MISSING:
        return cached
    try:
        found = pos.fetch_company_logo(OdooClient(tenant.odoo))
    except OdooError as exc:
        # Incluye OdooUnavailable. La vista responde 404 "sin logo": un <img> solo entiende "no hay imagen".
        log.warning('logo de %s/%s: Odoo no lo entregó (%s); no se cachea', tenant.restaurant_slug, tenant.venue_slug, exc)
        return None
    cache.set(key, found, LOGO_CACHE_SECONDS)
    return found


def logo_url(restaurant: str, venue: str, version: str) -> str:
    # La versión va en la URL: cuando el restaurante cambia el logo, el navegador lo pide de nuevo aunque la caché sea larga.
    return f"{reverse('company-logo', args=[restaurant, venue])}?{urlencode({'v': version})}"


def brand_inputs(tenant: Tenant) -> dict:
    """Color, tipografía y redondeo de la marca SIN derivar (Odoo > registro; vacío o None si nadie los fijó).

    Los usa la plantilla del menú (plantillas/services.py) como valores por defecto de sus tokens: ahí no vale el
    tema derivado, porque un color que nadie eligió no debe pisar el acento del diseño de la plantilla.
    """
    registry = tenant.brand
    company = get_company_brand(tenant)
    return {'color': (company and company.color) or registry.get('color') or '',
            'fuente': (company and company.font) or registry.get('fuente') or '',
            'radio': (company and company.radius) or registry.get('radio') or None}


def brand_view(tenant: Tenant) -> dict:
    """La marca con la forma exacta de diner Brand. Precedencia por campo: valor no vacío en Odoo > registro.

    El registro no expone color/fuente/radio crudos, solo los ya validados por su theme(); como theme() es idempotente
    sobre su propia salida, esos valen como entrada para volver a derivar aquí con las mismas reglas. Así el tema
    (colorTexto, colorSuave, contraste) siempre sale del color final, venga de donde venga.
    """
    registry = tenant.brand
    company = get_company_brand(tenant)
    view = {'nombre': (company and company.name) or registry.get('nombre') or tenant.restaurant_name}
    for key, attr in TEXT_FIELDS:
        view[key] = (company and getattr(company, attr)) or registry.get(key) or ''
    if company and company.has_logo:
        view['logo'] = logo_url(tenant.restaurant_slug, tenant.venue_slug, company.version)
    else:
        view['logo'] = registry.get('logo') or None
    color = (company and company.color) or registry.get('color') or ''
    font = (company and company.font) or registry.get('fuente') or ''
    radius = (company and company.radius) or registry.get('radio')
    return {**view, **theme(color, font, radius)}
