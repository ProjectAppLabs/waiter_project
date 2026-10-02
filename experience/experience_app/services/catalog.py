"""Carta y fotos por restaurante, con caché para evitar lecturas repetidas."""
from experience_app.adapters.core import pos
from experience_app.adapters.core.pos import Client
from collections.abc import Callable
from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from django.core.cache import cache

from experience_app.adapters.core.context import RestaurantContext
from experience_app.utils.errors import ProductNotFound

PHOTO_SIZES = pos.PHOTO_SIZES
DEFAULT_PHOTO_SIZE = pos.DEFAULT_PHOTO_SIZE
# La clave de la foto lleva la versión de la plantilla: una foto nueva es una clave nueva, así que la caché puede
# vivir mucho más que la carta sin servir nunca una foto vieja (ni volver al sistema propio por cada comensal).
PHOTO_CACHE_SECONDS = max(settings.MENU_CACHE_SECONDS, 3600)
# Origen de la foto (catalog.Product.image_origin) → contrato del comensal. Vacío o un valor que la app no conoce sale
# como null: la app solo entiende estos tres.
PHOTO_ORIGINS = {'real': 'real', 'ai': 'ia', 'placeholder': 'placeholder'}


def _key(tenant: RestaurantContext) -> str:
    return f'catalog:{tenant.restaurant_slug}/{tenant.venue_slug}'


def _photo_key(tenant: RestaurantContext, product: pos.Product, size: str) -> str:
    return f'photo:{tenant.restaurant_slug}/{tenant.venue_slug}/{product.template_id}/{size}/{product.image_version}'


def get_catalog(tenant: RestaurantContext) -> pos.Catalog:
    cached = cache.get(_key(tenant))
    if cached is not None:
        return cached
    client = Client(tenant)
    session_id = pos.catalog_session(client, tenant.config_id)
    catalog = pos.load_catalog(client, session_id)
    cache.set(_key(tenant), catalog, settings.MENU_CACHE_SECONDS)
    return catalog


def invalidate(restaurant: str, venue: str) -> None:
    cache.delete(f'catalog:{restaurant}/{venue}')


def find_product(tenant: RestaurantContext, product_id: int) -> pos.Product:
    product = next((p for p in get_catalog(tenant).products if p.id == product_id), None)
    if product is None:
        raise ProductNotFound(product_id)
    return product


def get_photo(tenant: RestaurantContext, product: pos.Product, size: str = DEFAULT_PHOTO_SIZE) -> tuple[bytes, str] | None:
    """(bytes, content-type) de la foto, o None si el sistema propio ya no la tiene. Una sola lectura al sistema propio por foto, tamaño y versión.

    El None también se cachea: una carta que aún dice "tiene foto" no manda al sistema propio a cada comensal.
    """
    return cache.get_or_set(_photo_key(tenant, product, size),
                            lambda: pos.fetch_product_image(Client(tenant), product.template_id, size),
                            PHOTO_CACHE_SECONDS)


def get_gallery_photo(tenant: RestaurantContext, product: pos.Product, photo_id: int) -> tuple[bytes, str] | None:
    """La pertenencia se comprueba antes de usar una caché aislada por sede, plantilla, foto y versión."""
    photo = next((p for p in product.gallery if p['id'] == photo_id), None)
    if photo is None:
        return None
    key = f"gallery:{tenant.restaurant_slug}/{tenant.venue_slug}/{product.template_id}/{photo_id}/{photo['version']}"
    return cache.get_or_set(key, lambda: pos.fetch_gallery_image(Client(tenant), product.template_id, photo_id),
                            PHOTO_CACHE_SECONDS)


def _gallery_url(photo_url: Callable[[int, str], str], product_id: int, photo: dict) -> str:
    # Conserva la sede y la versión de la URL pública que recibe menu_view; así ambas entradas
    # (mesa y domicilio) usan la misma ruta sin conocer el almacenamiento interno.
    parts = urlsplit(photo_url(product_id, photo['version']))
    return urlunsplit(parts._replace(path=f"{parts.path.rstrip('/')}/galeria/{photo['id']}/"))


def menu_view(catalog: pos.Catalog, photo_url: Callable[[int, str], str]) -> dict:
    """Carta normalizada para el comensal: categorías con sus productos, en el orden del POS.

    `photo_url(product_id, version)` construye la URL pública de la foto: la carta usa la ruta pública del comensal, y la
    versión (write_date de la plantilla) cambia la URL cuando cambia la foto para que la caché pública no la retenga.
    `fotoOrigen` dice de dónde salió la foto ('real' | 'ia' | 'placeholder' | null) y `imagenesDeReferencia`, si la carta
    debe avisar que las fotos son de referencia.
    """
    categories = sorted(catalog.categories, key=lambda c: (c.sequence, c.id))
    # `atributos` (Contrato 2 del Plan H): piezas, picante, etiquetas, abv… tal como los dejó el restaurante en
    # product.template.diner_attributes; {} cuando no hay. Una plantilla pinta lo que existe y omite lo que no.
    items = [{'id': p.id, 'nombre': p.name, 'precio': p.final_price, 'agotado': p.sold_out, 'categorias': p.category_ids,
              'descripcion': p.description, 'favorito': p.favorite,
              'foto': photo_url(p.id, p.image_version) if p.has_image else None,
              'fotos': [_gallery_url(photo_url, p.id, photo) for photo in p.gallery],
              'fotoOrigen': PHOTO_ORIGINS.get(p.image_origin), 'atributos': dict(p.attributes)}
             for p in catalog.products]
    # Límite legal (docs/diseno/2026-09-05-imagenes-menu.md): una imagen generada no representa la porción servida, así que
    # la carta avisa «Imágenes de referencia» en cuanto un plato VISIBLE con foto la tiene generada con IA. Se mira la carta
    # entera (todas las categorías), no la categoría filtrada: el aviso no debe aparecer y desaparecer según lo que el
    # comensal esté mirando; pero un producto sin categoría no se pinta y por tanto tampoco cuenta.
    grouped = [{'id': c.id, 'nombre': c.name, 'productos': [i for i in items if c.id in i['categorias']]} for c in categories]
    reference_images = any(i['foto'] and i['fotoOrigen'] == 'ia' for g in grouped for i in g['productos'])
    return {
        'restaurante': catalog.company_name,
        'imagenesDeReferencia': reference_images,
        'categorias': grouped,
    }
