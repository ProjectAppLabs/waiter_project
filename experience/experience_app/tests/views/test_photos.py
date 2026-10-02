from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.tests.conftest import DELIVERY

PHOTO = reverse('product-photo', args=['burger-house', 'poblado', 3])
FETCH = 'experience_app.services.catalog.pos.fetch_product_image'
RESOLVE = 'experience_app.views.photos.resolve'
PNG = (b'\x89PNG\r\n\x1a\n', 'image/png')


# Falla si ocurre este error: una foto PNG servida como JPEG, sin caché pública, o pedida al sistema propio con el id de producto en vez del de plantilla.
@patch(FETCH, return_value=PNG)
@patch(RESOLVE, return_value=DELIVERY)
def test_photo_streams_the_bytes_with_public_cache_headers(resolve, fetch, api_client, catalog_stub):
    """Atrapa una foto PNG servida como JPEG, sin caché pública, o pedida al sistema propio con el id de producto en vez del de plantilla."""
    response = api_client.get(f'{PHOTO}?v=20260905010203')
    assert response.status_code == 200
    assert response.content == b'\x89PNG\r\n\x1a\n'
    assert response['Content-Type'] == 'image/png'
    assert response['Cache-Control'] == 'public, max-age=86400, immutable'
    assert fetch.call_args.args[1:] == (21, 'tarjeta')
    assert fetch.call_args.args[0].restaurant.slug == DELIVERY.venue_slug


# Falla si ocurre este error: una segunda petición de la misma foto que vuelve al sistema propio (una lectura por foto y por comensal nuevo).
@patch(FETCH, return_value=PNG)
@patch(RESOLVE, return_value=DELIVERY)
def test_photo_is_served_from_cache_on_the_second_request(resolve, fetch, api_client, catalog_stub):
    """Atrapa una segunda petición de la misma foto que vuelve al sistema propio (una lectura por foto y por comensal nuevo)."""
    api_client.get(PHOTO)
    response = api_client.get(PHOTO)
    assert response.status_code == 200
    assert response.content == b'\x89PNG\r\n\x1a\n'
    assert fetch.call_count == 1


# Falla si ocurre este error: un tamaño arbitrario que llegue al sistema propio, o la pantalla del plato servida con la miniatura de la tarjeta.
@patch(FETCH, return_value=PNG)
@patch(RESOLVE, return_value=DELIVERY)
def test_photo_size_picks_the_dish_resolution_and_rejects_unknown_sizes(resolve, fetch, api_client, catalog_stub):
    """Atrapa un tamaño arbitrario que llegue al sistema propio, o la pantalla del plato servida con la miniatura de la tarjeta."""
    assert api_client.get(f'{PHOTO}?tam=plato').status_code == 200
    assert fetch.call_args.args[1:] == (21, 'plato')
    response = api_client.get(f'{PHOTO}?tam=image_1920')
    assert response.status_code == 400
    assert fetch.call_count == 1


# Falla si ocurre este error: una ida al sistema propio (o un placeholder suyo) por cada plato sin foto.
@patch(FETCH)
@patch(RESOLVE, return_value=DELIVERY)
def test_photo_is_404_without_touching_core_when_the_product_has_no_image(resolve, fetch, api_client, catalog_stub):
    """Atrapa una ida al sistema propio (o un placeholder suyo) por cada plato sin foto."""
    response = api_client.get(reverse('product-photo', args=['burger-house', 'poblado', 7]))
    assert response.status_code == 404
    assert response.json() == {'detail': 'sin foto'}
    assert fetch.call_count == 0


# Falla si ocurre este error: un 200 vacío cuando el sistema propio no entrega la imagen, o una ida al sistema propio por comensal mientras la carta aún dice que la hay.
@patch(FETCH, return_value=None)
@patch(RESOLVE, return_value=DELIVERY)
def test_photo_is_404_when_core_returns_no_image(resolve, fetch, api_client, catalog_stub):
    """Atrapa un 200 vacío cuando el sistema propio no entrega la imagen, o una ida al sistema propio por comensal mientras la carta aún dice que la hay."""
    assert api_client.get(PHOTO).status_code == 404
    response = api_client.get(PHOTO)
    assert response.status_code == 404
    assert response.json() == {'detail': 'sin foto'}
    assert fetch.call_count == 1


# Falla si ocurre este error: el 400 'no está en la carta' (error de agregar al carrito) en un recurso GET, o una ida al sistema propio por un id inventado.
@patch(FETCH)
@patch(RESOLVE, return_value=DELIVERY)
def test_photo_is_404_for_a_product_not_in_the_menu(resolve, fetch, api_client, catalog_stub):
    """Atrapa el 400 'no está en la carta' (error de agregar al carrito) en un recurso GET, o una ida al sistema propio por un id inventado."""
    response = api_client.get(reverse('product-photo', args=['burger-house', 'poblado', 999]))
    assert response.status_code == 404
    assert response.json() == {'detail': 'sin foto'}
    assert fetch.call_count == 0


# Falla si ocurre este error: una carta con la URL del sistema propio (o sin URL, o sin versión) en la foto de un plato, o sin el origen y el aviso legal.
@pytest.mark.django_db  # la entrada resuelve la plantilla de la sede (Plan H): lee la base
def test_entry_menu_points_photos_to_the_experience_route(api_client, table_tenant, catalog_stub):
    """Atrapa una carta con la URL del sistema propio (o sin URL, o sin versión) en la foto de un plato, o sin el origen y el aviso legal."""
    body = api_client.get(reverse('entry-table', args=['burger-house', 'poblado', '8H2KQ7'])).json()
    bebidas, hamburguesas = body['carta']['categorias']
    assert hamburguesas['productos'][0]['foto'] == '/api/v1/burger-house/poblado/fotos/3/?v=20260905010203'
    assert bebidas['productos'][0]['foto'] is None
    assert (hamburguesas['productos'][0]['fotoOrigen'], bebidas['productos'][0]['fotoOrigen']) == ('ia', None)
    assert body['carta']['imagenesDeReferencia'] is True
