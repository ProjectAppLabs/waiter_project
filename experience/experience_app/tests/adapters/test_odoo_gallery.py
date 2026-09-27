import base64
from copy import deepcopy
from unittest.mock import Mock

import pytest

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient
from experience_app.tests.adapters.test_odoo_pos import CREDS, LOAD_DATA
from experience_app.tests.helpers import AUTH, FakeResponse, FakeSession, params

WEBP = b'RIFF\x00\x00\x00\x00WEBPVP8 '


# // Falla si hay una consulta por plato, se descargan binarios, se pierde el orden o no se comparten las fotos entre variantes.
def test_catalog_reads_all_gallery_metadata_once_in_sequence_order():
    raw = deepcopy(LOAD_DATA.json()['result'])
    raw['product.product'].append({'id': 8, 'product_tmpl_id': 21})
    photos = [
        {'id': 44, 'product_tmpl_id': [21, 'Angus'], 'write_date': '2026-09-27 01:02:04'},
        {'id': 41, 'product_tmpl_id': [21, 'Angus'], 'write_date': '2026-09-27 01:02:03'},
    ]
    http = FakeSession([AUTH, FakeResponse(raw), FakeResponse([]), FakeResponse(photos)])
    catalog = pos.load_catalog(OdooClient(CREDS, http), 4)
    reads = [params(c) for c in http.calls[1:] if params(c)['model'] == 'projectapp.product.photo']
    assert len(reads) == 1
    assert reads[0]['method'] == 'search_read'
    assert reads[0]['args'] == [[['product_tmpl_id', 'in', [21, 22]]], ['product_tmpl_id', 'write_date']]
    assert reads[0]['kwargs']['order'] == 'sequence, id'
    expected = [{'id': 44, 'version': '20260927010204'}, {'id': 41, 'version': '20260927010203'}]
    assert catalog.products[0].gallery == catalog.products[2].gallery == expected
    assert catalog.products[1].gallery == []


# // Falla si se consultan fotos fuera del catálogo, incluyendo platos archivados o no disponibles en el POS.
def test_gallery_query_only_uses_visible_templates_and_skips_an_empty_catalog():
    raw = deepcopy(LOAD_DATA.json()['result'])
    raw['product.template'][0]['active'] = False
    client = Mock()
    client.call_kw.side_effect = [raw, [], []]
    assert len(pos.load_catalog(client, 4).products) == 1
    assert client.call_kw.call_args.args[2][0] == [['product_tmpl_id', 'in', [22]]]
    raw['product.template'][1]['available_in_pos'] = False
    client.reset_mock()
    client.call_kw.side_effect = [raw]
    assert pos.load_catalog(client, 4).products == []
    client.call_kw.assert_called_once()


# // Falla si la consulta permite obtener una foto de otra plantilla o WebP llega etiquetado como JPEG.
def test_gallery_fetch_filters_by_photo_and_template_and_detects_webp():
    http = FakeSession([AUTH, FakeResponse([{'id': 41, 'image': base64.b64encode(WEBP).decode()}])])
    assert pos.fetch_gallery_image(OdooClient(CREDS, http), 21, 41) == (WEBP, 'image/webp')
    assert params(http.calls[1])['args'] == [[['id', '=', 41], ['product_tmpl_id', '=', 21]], ['image']]


# // Falla si una foto borrada, sin binario o de un formato ajeno se sirve como WebP válido.
@pytest.mark.parametrize('rows', [[], [{'image': False}], [{'image': base64.b64encode(b'<svg/>').decode()}]])
def test_missing_or_non_webp_gallery_image_is_not_served(rows):
    http = FakeSession([AUTH, FakeResponse(rows)])
    assert pos.fetch_gallery_image(OdooClient(CREDS, http), 21, 41) is None


# // Falla si la foto principal convertida a WebP conserva un content-type de PNG o JPEG.
def test_main_photo_detects_webp_from_odoo_bytes():
    http = FakeSession([AUTH, FakeResponse([{'id': 21, 'image_512': base64.b64encode(WEBP).decode()}])])
    assert pos.fetch_product_image(OdooClient(CREDS, http), 21) == (WEBP, 'image/webp')
