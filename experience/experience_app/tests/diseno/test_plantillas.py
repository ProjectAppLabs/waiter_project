"""K1: lenguaje de plantilla restringido, contrato por componente y su integración con el tema v2 y los borradores."""
import json
from pathlib import Path

import pytest

from experience_app.diseno import borradores, plantillas
from experience_app.diseno import services as design
from experience_app.mcp import keys
from experience_app.plantillas import services as templates
from experience_app.tests.conftest import TABLE
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db
FACTORY = plantillas.component('plato')['plantilla_fabrica']
MINIMAL = '<ranura nombre="ficha"><ranura nombre="foto"/><h3><dato nombre="plato.nombre"/></h3><dato nombre="plato.precio" formato="precio"/></ranura><ranura nombre="agregar"/>'


def compile(html):
    return plantillas.compile_html('plato', html)


# // Falla si la plantilla de fábrica de un componente no cumple su propio contrato o si el contrato deja de ser coherente.
def test_factory_templates_satisfy_their_contracts():
    for component_id, rule in plantillas.COMPONENTS['componentes'].items():
        tree = plantillas.factory(component_id)
        assert tree and plantillas.validate(component_id, tree) == tree
        assert rule['version'] >= 1 and rule['datos'] and rule['ranuras']
        for requirement in rule.get('requisitos', []):
            for option in requirement['cualquiera']:
                kind, name = option.split(':')
                assert name in rule['datos' if kind == 'dato' else 'ranuras']
    assert set(design.SCHEMA['properties']['componentes']['properties']) == set(plantillas.COMPONENTS['componentes'])


# // Falla si el parseo pierde estructura, texto o atributos, o si acepta HTML fuera del lenguaje.
def test_parse_builds_a_normalized_tree():
    tree = compile('''<div class="ds-pila ds-espacio-8 ds-pila">
      <ranura nombre="ficha"><ranura nombre="foto"/> <h3 class="ds-texto-titulo">Hoy:  <dato nombre="plato.nombre"/></h3>
        <si dato="plato.rebaja"><span class="ds-insignia">-<dato nombre="plato.rebaja.porcentaje" formato="numero"/>%</span></si>
        <ranura nombre="precio"/></ranura>
      <ranura nombre="agregar"/><decoracion id="stars" movimiento="flotar"/>
    </div>''')
    assert tree == [{'tipo': 'elemento', 'etiqueta': 'div', 'clases': ['ds-pila', 'ds-espacio-8'], 'hijos': [
        {'tipo': 'ranura', 'nombre': 'ficha', 'hijos': [
            {'tipo': 'ranura', 'nombre': 'foto', 'hijos': []},
            {'tipo': 'elemento', 'etiqueta': 'h3', 'clases': ['ds-texto-titulo'], 'hijos': [
                {'tipo': 'texto', 'texto': 'Hoy: '}, {'tipo': 'dato', 'nombre': 'plato.nombre'}]},
            {'tipo': 'si', 'dato': 'plato.rebaja', 'hijos': [
                {'tipo': 'elemento', 'etiqueta': 'span', 'clases': ['ds-insignia'], 'hijos': [
                    {'tipo': 'texto', 'texto': '-'}, {'tipo': 'dato', 'nombre': 'plato.rebaja.porcentaje', 'formato': 'numero'}, {'tipo': 'texto', 'texto': '%'}]}]},
            {'tipo': 'ranura', 'nombre': 'precio', 'hijos': []}]},
        {'tipo': 'ranura', 'nombre': 'agregar', 'hijos': []},
        {'tipo': 'decoracion', 'id': 'stars', 'movimiento': 'flotar', 'posicion': 'libre'}]}]


# // Falla si alguna regla del lenguaje o del contrato deja de rechazar con un mensaje que diga qué corregir.
@pytest.mark.parametrize('html, message', [
    ('', 'no vacío'),
    ('<script>alert(1)</script>' + MINIMAL, 'script'),
    ('<img src="x">' + MINIMAL, 'script, estilo, medios'),
    ('<a href="https://x">x</a>' + MINIMAL, 'enlaces'),
    ('<b>x</b>' + MINIMAL, 'etiqueta no admitida <b>'),
    ('<div style="color:red">x</div>' + MINIMAL, 'atributo no admitido «style»'),
    ('<div onclick="x()">x</div>' + MINIMAL, 'atributo no admitido «onclick»'),
    ('<div class="text-red-500">x</div>' + MINIMAL, 'clase desconocida «text-red-500»'),
    ('<!-- hola -->' + MINIMAL, 'comentarios'),
    ('<div>' + MINIMAL, 'falta cerrar <div>'),
    ('</div>' + MINIMAL, 'sin apertura'),
    ('<div><span></div></span>' + MINIMAL, 'se esperaba </span>'),
    ('<dato/>' + MINIMAL, 'falta el atributo «nombre»'),
    ('<dato nombre="plato.color"/>' + MINIMAL, 'dato desconocido «plato.color»'),
    ('<dato nombre="plato.agotado"/>' + MINIMAL, 'úsalo con <si>'),
    ('<dato nombre="plato.nombre" formato="moneda"/>' + MINIMAL, 'formato desconocido «moneda»'),
    ('<dato nombre="plato.nombre" formato="precio"/>' + MINIMAL, 'no es un precio'),
    ('<ranura nombre="pagar"/>' + MINIMAL, 'ranura desconocida «pagar»'),
    ('<ranura nombre="foto">x</ranura>' + MINIMAL.replace('<ranura nombre="foto"/>', ''), 'no admite contenido'),
    ('<ranura nombre="foto"/>' + MINIMAL, 'obligatoria «foto» debe aparecer exactamente una vez \(aparece 2\)'),
    ('<ranura nombre="precio"/><ranura nombre="precio"/>' + MINIMAL, 'aparece 2 veces'),
    ('<ranura nombre="ficha"><ranura nombre="foto"/></ranura><ranura nombre="agregar"/>', 'dato obligatorio «plato.nombre»'),
    ('<ranura nombre="ficha"><ranura nombre="foto"/><dato nombre="plato.nombre"/></ranura><ranura nombre="agregar"/>', 'falta el precio del plato'),
    ('<si dato="plato.pico">x</si>' + MINIMAL, 'dato desconocido «plato.pico»'),
    ('<cada dato="plato.nombre" como="n">x</cada>' + MINIMAL, 'no es una lista'),
    ('<decoracion id="externa"/>' + MINIMAL, 'decoración desconocida «externa»'),
    ('<decoracion id="stars" movimiento="explotar"/>' + MINIMAL, 'movimiento desconocido «explotar»'),
    ('<decoracion id="stars" posicion="centro"/>' + MINIMAL, 'posición desconocida «centro»'),
    ('<decoracion id="stars"/>' * 4 + MINIMAL, 'supera las 3 decoraciones'),
    ('<div>' * 9 + 'x' + '</div>' * 9 + MINIMAL, 'profundidad máxima de 8'),
    ('<span>x</span>' * 160 + MINIMAL, 'supera los 150 nodos'),
    ('<p>' + 'a' * 121 + '</p>' + MINIMAL, 'supera los 120 caracteres'),
    ('<p>Mira https://x.com</p>' + MINIMAL, 'direcciones web'),
    ('<p>' + 'x' * 20_001 + '</p>', '20 000 caracteres'),
])
def test_invalid_templates_are_rejected_with_a_useful_message(html, message):
    with pytest.raises(plantillas.InvalidTemplate, match=message):
        compile(html)


# // Falla si el tema acepta plantillas sin versión, con versión ajena o con la forma equivocada, o si null no vuelve a fábrica.
@pytest.mark.parametrize('value, message', [
    ({'html': MINIMAL}, 'versión del contrato de «plato» es 1'),
    ({'version': 2, 'html': MINIMAL}, 'versión del contrato'),
    ({'version': 1, 'html': MINIMAL, 'arbol': []}, 'envía'),
    ({'version': 1}, 'envía'),
    ('<div/>', 'envía'),
    ({'version': 1, 'html': '<b>x</b>'}, 'tema.componentes.plato: etiqueta no admitida'),
])
def test_theme_layer_validates_component_templates(value, message):
    with pytest.raises(design.InvalidTheme, match=message):
        design.validate({'componentes': {'plato': value}})
    assert design.validate({'componentes': {'plato': None}})['componentes'] == {'plato': None}
    with pytest.raises(design.InvalidTheme, match='desconocido'):
        design.validate({'componentes': {'cabecera': None}})


# // Falla si guardar pierde el árbol, si un árbol guardado se vuelve a parsear como HTML o si un guardado obsoleto tumba todo el tema.
def test_saved_trees_survive_revalidation_and_stale_ones_fall_back(caplog):
    theme = design.validate({'fundamentos': {'texto': 1.2}, 'componentes': {'plato': {'version': 1, 'html': MINIMAL}}})
    saved = theme['componentes']['plato']
    assert saved['version'] == 1 and saved['arbol'][0]['tipo'] == 'ranura'
    assert design.validate(theme) == theme
    stale = {**theme, 'componentes': {'plato': {'version': 99, 'arbol': saved['arbol']}}}
    with caplog.at_level('WARNING'):
        resolved = design.validate(stale)
    assert resolved['componentes'] == {'plato': None} and resolved['fundamentos']['texto'] == 1.2
    assert 'se usa la de fábrica' in caplog.text
    broken = {**theme, 'componentes': {'plato': {'version': 1, 'arbol': [{'tipo': 'elemento', 'etiqueta': 'script', 'hijos': []}]}}}
    assert design.validate(broken)['componentes'] == {'plato': None}


@pytest.fixture
def owner(company_brand_stub, settings):
    from unittest.mock import patch
    settings.DINER_PUBLIC_URL = 'https://menu.test'
    record, raw = keys.create('burger-house', 'poblado', 'Diseño de prueba')
    with patch('experience_app.mcp.tools.resolve', return_value=TABLE), \
            patch('experience_app.diseno.views.resolve', return_value=TABLE), \
            patch('experience_app.services.discount.percent_for', return_value=5):
        yield record, raw


# // Falla si la IA no puede leer el contrato, preparar una plantilla por preparar_tema, verla en el borrador público y confirmarla.
def test_mcp_prepares_previews_and_confirms_a_component_template(client, owner):
    record, raw = owner
    data = call(client, raw, 'leer_design_system')['structuredContent']
    contract = data['plantillas']
    assert contract['componentes']['plato']['plantilla_fabrica']['html'] == FACTORY
    assert contract['componentes']['plato']['plantilla_fabrica']['arbol'] == plantillas.factory('plato')
    assert {u['clase'] for g in contract['utilidades']['grupos'] for u in g['utilidades']} == plantillas.UTILITY_CLASSES
    assert 'plantilla_fabrica' not in json.dumps(contract['componentes']['plato']['datos'])
    bad = call(client, raw, 'preparar_tema', {'tema': {'componentes': {'plato': {'version': 1, 'html': '<div class="rojo"></div>'}}}})
    assert bad['isError'] and 'clase desconocida «rojo»' in json.dumps(bad, ensure_ascii=False)
    draft = call(client, raw, 'preparar_tema', {'tema': {'componentes': {'plato': {'version': 1, 'html': MINIMAL}}}})
    assert not draft['isError'], draft
    content = draft['structuredContent']
    assert content['vista_previa'] == [{'campo': 'componentes.plato', 'antes': 'de fábrica', 'despues': 'plantilla propia (v1)'}]
    preview = client.get(f'/api/v1/burger-house/poblado/borradores/{content["borrador"]}/').json()['plantilla']['tema']
    assert preview['componentes']['plato']['arbol'] == plantillas.compile_html('plato', MINIMAL)
    assert not call(client, raw, 'confirmar_cambio', {'token': content['token']})['isError']
    assert templates.resolve_template(TABLE)['tema']['componentes']['plato']['version'] == 1
    reset = call(client, raw, 'restablecer_tema', {'capa': 'componentes'})['structuredContent']
    assert reset['vista_previa'] == [{'campo': 'componentes.plato', 'antes': 'plantilla propia (v1)', 'despues': 'de fábrica'}]
    assert not call(client, raw, 'confirmar_cambio', {'token': reset['token']})['isError']
    assert templates.resolve_template(TABLE)['tema']['componentes'] == {'plato': None}


# // Falla si el contrato público deja de incluir plantillas, utilidades y decoraciones, o si sus catálogos divergen del código.
def test_public_contract_exposes_templates_utilities_and_decorations(client):
    data = client.get('/api/v1/diseno/').json()['plantillas']
    assert data['version'] == 3 and data['componentes']['plato']['version'] == 1
    assert data['limites'] == plantillas.LIMITS and data['etiquetas'] == sorted(plantillas.TAGS)
    diner = Path(__file__).resolve().parents[4] / 'diner'
    assets = {p.stem for p in (diner / 'public/smart-menu').glob('*.png')}
    for decoration in data['decoraciones']['fabrica']:
        assert decoration['id'] in assets and decoration['archivo'] == f'/smart-menu/{decoration["id"]}.png'
    css = (diner / 'components/smart/smart-utilities.css').read_text(encoding='utf-8')
    for utility in (u['clase'] for g in data['utilidades']['grupos'] for u in g['utilidades']):
        assert f'.{utility}' in css, utility
    assert borradores.LAYERS[-1] == 'componentes'
