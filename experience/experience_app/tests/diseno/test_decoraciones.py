"""K4: galería de decoraciones por sede: límites, aislamiento, servicio al comensal y uso desde las plantillas."""
import base64
import struct
import zlib
from unittest.mock import patch

import pytest

from experience_app.diseno import decoraciones, plantillas
from experience_app.diseno import services as design
from experience_app.diseno.models import MenuDecoration
from experience_app.mcp import keys
from experience_app.plantillas import services as templates
from experience_app.tests.conftest import TABLE
from experience_app.tests.diseno.test_plantillas import verifier
from experience_app.tests.diseno.verification import verify_mcp
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db(transaction=True)
MINIMAL = '<ranura nombre="ficha"><ranura nombre="foto"/><h3><dato nombre="plato.nombre"/></h3><ranura nombre="precio"/></ranura><ranura nombre="agregar"/>'


def png(width=64, height=64, filler=0):
    """PNG con solo la cabecera IHDR (y relleno opcional): basta para leer tipo y dimensiones sin Pillow."""
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    chunk = struct.pack('>I', len(ihdr)) + b'IHDR' + ihdr + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr))
    return b'\x89PNG\r\n\x1a\n' + chunk + b'\x00' * filler


def webp(width=32, height=24):
    bits = (width - 1) | ((height - 1) << 14)
    body = b'VP8L' + struct.pack('<I', 5) + b'\x2f' + struct.pack('<I', bits)
    return b'RIFF' + struct.pack('<I', 4 + len(body)) + b'WEBP' + body


def b64(data, data_url=False):
    encoded = base64.b64encode(data).decode()
    return f'data:image/png;base64,{encoded}' if data_url else encoded


INTERNAL = '/internal/v1/burger-house/poblado/decoraciones/'


@pytest.fixture
def key_header(settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'interna'
    return {'HTTP_X_INTERNAL_KEY': 'interna'}


# Falla si la galería acepta formatos ejecutables, imágenes pesadas o enormes, nombres vacíos o más de las permitidas.
@pytest.mark.parametrize('name, image, message', [
    ('', b64(png()), 'nombre'),
    ('Hoja', 'no-es-base64!!', 'base64'),
    ('Hoja', b64(b'<svg xmlns="http://www.w3.org/2000/svg"/>'), 'PNG o WebP'),
    ('Hoja', b64(b'\xff\xd8\xff\xe0' + b'\x00' * 40), 'PNG o WebP'),
    ('Hoja', b64(png(2048, 100)), 'entre 16 y 1024'),
    ('Hoja', b64(png(8, 8)), 'entre 16 y 1024'),
    ('Hoja', b64(png(64, 64, filler=decoraciones.MAX_BYTES)), 'KB'),
    ('Hoja', b64(b'\x89PNG\r\n\x1a\n' + b'\x00' * 8), 'dimensiones'),
])
# Falla si una decoración con nombre, codificación, formato, dimensiones o peso inválidos se guarda o pierde el mensaje específico.
def test_invalid_uploads_are_rejected(name, image, message):
    with pytest.raises(decoraciones.InvalidDecoration, match=message):
        decoraciones.create('burger-house', 'poblado', name, image)
    assert MenuDecoration.objects.count() == 0


# Falla si dos decoraciones con el mismo nombre chocan, si el id no es apto para <decoracion id> o si se supera el cupo.
def test_slugs_are_unique_and_the_gallery_has_a_cap():
    first = decoraciones.create('burger-house', 'poblado', 'Hoja de Menta ✨', b64(png(), data_url=True), 'Laura')
    second = decoraciones.create('burger-house', 'poblado', 'hoja de menta', b64(webp()))
    assert (first.slug, second.slug) == ('hoja-de-menta', 'hoja-de-menta-2')
    assert first.content_type == 'image/png' and (first.width, first.height) == (64, 64) and first.created_by == 'Laura'
    assert second.content_type == 'image/webp' and (second.width, second.height) == (32, 24)
    assert decoraciones.create('otra-organizacion', 'centro', 'Hoja de menta', b64(png())).slug == 'hoja-de-menta'
    for index in range(decoraciones.MAX_PER_VENUE - 2):
        decoraciones.create('burger-house', 'poblado', f'Pieza {index}', b64(png()))
    with pytest.raises(decoraciones.InvalidDecoration, match='elimina alguna'):
        decoraciones.create('burger-house', 'poblado', 'Una más', b64(png()))
    assert decoraciones.slugify('¡¡Ñandú & Co.!!') == 'nandu-co' and decoraciones.slugify('') == 'decoracion'


# Falla si el POS no puede subir, listar y borrar por la ruta interna, o si un cliente sin clave puede hacerlo.
def test_internal_endpoints_require_the_internal_key(api_client, key_header):
    assert api_client.post(INTERNAL, {'nombre': 'Hoja', 'imagen': b64(png())}, format='json').status_code == 401
    assert api_client.get(INTERNAL).status_code == 401
    created = api_client.post(INTERNAL, {'nombre': 'Hoja', 'imagen': b64(png(), data_url=True), 'creadaPor': 'Laura'}, format='json', **key_header)
    assert created.status_code == 201 and created['Cache-Control'] == 'no-store'
    body = created.json()
    assert body['id'] == 'hoja' and body['archivo'].startswith('/api/v1/burger-house/decoraciones/hoja/?v=') and body['peso'] == len(png())
    assert api_client.post(INTERNAL, {'nombre': 'Rota', 'imagen': b64(b'GIF89a' + b'\x00' * 20)}, format='json', **key_header).status_code == 400
    listed = api_client.get(INTERNAL, **key_header).json()
    assert [d['id'] for d in listed['decoraciones']] == ['hoja'] and listed['limites']['cantidad'] == decoraciones.MAX_PER_VENUE
    assert {d['id'] for d in listed['fabrica']} == set(plantillas.FACTORY_FILES)
    assert api_client.delete(f'{INTERNAL}hoja/').status_code == 401
    assert api_client.delete(f'{INTERNAL}otra/', **key_header).status_code == 404
    assert api_client.delete(f'{INTERNAL}hoja/', **key_header).json() == {'eliminada': 'hoja'}
    assert MenuDecoration.objects.count() == 0


# Falla si el comensal no recibe la imagen con cabeceras seguras e inmutables, o si una organización ve las de otra.
def test_public_image_and_listing_are_scoped_to_the_venue(api_client, client):
    created = decoraciones.create('burger-house', 'poblado', 'Hoja', b64(png()))
    listing = client.get('/api/v1/burger-house/poblado/decoraciones/')
    assert listing.status_code == 200 and listing['Cache-Control'] == 'no-store'
    assert [d['id'] for d in listing.json()['decoraciones']] == ['hoja'] and 'data' not in listing.json()['decoraciones'][0]
    assert client.get('/api/v1/otra-organizacion/centro/decoraciones/').json()['decoraciones'] == []
    version = decoraciones.file_path(created).rsplit('v=', 1)[1]
    image = client.get(f'/api/v1/burger-house/poblado/decoraciones/hoja/?v={version}')
    assert image.status_code == 200 and image['Content-Type'] == 'image/png' and image.content == png()
    assert image['Cache-Control'] == 'public, max-age=86400, immutable' and image['X-Content-Type-Options'] == 'nosniff'
    assert 'sandbox' in image['Content-Security-Policy'] and image['Content-Disposition'] == 'inline; filename="hoja.png"'
    assert client.get('/api/v1/burger-house/poblado/decoraciones/hoja/?v=otra')['Cache-Control'] == 'no-store'
    assert client.get('/api/v1/otra-organizacion/centro/decoraciones/hoja/').status_code == 404
    assert client.get('/api/v1/burger-house/poblado/decoraciones/nada/').status_code == 404
    for method in (client.post, client.put, client.delete):
        assert method('/api/v1/burger-house/poblado/decoraciones/hoja/').status_code == 405


# Falla si una plantilla puede usar una decoración de otra organización, si la de la propia sede no resuelve a su ruta, o si el
# El paquete de fábrica deja de estar disponible en cualquier sede.
def test_templates_use_venue_decorations_only_within_their_venue():
    decoraciones.create('burger-house', 'poblado', 'Hoja', b64(png()))
    html = '<decoracion id="hoja" movimiento="flotar"/><decoracion id="stars"/>' + MINIMAL
    with pytest.raises(plantillas.InvalidTemplate, match='desconocida «hoja»'):
        plantillas.compile_html('plato', html)
    with plantillas.for_venue('otra-organizacion', 'centro'), pytest.raises(plantillas.InvalidTemplate, match='desconocida «hoja»'):
        plantillas.compile_html('plato', html)
    with plantillas.for_venue('burger-house', 'poblado'):
        tree = plantillas.compile_html('plato', html)
    assert tree[0]['archivo'].startswith('/api/v1/burger-house/decoraciones/hoja/?v=') and tree[0]['movimiento'] == 'flotar'
    assert tree[1] == {'tipo': 'decoracion', 'id': 'stars', 'movimiento': 'ninguno', 'posicion': 'libre', 'archivo': '/smart-menu/stars.png'}
    assert plantillas.to_html(tree).count('<decoracion id="hoja"') == 1 and 'archivo' not in plantillas.to_html(tree)
    # Un id de sede nunca pisa uno de fábrica: la fábrica manda.
    decoraciones.create('burger-house', 'poblado', 'Stars', b64(webp()))
    with plantillas.for_venue('burger-house', 'poblado'):
        assert plantillas.compile_html('plato', '<decoracion id="stars"/>' + MINIMAL)[0]['archivo'] == '/smart-menu/stars.png'


# Falla si borrar una decoración deja una plantilla rota en la carta en vez de volver a la de fábrica, o si el
# El guardado y la lectura del tema no fijan la sede al validar.
def test_saved_template_falls_back_when_its_decoration_is_deleted(company_brand_stub, caplog):
    decoraciones.create('burger-house', 'poblado', 'Hoja', b64(png()))
    html = '<decoracion id="hoja"/>' + MINIMAL
    with patch('experience_app.services.discount.percent_for', return_value=5):
        templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'componentes': {'plato': {'version': 1, 'html': html}}}})
        assert templates.settings_view('burger-house', 'poblado')['tema']['componentes']['plato']['arbol'][0]['id'] == 'hoja'
        assert templates.resolve_template(TABLE)['tema']['componentes']['plato']['arbol'][0]['archivo'].startswith('/api/v1/')
        with pytest.raises(templates.InvalidSettings, match='desconocida «hoja»'):
            templates.save('otra-organizacion', 'centro', {'plantilla': 'S1', 'tema': {'componentes': {'plato': {'version': 1, 'html': html}}}})
        assert decoraciones.remove('burger-house', 'poblado', 'hoja')
        templates.invalidate('burger-house', 'poblado')
        with caplog.at_level('WARNING'):
            assert templates.settings_view('burger-house', 'poblado')['tema']['componentes'] == design.defaults()['componentes']
        assert 'se usa la de fábrica' in caplog.text
        assert templates.resolve_template(TABLE)['tema']['componentes'] == design.defaults()['componentes']


@pytest.fixture
def owner(company_brand_stub, settings, verification_threads):
    settings.DINER_PUBLIC_URL = 'https://menu.test'
    record, raw = keys.create('burger-house', 'poblado', 'Diseño de prueba')
    with patch('experience_app.mcp.tools.resolve', return_value=TABLE), \
            patch('experience_app.diseno.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5):
        yield record, raw


# Falla si la vista previa del POS (sin clave MCP) pierde en silencio una plantilla que usa una decoración de la sede.
def test_pos_preview_keeps_venue_decorations(api_client, client, company_brand_stub, settings):
    settings.EXPERIENCE_INTERNAL_KEY = 'interna'
    decoraciones.create('burger-house', 'poblado', 'Hoja', b64(png()))
    body = {'plantilla': 'S1', 'tema': {'componentes': {'plato': {'version': 1, 'html': '<decoracion id="hoja"/>' + MINIMAL}}}}
    with patch('experience_app.diseno.views.resolve', return_value=TABLE), patch('experience_app.services.discount.percent_for', return_value=5):
        response = api_client.post('/internal/v1/burger-house/poblado/menu/borradores/', body, format='json', HTTP_X_INTERNAL_KEY='interna')
    assert response.status_code == 201, response.json()
    preview = client.get(f'/api/v1/burger-house/poblado/borradores/{response.json()["borrador"]}/').json()['plantilla']['tema']
    assert preview['componentes']['plato']['arbol'][0]['archivo'].startswith('/api/v1/burger-house/decoraciones/hoja/?v=')
    assert response.json()['vista_previa'][0]['despues'].startswith('plantilla propia (v1')


# Falla si la IA no ve las decoraciones de la sede, no puede prepararlas en una plantilla o el borrador público no
# Trae la ruta del archivo que el comensal dibuja.
def test_mcp_lists_and_uses_venue_decorations(client, owner, settings, tmp_path):
    _, raw = owner
    decoraciones.create('burger-house', 'poblado', 'Hoja de menta', b64(png()))
    read = call(client, raw, 'leer_componente', {'componente': 'plato'})['structuredContent']
    assert [d['id'] for d in read['decoraciones']['sede']] == ['hoja-de-menta'] and read['decoraciones']['fabrica']
    assert call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': '<decoracion id="rama"/>' + MINIMAL})['isError']
    draft = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': '<decoracion id="hoja-de-menta" movimiento="latir" posicion="arriba-derecha"/>' + MINIMAL})['structuredContent']
    preview = client.get(f'/api/v1/burger-house/poblado/borradores/{draft["borrador"]}/').json()['plantilla']['tema']
    node = preview['componentes']['plato']['arbol'][0]
    assert node['archivo'].startswith('/api/v1/burger-house/decoraciones/hoja-de-menta/?v=') and node['movimiento'] == 'latir'
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    assert verify_mcp(client, raw, draft['borrador'])['structuredContent']['ok'] is True
    assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    assert 'hoja-de-menta' in call(client, raw, 'leer_componente', {'componente': 'plato'})['structuredContent']['plantilla_actual']['html']
    assert design.SCHEMA['properties']['componentes']['properties']['plato']['componente'] == 'plato'
