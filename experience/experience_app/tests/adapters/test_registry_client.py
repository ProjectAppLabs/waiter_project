from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings

from experience_app.adapters.registry import client
from experience_app.tests.helpers import RawResponse

BODY = {'restaurant': {'slug': 'burger-house', 'name': 'Burger House'}, 'venue': {'slug': 'poblado', 'name': 'Poblado'},
        'table': {'token': '8H2KQ7', 'number': 8, 'odoo_table_id': 9},
        'odoo': {'url': 'http://odoo', 'db': 'bh', 'login': 'svc', 'password': 's3', 'pos_config_id': 1}}


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@override_settings(REGISTRY_INTERNAL_KEY='k')
@patch('experience_app.adapters.registry.client.requests.get', return_value=RawResponse(BODY))
def test_resolve_maps_the_registry_answer_and_caches_it(get):
    """Atrapa un mapeo roto del contrato interno o un registro golpeado en cada petición."""
    tenant = client.resolve('burger-house', 'poblado', '8H2KQ7')
    client.resolve('burger-house', 'poblado', '8H2KQ7')
    assert tenant.odoo_table_id == 9
    assert tenant.odoo.password == 's3'
    assert get.call_count == 1
    assert get.call_args.kwargs['headers']['X-Internal-Key'] == 'k'


@patch('experience_app.adapters.registry.client.requests.get', return_value=RawResponse({}, status_code=404))
def test_unknown_table_raises_not_found(get):
    """Atrapa que una placa revocada resuelva a algo."""
    with pytest.raises(client.TenantNotFound):
        client.resolve('burger-house', 'poblado', 'NOPE')


@override_settings(REGISTRY_INTERNAL_KEY='k')
def test_organization_resolution_uses_the_internal_index_and_a_representative_restaurant():
    # Falla si una clave MCP de organización intenta resolver una sede vacía o consulta el índice sin autenticación.
    with patch('experience_app.adapters.registry.client.requests.get', side_effect=[
            RawResponse([{'slug': 'poblado', 'name': 'Poblado'}]), RawResponse(BODY)]) as get:
        tenant = client.resolve('burger-house', '')
    assert (tenant.organization_slug, tenant.organization_name, tenant.venue_slug) == ('burger-house', 'Burger House', 'poblado')
    assert get.call_args_list[0].args[0].endswith('/internal/v1/organizaciones/burger-house/restaurantes/')
    assert get.call_args_list[0].kwargs['headers'] == {'X-Internal-Key': 'k'}
    assert get.call_args_list[1].args[0].endswith('/internal/v1/resolve/burger-house/poblado/')
