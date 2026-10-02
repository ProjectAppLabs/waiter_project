"""Fotos WebP sin metadatos y miniaturas almacenadas junto al original."""
import base64
import binascii
import uuid
import warnings
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from PIL import Image, ImageOps

from tenancy.http import Problem, model_dict

from .models import ProductPhoto
from .services import valid

MAX_BYTES = 12 * 1024 * 1024


def convert(raw):
    valid(isinstance(raw, str) and 0 < len(raw) <= 4 * ((MAX_BYTES + 2) // 3), 'Selecciona una imagen de hasta 12 MB.')
    try:
        data = base64.b64decode(raw, validate=True)
        valid(len(data) <= MAX_BYTES, 'La imagen supera 12 MB.')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                valid(source.format in ('PNG', 'JPEG', 'WEBP'), 'Usa una imagen PNG, JPEG o WebP.')
                source.load()
                oriented = ImageOps.exif_transpose(source)
                image = oriented.convert('RGBA' if 'A' in oriented.getbands() or 'transparency' in oriented.info else 'RGB')
                image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                image.info.clear()
                return image
    except (binascii.Error, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise Problem('invalid_data', 'No se pudo leer la imagen; selecciona una imagen válida de tamaño razonable.') from exc


def encoded(image):
    output = BytesIO()
    image.save(output, format='WEBP', quality=80, method=6)
    return output.getvalue()


def thumbnail_path(name, size):
    return str(Path(name).with_suffix('')) + f'-{size}.webp'


def store_image(org, image):
    name = f'{org.pk}/products/{uuid.uuid4().hex}.webp'
    data = encoded(image)
    saved = []
    try:
        name = default_storage.save(name, ContentFile(data))
        saved.append(name)
        for size in (128, 256, 512, 1024):
            small = image.copy()
            small.thumbnail((size, size), Image.Resampling.LANCZOS)
            saved.append(default_storage.save(thumbnail_path(name, size), ContentFile(encoded(small))))
    except Exception:
        for path in saved:
            default_storage.delete(path)
        raise
    return name, len(data)


def set_image(product, raw):
    if raw is None:
        product.image = ''
    else:
        product.image, _ = store_image(product.organization, convert(raw))
    product.image_version = timezone.now()
    product.save(update_fields=['image', 'image_version'])


def photo_dict(photo):
    return model_dict(photo, ('id', 'sequence', 'width', 'height'))


def set_photos(product, raw):
    valid(isinstance(raw, list) and len(raw) <= 4, 'La galería admite hasta cuatro fotos.')
    existing = {p.pk: p for p in product.photos.all()}
    kept, prepared = set(), []
    # Convertir y validar todo antes de escribir archivos o borrar filas.
    for item in raw:
        valid(isinstance(item, dict) and set(item) in ({'id'}, {'image'}))
        if 'id' in item:
            pk = item['id']
            valid(type(pk) is int and pk in existing and pk not in kept, 'No repitas fotos y selecciona las del producto.')
            kept.add(pk)
            prepared.append(existing[pk])
        else:
            prepared.append(convert(item['image']))
    result = []
    for sequence, item in enumerate(prepared):
        if isinstance(item, ProductPhoto):
            item.sequence = sequence
            item.save(update_fields=['sequence'])
            photo = item
        else:
            name, size = store_image(product.organization, item)
            photo = ProductPhoto.objects.create(product=product, sequence=sequence, image=name,
                                                width=item.width, height=item.height, file_size=size)
        result.append(photo_dict(photo))
    product.photos.filter(pk__in=set(existing) - kept).delete()
    product.image_version = timezone.now()
    product.save(update_fields=['image_version'])
    return result
