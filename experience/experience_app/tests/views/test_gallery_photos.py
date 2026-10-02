from dataclasses import replace
from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.services import catalog
from experience_app.tests.conftest import ANGUS, CATALOG, DELIVERY, LIMONADA

GALLERY = [{'id': 44, 'version': '20260927010204'}, {'id': 41, 'version': '20260927010203'}]
PRODUCT = replace(ANGUS, gallery=GALLERY)
FETCH = 'experience_app.services.catalog.pos.fetch_gallery_image'
WEBP = (b'RIFF\x00\x00\x00\x00WEBPVP8 ', 'image/webp')


def gallery_url(product=3, photo=44, venue='poblado'):
    return reverse('product-gallery-photo', args=['burger-house', venue, product, photo])


@pytest.fixture
def gallery_catalog():
    with patch('experience_app.services.catalog.get_catalog', return_value=replace(CATALOG, products=[PRODUCT, LIMONADA])):
        yield


# // Falla si las entradas de mesa y domicilio pierden el orden, la versión o la separación entre principal y galería.
@pytest.mark.django_db
@pytest.mark.parametrize('entry,args', [('entry-table', ['burger-house', 'poblado', '8H2KQ7']),
                                       ('entry-delivery', ['burger-house', 'poblado'])])
def test_menu_exposes_ordered_gallery_urls(entry, args, api_client, table_tenant, gallery_catalog):
    categories = api_client.get(reverse(entry, args=args)).json()['carta']['categorias']
    assert categories[0]['productos'][0]['fotos'] == []
    dish = categories[1]['productos'][0]
    assert dish['foto'] == '/api/v1/burger-house/poblado/fotos/3/?v=20260905010203'
    assert dish['fotos'] == [f'{gallery_url()}?v=20260927010204', f'{gallery_url(photo=41)}?v=20260927010203']


# // Falla si el WebP pierde las cabeceras seguras de la principal, promete inmutabilidad para otra versión o no se cachea.
@pytest.mark.parametrize('version,control', [('', 'public, max-age=86400, immutable'),
                                            ('20260927010204', 'public, max-age=86400, immutable'),
                                            ('antigua', 'no-store')])
def test_gallery_response_headers_and_cache(version, control, api_client, gallery_catalog):
    with patch('experience_app.views.photos.resolve', return_value=DELIVERY), patch(FETCH, return_value=WEBP) as fetch:
        response = api_client.get(f'{gallery_url()}?v={version}')
        assert response.status_code == 200
        assert response.content == WEBP[0]
        assert response['Content-Type'] == 'image/webp'
        assert response['Cache-Control'] == control
        assert response['X-Content-Type-Options'] == 'nosniff'
        assert response['Content-Security-Policy'] == "default-src 'none'; sandbox"
        assert response['Content-Disposition'] == 'inline; filename="foto"'
        api_client.get(gallery_url())
        assert fetch.call_count == 1
        assert fetch.call_args.args[0].restaurant.slug == DELIVERY.venue_slug
        assert fetch.call_args.args[1:] == (21, 44)


# // Falla si un id ajeno al plato o a la carta puede aprovechar una foto ya cacheada.
@pytest.mark.parametrize('product,photo', [(3, 999), (7, 44), (999, 44)])
def test_gallery_rejects_wrong_product_or_photo(product, photo, api_client, gallery_catalog):
    with patch('experience_app.views.photos.resolve', return_value=DELIVERY), patch(FETCH, return_value=WEBP) as fetch:
        assert api_client.get(gallery_url()).status_code == 200
        fetch.reset_mock()
        response = api_client.get(gallery_url(product=product, photo=photo))
        assert response.status_code == 404
        assert response.json() == {'detail': 'sin foto'}
        fetch.assert_not_called()


# // Falla si otra sede puede obtener una foto del catálogo o de la caché de la primera.
def test_gallery_is_scoped_to_the_resolved_venue(api_client):
    other = replace(DELIVERY, venue_slug='laureles', restaurant_id=2)
    own_catalog = replace(CATALOG, products=[PRODUCT])
    with patch('experience_app.views.photos.resolve', side_effect=[DELIVERY, other]), \
            patch('experience_app.services.catalog.get_catalog', side_effect=[own_catalog, CATALOG]), \
            patch(FETCH, return_value=WEBP) as fetch:
        assert api_client.get(gallery_url()).status_code == 200
        assert api_client.get(gallery_url(venue='otra')).status_code == 404
        assert fetch.call_count == 1


# // Falla si una carta antigua convierte una foto borrada en un 200 vacío o vuelve al sistema propio en cada petición.
def test_deleted_gallery_photo_is_a_cached_404(api_client, gallery_catalog):
    with patch('experience_app.views.photos.resolve', return_value=DELIVERY), patch(FETCH, return_value=None) as fetch:
        assert api_client.get(gallery_url()).status_code == 404
        assert api_client.get(gallery_url()).status_code == 404
        assert fetch.call_count == 1


# // Falla si la caché mezcla fotos, plantillas, versiones o sedes con los mismos ids.
def test_gallery_cache_keys_cover_identity_and_version():
    with patch(FETCH, return_value=WEBP) as fetch:
        catalog.get_gallery_photo(DELIVERY, PRODUCT, 44)
        catalog.get_gallery_photo(DELIVERY, PRODUCT, 44)
        assert fetch.call_count == 1
        catalog.get_gallery_photo(DELIVERY, PRODUCT, 41)
        catalog.get_gallery_photo(DELIVERY, replace(PRODUCT, template_id=99), 44)
        catalog.get_gallery_photo(replace(DELIVERY, venue_slug='laureles', restaurant_id=2), PRODUCT, 44)
        catalog.get_gallery_photo(DELIVERY, replace(PRODUCT, gallery=[{'id': 44, 'version': 'nueva'}]), 44)
        assert fetch.call_count == 5
        assert catalog.get_gallery_photo(DELIVERY, ANGUS, 44) is None
        assert fetch.call_count == 5


# // Falla si la galería depende de tener foto principal o acepta una subida por su endpoint público.
def test_gallery_without_main_photo_and_read_only_endpoint(api_client):
    menu = replace(CATALOG, products=[replace(PRODUCT, has_image=False)])
    with patch('experience_app.views.photos.resolve', return_value=DELIVERY), \
            patch('experience_app.services.catalog.get_catalog', return_value=menu), patch(FETCH, return_value=WEBP):
        assert api_client.get(gallery_url()).status_code == 200
        assert api_client.post(gallery_url(), {}).status_code == 405


# // Falla si la foto principal WebP usa cabeceras o tipo distintos de la galería.
def test_main_webp_photo_keeps_shared_safe_headers(api_client, catalog_stub):
    with patch('experience_app.views.photos.resolve', return_value=DELIVERY), \
            patch('experience_app.services.catalog.pos.fetch_product_image', return_value=WEBP):
        response = api_client.get(reverse('product-photo', args=['burger-house', 'poblado', 3]))
        assert response.status_code == 200
        assert response['Content-Type'] == 'image/webp'
        assert response['Cache-Control'] == 'public, max-age=86400, immutable'
        assert response['X-Content-Type-Options'] == 'nosniff'
