"""Plan K4: galería de decoraciones de una sede (subida desde el POS, servida al comensal por id).

Límites pensados para un PNG o WebP con transparencia que se anima encima de un componente: 300 KB, 1024 px de lado,
30 por sede. Sin Pillow: el tipo y las dimensiones se leen de las cabeceras del archivo (utils/images.py).
"""
import base64
import re
import unicodedata
from urllib.parse import quote

from django.db import IntegrityError, transaction

from experience_app.diseno.models import MenuDecoration
from experience_app.utils.images import image_content_type, image_dimensions

MAX_BYTES = 300_000
MAX_SIDE = 1024
MAX_PER_VENUE = 30
TYPES = {'image/png': 'png', 'image/webp': 'webp'}
SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


class InvalidDecoration(ValueError):
    """La imagen o el nombre no cumplen los límites de la galería."""


def slugify(name: str) -> str:
    plain = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii').lower()
    slug = re.sub(r'[^a-z0-9]+', '-', plain).strip('-')[:40].strip('-')
    return slug or 'decoracion'


def decode(image) -> bytes:
    """Acepta base64 puro o una URL data:image/...;base64,… (lo que produce un FileReader en el POS)."""
    if not isinstance(image, str) or not image.strip():
        raise InvalidDecoration('Envía la imagen en base64.')
    payload = image.split(',', 1)[1] if image.startswith('data:') else image
    if len(payload) > MAX_BYTES * 4 // 3 + 4:
        raise InvalidDecoration(f'La imagen supera los {MAX_BYTES // 1000} KB.')
    try:
        return base64.b64decode(payload, validate=True)
    except ValueError:
        raise InvalidDecoration('La imagen no es un base64 válido.') from None


def view(decoration: MenuDecoration) -> dict:
    return {'id': decoration.slug, 'nombre': decoration.name, 'tipo': decoration.content_type, 'ancho': decoration.width,
            'alto': decoration.height, 'peso': decoration.size, 'archivo': file_path(decoration), 'creada': decoration.created_at.isoformat()}


def file_path(decoration: MenuDecoration) -> str:
    version = decoration.updated_at.strftime('%Y%m%d%H%M%S') if decoration.updated_at else '0'
    return f'/api/v1/{quote(decoration.restaurant_slug)}/decoraciones/{decoration.slug}/?v={version}'


def listing(restaurant: str, venue: str) -> list[dict]:
    return [view(d) for d in MenuDecoration.objects.filter(restaurant_slug=restaurant, venue_slug='').defer('data')]


def files(restaurant: str, venue: str) -> dict[str, str]:
    """{id: archivo} de la sede, para que el validador resuelva <decoracion id="…"/> a su ruta."""
    return {d.slug: file_path(d) for d in MenuDecoration.objects.filter(restaurant_slug=restaurant, venue_slug='').defer('data')}


def get(restaurant: str, venue: str, slug: str) -> MenuDecoration | None:
    return MenuDecoration.objects.filter(restaurant_slug=restaurant, venue_slug='', slug=slug).first()


@transaction.atomic
def create(restaurant: str, venue: str, name, image, created_by: str = '') -> MenuDecoration:
    if not isinstance(name, str) or not name.strip():
        raise InvalidDecoration('Ponle un nombre a la decoración (por ejemplo, «Hoja de menta»).')
    name = name.strip()[:60]
    data = decode(image)
    if len(data) > MAX_BYTES:
        raise InvalidDecoration(f'La imagen pesa {len(data) // 1000} KB; el máximo es {MAX_BYTES // 1000} KB.')
    content_type = image_content_type(data)
    if content_type not in TYPES:
        raise InvalidDecoration('Solo se admiten PNG o WebP (con transparencia si la quieres).')
    dimensions = image_dimensions(data)
    if dimensions is None:
        raise InvalidDecoration('No se pudieron leer las dimensiones de la imagen.')
    width, height = dimensions
    if width > MAX_SIDE or height > MAX_SIDE or width < 16 or height < 16:
        raise InvalidDecoration(f'La imagen mide {width}×{height} px; debe estar entre 16 y {MAX_SIDE} px de lado.')
    existing = MenuDecoration.objects.select_for_update().filter(restaurant_slug=restaurant, venue_slug='')
    if existing.count() >= MAX_PER_VENUE:
        raise InvalidDecoration(f'La galería ya tiene {MAX_PER_VENUE} decoraciones; elimina alguna antes de subir otra.')
    taken = set(existing.values_list('slug', flat=True))
    base = slugify(name)
    slug = base
    counter = 2
    while slug in taken:
        slug = f'{base[:36]}-{counter}'
        counter += 1
    try:
        return MenuDecoration.objects.create(restaurant_slug=restaurant, venue_slug='', slug=slug, name=name, content_type=content_type,
                                             data=data, width=width, height=height, size=len(data), created_by=created_by[:120])
    except IntegrityError:
        raise InvalidDecoration('Ya existe una decoración con ese nombre; elige otro.') from None


def remove(restaurant: str, venue: str, slug: str) -> bool:
    deleted, _ = MenuDecoration.objects.filter(restaurant_slug=restaurant, venue_slug='', slug=slug).delete()
    return bool(deleted)
