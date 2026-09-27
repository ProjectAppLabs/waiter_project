from dataclasses import replace
from unittest.mock import patch

from experience_app.services import catalog
from experience_app.tests.conftest import ANGUS, CATALOG, LIMONADA, TABLE


@patch('experience_app.services.catalog.pos.load_catalog', return_value=CATALOG)
@patch('experience_app.services.catalog.pos.catalog_session', return_value=4)
@patch('experience_app.services.catalog.OdooClient')
def test_catalog_hits_odoo_once_until_invalidated(client, ensure, load):
    """Atrapa una carta que golpea Odoo en cada comensal, o una invalidación que no invalida."""
    catalog.get_catalog(TABLE)
    catalog.get_catalog(TABLE)
    assert load.call_count == 1
    catalog.invalidate('burger-house', 'poblado')
    catalog.get_catalog(TABLE)
    assert load.call_count == 2


@patch('experience_app.services.catalog.pos.fetch_product_image', return_value=(b'\x89PNG', 'image/png'))
@patch('experience_app.services.catalog.OdooClient')
def test_photo_hits_odoo_once_per_size_and_version(client, fetch):
    """Atrapa una foto que va a Odoo por cada comensal, o una foto vieja servida bajo la versión nueva (o con el tamaño equivocado)."""
    assert catalog.get_photo(TABLE, ANGUS) == (b'\x89PNG', 'image/png')
    catalog.get_photo(TABLE, ANGUS)
    assert fetch.call_count == 1
    catalog.get_photo(TABLE, ANGUS, 'plato')
    assert fetch.call_count == 2
    catalog.get_photo(TABLE, replace(ANGUS, image_version='20260906120000'))
    assert fetch.call_count == 3


def photo_url(product_id, version):
    return f'/fotos/{product_id}/?v={version}'


def test_menu_view_groups_products_by_category_in_pos_order():
    """Atrapa productos huérfanos, categorías fuera del orden del POS o un plato sin descripción, favorito o foto."""
    menu = catalog.menu_view(CATALOG, photo_url)
    assert [c['nombre'] for c in menu['categorias']] == ['Bebidas', 'Hamburguesas']
    assert menu['categorias'][1]['productos'][0] == {
        'id': 3, 'nombre': 'Hamburguesa Angus', 'precio': 43911.0, 'agotado': False, 'categorias': [2],
        'descripcion': 'Carne angus 200 g, queso madurado', 'favorito': True, 'foto': '/fotos/3/?v=20260905010203',
        'fotoOrigen': 'ia', 'atributos': {},
    }


def test_menu_view_translates_the_photo_origin_for_the_diner():
    """Atrapa el valor de Odoo ('ai') filtrado tal cual, un plato sin marcar que no salga como null, o un valor desconocido
    que rompa el tipo de la app."""
    def origin_of(product):
        return catalog.menu_view(replace(CATALOG, products=[product]), photo_url)['categorias'][1]['productos'][0]['fotoOrigen']

    assert origin_of(ANGUS) == 'ia'
    assert origin_of(replace(ANGUS, image_origin='real')) == 'real'
    assert origin_of(replace(ANGUS, image_origin='placeholder')) == 'placeholder'
    assert origin_of(replace(ANGUS, image_origin='')) is None
    assert origin_of(replace(ANGUS, image_origin='stock')) is None


def test_menu_view_flags_reference_images_only_when_a_dish_with_photo_was_generated():
    """Atrapa una carta con foto generada sin el aviso legal, o el aviso encendido por un plato marcado 'ai' que no tiene foto."""
    assert catalog.menu_view(CATALOG, photo_url)['imagenesDeReferencia'] is True
    real = replace(CATALOG, products=[replace(ANGUS, image_origin='real'), LIMONADA])
    assert catalog.menu_view(real, photo_url)['imagenesDeReferencia'] is False
    marked_without_photo = replace(CATALOG, products=[replace(ANGUS, image_origin=''), replace(LIMONADA, image_origin='ai')])
    assert catalog.menu_view(marked_without_photo, photo_url)['imagenesDeReferencia'] is False


def test_menu_view_gives_no_photo_url_to_products_without_image():
    """Atrapa una URL de foto para un plato sin imagen: el comensal vería un hueco roto en cada tarjeta."""
    limonada = catalog.menu_view(CATALOG, photo_url)['categorias'][0]['productos'][0]
    assert limonada['foto'] is None
    assert (limonada['descripcion'], limonada['favorito']) == ('', False)


def test_menu_view_changes_the_photo_url_when_the_photo_changes():
    """Atrapa una foto cambiada que el navegador no vuelve a pedir: la URL debe llevar la versión de la plantilla."""
    before = catalog.menu_view(CATALOG, photo_url)['categorias'][1]['productos'][0]['foto']
    changed = replace(CATALOG, products=[replace(ANGUS, image_version='20260906120000')])
    after = catalog.menu_view(changed, photo_url)['categorias'][1]['productos'][0]['foto']
    assert before != after
    assert after == '/fotos/3/?v=20260906120000'


# Falla si un producto que no se pinta (sin categoría) enciende el aviso de imágenes de referencia.
def test_reference_images_flag_only_counts_visible_dishes():
    from dataclasses import replace

    from experience_app.services.catalog import menu_view
    from experience_app.tests.conftest import ANGUS, CATALOG, LIMONADA
    hidden = replace(CATALOG, products=[replace(ANGUS, category_ids=[]), LIMONADA])
    view = menu_view(hidden, lambda pid, v: f'/f/{pid}?v={v}')
    assert view['imagenesDeReferencia'] is False
    assert [i['nombre'] for c in view['categorias'] for i in c['productos']] == ['Limonada de Coco']
