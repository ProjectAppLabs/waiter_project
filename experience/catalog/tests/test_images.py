"""Fotos y rutas públicas con almacenamiento temporal en cada prueba."""
import base64
from io import BytesIO

import pytest
from django.core.files.storage import default_storage
from PIL import Image
from rest_framework.test import APIClient

from catalog.images import thumbnail_path
from catalog.models import ProductPhoto
from tenancy.tests.helpers import organization

BASE = '/api/pos/v1'


def picture(width=1800, height=1200, mode='PNG'):
    image = Image.new('RGB', (width, height), '#aadc88')
    data = BytesIO()
    image.save(data, format=mode)
    return base64.b64encode(data.getvalue()).decode()


def test_principal_webp_miniaturas_ruta_publica(setup):
    # Falla si se conserva el PNG, faltan miniaturas, el tamaño excede el límite o la imagen exige sesión.
    x = setup
    response = x['client'].patch(f'{BASE}/products/{x["dish"].pk}', {'image': picture()}, format='json')
    assert response.status_code == 200, response.data
    assert response.json()['product']['has_image'] is True
    assert response.json()['product']['image_version'].endswith('Z')
    x['dish'].refresh_from_db()
    assert x['dish'].image.name.startswith(f'{x["org"].pk}/products/')
    with Image.open(x['dish'].image) as image:
        assert image.format == 'WEBP' and max(image.size) == 1600 and not image.getexif()
    for size in (128, 256, 512, 1024):
        with default_storage.open(thumbnail_path(x['dish'].image.name, size)) as source:
            with Image.open(source) as image:
                assert max(image.size) == size and image.format == 'WEBP'
    public = APIClient()
    public.credentials(HTTP_X_WAITER_ORG=x['org'].slug)
    for size, dimension in [('card', 512), ('dish', 1024)]:
        response = public.get(f'{BASE}/photos/{x["dish"].pk}?size={size}&v=123')
        assert response.status_code == 200
        assert response['Cache-Control'] == 'public, max-age=86400, immutable'
        assert response['Content-Type'] == 'image/webp'
        with Image.open(BytesIO(b''.join(response.streaming_content))) as image:
            assert max(image.size) == dimension
    assert public.get(f'{BASE}/photos/{x["dish"].pk}?size=otro').status_code == 400
    other = organization('otra')
    public.credentials(HTTP_X_WAITER_ORG=other.slug)
    assert public.get(f'{BASE}/photos/{x["dish"].pk}').status_code == 404
    # Falla si una foto pedida desde <img> (sin cabecera) no encuentra la organización por la URL, o si la URL abre
    # las fotos de otra organización.
    public.credentials()
    assert public.get(f'{BASE}/photos/{x["dish"].pk}?org={x["org"].slug}&size=card').status_code == 200
    assert public.get(f'{BASE}/photos/{x["dish"].pk}?org={other.slug}&size=card').status_code == 404
    assert x['client'].patch(f'{BASE}/products/{x["dish"].pk}', {'image': None}, format='json').json()['product']['has_image'] is False


def test_galeria_cuatro_orden_y_aislamiento(setup):
    # Falla si la galería supera cuatro, pierde orden, acepta ids ajenos o no publica WebP.
    x = setup
    url = f'{BASE}/products/{x["dish"].pk}/photos'
    encoded = picture(70, 40)
    a = x['client'].put(url, [{'image': encoded}] * 4, format='json')
    assert a.status_code == 200, a.data
    photos = a.json()['photos']
    assert [(p['sequence'], p['width'], p['height']) for p in photos] == [(i, 70, 40) for i in range(4)]
    assert x['client'].put(url, [{'image': encoded}] * 5, format='json').status_code == 400
    b = x['client'].put(url, [{'id': p['id']} for p in reversed(photos)], format='json')
    assert [p['id'] for p in b.json()['photos']] == [p['id'] for p in reversed(photos)]
    assert [p['sequence'] for p in b.json()['photos']] == [0, 1, 2, 3]
    assert x['client'].put(url, [{'id': photos[0]['id']}] * 2, format='json').status_code == 400
    assert x['client'].put(f'{BASE}/products/{x["ingredient"].pk}/photos', [{'id': photos[0]['id']}], format='json').status_code == 400
    public = APIClient()
    public.credentials(HTTP_X_WAITER_ORG=x['org'].slug)
    response = public.get(f'{BASE}/photos/gallery/{photos[0]["id"]}')
    assert response.status_code == 200 and response['Content-Type'] == 'image/webp'
    with Image.open(BytesIO(b''.join(response.streaming_content))) as image:
        assert image.format == 'WEBP'
    assert x['client'].put(url, [{'id': photos[0]['id']}, {'image': 'invalida'}], format='json').status_code == 400
    assert ProductPhoto.objects.count() == 4
    assert x['client'].put(url, [], format='json').json() == {'photos': []}


@pytest.mark.parametrize('raw', ['no-base64', '', 14, base64.b64encode(b'no es una imagen').decode(), 'a' * (16 * 1024 * 1024 + 4)])
def test_imagen_invalida_no_escribe(setup, raw):
    # Falla si datos malformados o mayores de 12 MB crean una foto o provocan un error de servidor.
    x = setup
    response = x['client'].patch(f'{BASE}/products/{x["dish"].pk}', {'image': raw}, format='json')
    assert response.status_code == 400, response.data
    x['dish'].refresh_from_db()
    assert not x['dish'].image
