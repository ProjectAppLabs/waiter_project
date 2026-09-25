"""J3: opciones cerradas, compatibilidad con J2 y guardado real por sede."""
from copy import deepcopy
from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.diseno import services as design
from experience_app.plantillas import services
from experience_app.plantillas.defaults import FALLBACK_SPEC
from experience_app.tests.conftest import TABLE

LAYERS = ('variantes', 'distribucion')
OPTIONS = [(layer, key, value) for layer in LAYERS
           for key, rule in design.SCHEMA['properties'][layer]['properties'].items()
           for value in rule['enum']]


# // Falla si una variante anunciada se rechaza, se pierde al resolver o altera los fundamentos predeterminados.
@pytest.mark.parametrize('layer, key, value', OPTIONS)
def test_each_declared_variant_resolves_without_changing_tokens(layer, key, value):
    body = {layer: {key: value}}
    original = deepcopy(body)
    clean = design.validate(body)
    resolved = services.build(FALLBACK_SPEC, {}, {}, {}, 5, clean)
    assert resolved['tema'][layer][key] == value
    assert resolved['tokens'] == FALLBACK_SPEC['tokens']
    assert design.validate(clean) == clean
    assert body == original


# // Falla si el servidor acepta CSS, variantes desconocidas, tipos ambiguos o distribuciones sin implementar.
@pytest.mark.parametrize('body, path', [
    ({'variantes': []}, 'tema.variantes'),
    ({'variantes': {'boton': 'rojo'}}, 'tema.variantes.boton'),
    ({'variantes': {'boton': None}}, 'tema.variantes.boton'),
    ({'variantes': {'cabecera': True}}, 'tema.variantes.cabecera'),
    ({'variantes': {'css': 'display:none'}}, 'desconocido'),
    ({'distribucion': {'carta': 'none;display:none'}}, 'tema.distribucion.carta'),
    ({'distribucion': {'pago': 'oculto'}}, 'desconocido'),
    ({'distribucion': None}, 'tema.distribucion'),
])
def test_unknown_variants_are_rejected(body, path):
    with pytest.raises(design.InvalidTheme, match=path):
        design.validate(body)


# // Falla si leer un tema J2 necesita migración, pierde escalas o cambia el diseño sin haber elegido una variante.
def test_j2_theme_fills_missing_layers_without_mutating_saved_data():
    old = {'version': 2, 'fundamentos': {'texto': 1.25, 'forma': {'imagen': 0}}}
    original = deepcopy(old)
    resolved = design.resolve(old, FALLBACK_SPEC['tokens'])
    assert resolved['fundamentos']['texto'] == 1.25
    assert resolved['fundamentos']['forma']['imagen'] == 0
    for layer in LAYERS:
        assert resolved[layer] == design.defaults()[layer]
    assert old == original


# // Falla si el PUT pierde variantes, las filtra a otra sede o una edición antigua del POS/MCP las borra.
@pytest.mark.django_db
def test_save_variants_cache_and_legacy_contract(api_client, settings, company_brand_stub):
    settings.EXPERIENCE_INTERNAL_KEY = 'clave-prueba'
    url = reverse('venue-menu-settings', args=['burger-house', 'poblado'])
    chosen = {'variantes': {'boton': 'contorno', 'saludo': 'oculto', 'imagen': '4:3'},
              'distribucion': {'carta': 'lista', 'ficha': 'heroe', 'carrito': 'compacta'}}
    with patch('experience_app.plantillas.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5):
        before = services.resolve_template(TABLE)
        response = api_client.put(url, {'plantilla': 'S1', 'tema': chosen}, format='json', HTTP_X_INTERNAL_KEY='clave-prueba')
        assert response.status_code == 200
        expected = design.validate(chosen)
        assert response.json()['plantilla']['tema'] == expected
        assert before['tema'] == design.defaults()
        services.save('burger-house', 'poblado', {'plantilla': 'S1', 'paleta': {'acento': '#234567'}})
        after = services.resolve_template(TABLE)['tema']
        for layer in LAYERS:
            assert after[layer] == expected[layer]
            assert services.settings_view('burger-house', 'otra')['tema'][layer] == design.defaults()[layer]
        invalid = api_client.put(url, {'plantilla': 'S1', 'tema': {'variantes': {'boton': 'oculto'}}},
                                 format='json', HTTP_X_INTERNAL_KEY='clave-prueba')
        assert invalid.status_code == 400
        assert services.resolve_template(TABLE)['tema'] == after
        services.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {}})
        assert services.resolve_template(TABLE)['tema'] == design.defaults()
