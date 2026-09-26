"""K1: lenguaje de plantilla restringido, contrato por componente y su integración con el tema v2 y los borradores."""
import json
import sys
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from django.utils import timezone

from experience_app.diseno import borradores, plantillas
from experience_app.diseno import services as design
from experience_app.mcp import keys
from experience_app.mcp.models import McpPendingChange
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
    ('<![CDATA[x]]>' + MINIMAL, 'declaraciones'),
    ('<!DOCTYPE html>' + MINIMAL, 'declaraciones'),
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
    ('<ranura nombre="foto"/>' + MINIMAL, r'obligatoria «foto» debe aparecer exactamente una vez \(aparece 2\)'),
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
    assert content['vista_previa'] == [{'campo': 'componentes.plato', 'antes': 'de fábrica', 'despues': 'plantilla propia (v1, 6 nodos)'}]
    preview = client.get(f'/api/v1/burger-house/poblado/borradores/{content["borrador"]}/').json()['plantilla']['tema']
    assert preview['componentes']['plato']['arbol'] == plantillas.compile_html('plato', MINIMAL)
    assert not call(client, raw, 'confirmar_cambio', {'token': content['token']})['isError']
    assert templates.resolve_template(TABLE)['tema']['componentes']['plato']['version'] == 1
    reset = call(client, raw, 'restablecer_tema', {'capa': 'componentes'})['structuredContent']
    assert reset['vista_previa'] == [{'campo': 'componentes.plato', 'antes': 'plantilla propia (v1, 6 nodos)', 'despues': 'de fábrica'}]
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


# // Falla si el HTML regenerado de un árbol no vuelve al mismo árbol: la IA no podría partir de la plantilla actual.
def test_to_html_round_trips_every_node_type():
    html = '<div class="ds-pila"><ranura nombre="ficha"><ranura nombre="foto"/>Hola <dato nombre="plato.nombre"/><si dato="plato.rebaja"><span class="ds-insignia">-<dato nombre="plato.rebaja.porcentaje" formato="numero"/>%</span></si><dato nombre="plato.precio" formato="precio"/></ranura><ranura nombre="agregar"/><decoracion id="stars" movimiento="latir" posicion="arriba-derecha"/></div>'
    tree = compile(html)
    regenerated = plantillas.to_html(tree)
    assert '<ranura nombre="foto"/>' in regenerated and 'formato="precio"' in regenerated and 'movimiento="latir"' in regenerated
    assert compile(regenerated) == tree
    for component_id in plantillas.COMPONENTS['componentes']:
        assert compile(plantillas.to_html(plantillas.factory(component_id))) == plantillas.factory(component_id)
    for html in ['<p>Texto fijo</p>' + MINIMAL, '<h3>Hola<dato nombre="plato.nombre"/></h3>' + MINIMAL,
                 '<div class="ds-pila"><span class="ds-insignia">Nuevo</span><p>Otro</p></div>' + MINIMAL,
                 '<div class="ds-pila"><p>Texto</p><div class="ds-fila"><ranura nombre="precio"/></div>Suelto</div>' + MINIMAL,
                 '<div class="ds-pila"></div>' + MINIMAL, '<p>Menos de 5 &amp; más &lt;3 &gt;</p>' + MINIMAL,
                 '<si dato="plato.tiempo"><small><dato nombre="plato.tiempo" formato="numero"/> min</small></si>' + MINIMAL]:
        tree = compile(html)
        assert compile(plantillas.to_html(tree)) == tree, html
    assert compile('<p>&lt;b&gt;</p>' + MINIMAL)[0]['hijos'][0]['texto'] == '<b>'


# // Falla si los criterios de medidas dejan pasar en silencio títulos grandes, rejillas o varias decoraciones en una tarjeta estrecha.
def test_static_measure_warnings_for_narrow_components():
    assert plantillas.warnings('plato', plantillas.factory('plato')) == []
    noisy = compile('<div class="ds-rejilla-2"><h3 class="ds-texto-grande"><dato nombre="plato.nombre"/></h3><div class="ds-fila"><span class="ds-foto-grande">x</span></div>'
                    + MINIMAL + '<decoracion id="stars"/><decoracion id="qr"/></div>')
    found = plantillas.warnings('plato', noisy)
    assert len(found) == 4
    assert any('142 px' in w and 'ds-texto-subtitulo' in w for w in found)
    assert any('ds-rejilla-2' in w for w in found) and any('ds-foto-grande' in w for w in found) and any('2 decoraciones' in w for w in found)


def verifier(tmp_path, ok, problems=()):
    script = tmp_path / 'verificador.py'
    script.write_text('import json, os, sys\nassert os.environ["DRAFT_TOKEN"] and os.environ["REST"] == "burger-house" and os.environ["SEDE"] == "poblado"\n'
                      f'sys.stdout.write(json.dumps({{"ok": {ok}, "problemas": {list(problems)!r}, "medidas": {{"375px": {{"tarjetas": 3}}}}}}))\n', encoding='utf-8')
    return f'{sys.executable} {script}'



# // Falla si la IA no puede leer la plantilla actual como HTML, preparar una propia con avisos, verificarla y confirmarla solo en verde.
def test_component_tools_read_prepare_verify_and_gate_confirmation(client, owner, settings, tmp_path):
    record, raw = owner
    read = call(client, raw, 'leer_componente', {'componente': 'plato'})['structuredContent']
    assert read['plantilla_actual'] == {'origen': 'fabrica', 'version': 1, 'html': FACTORY}
    assert read['contrato']['ranuras']['ficha']['obligatoria'] and read['contrato']['limites']['ancho_minimo'] == 142
    assert {u['clase'] for g in read['utilidades']['grupos'] for u in g['utilidades']} == plantillas.UTILITY_CLASSES
    assert call(client, raw, 'leer_componente', {'componente': 'cabecera'})['isError']
    bad = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': '<div class="rojo">x</div>'})
    assert bad['isError'] and 'clase desconocida «rojo»' in json.dumps(bad, ensure_ascii=False)
    loud = '<h3 class="ds-texto-grande"><dato nombre="plato.nombre"/></h3>' + MINIMAL
    draft = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': loud})['structuredContent']
    assert draft['vista_previa'] == [{'campo': 'componentes.plato', 'antes': 'de fábrica', 'despues': 'plantilla propia (v1, 8 nodos)'}]
    assert any('ds-texto-grande' in w for w in draft['advertencias']) and 'verificar_borrador' in draft['siguiente']
    # Sin verificador configurado se dice, y confirmar sigue permitido (no se inventa un resultado).
    settings.DESIGN_VERIFIER_CMD = ''
    unavailable = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    assert unavailable['estado'] == 'no_disponible' and unavailable['ok'] is None
    assert call(client, raw, 'verificar_borrador', {'borrador': str(uuid.uuid4())})['isError']
    # Con verificador, un resultado con problemas bloquea la confirmación; en verde la permite.
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False', ['375 px: tarjeta 1: la palabra «Hamburguesa» no cabe'])
    failed = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    assert failed['estado'] == 'problemas' and failed['problemas'] == ['375 px: tarjeta 1: la palabra «Hamburguesa» no cabe']
    blocked = call(client, raw, 'confirmar_cambio', {'token': draft['token']})
    assert blocked['isError'] and 'verificar_borrador' in json.dumps(blocked, ensure_ascii=False)
    assert McpPendingChange.objects.get(pk=draft['token']).applied_at is None
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    passed = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    assert passed['estado'] == 'ok' and passed['medidas'] == {'375px': {'tarjetas': 3}}
    assert McpPendingChange.objects.get(pk=draft['token']).payload['verificacion']['ok'] is True
    assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    current = call(client, raw, 'leer_componente', {'componente': 'plato'})['structuredContent']['plantilla_actual']
    assert current['origen'] == 'propia' and compile(current['html']) == compile(loud)
    # Volver a fábrica no introduce ninguna plantilla: se confirma sin verificación aunque el verificador esté en rojo.
    reset = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': None})['structuredContent']
    assert reset['advertencias'] == [] and reset['vista_previa'][0]['despues'] == 'de fábrica' and 'nada que medir' in reset['siguiente']
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False', ['x'])
    assert not call(client, raw, 'confirmar_cambio', {'token': reset['token']})['isError']
    assert templates.resolve_template(TABLE)['tema']['componentes'] == {'plato': None}
    # Sin html explícito la herramienta no adivina: hay que enviar la plantilla o null.
    assert call(client, raw, 'preparar_componente', {'componente': 'plato'})['isError']
    assert call(client, raw, 'preparar_componente', {'componente': ['plato'], 'html': None})['isError']
    assert call(client, raw, 'leer_componente', {'componente': {'x': 1}})['isError']


# // Falla si un fallo del verificador (comando roto, sin JSON, JSON que no es objeto, tiempo agotado, salida ok null) se
# // confunde con una plantilla con problemas, tumba la petición o filtra rutas del servidor.
@pytest.mark.parametrize('script, expected', [
    ("import sys; sys.stdout.write('null')", 'no pudo ejecutarse'),
    ("import sys; sys.stdout.write('[]')", 'no pudo ejecutarse'),
    ("import sys; sys.stderr.write('se cayó el navegador'); sys.exit(2)", 'no pudo ejecutarse'),
    ("import time; time.sleep(3)", 'tiempo máximo'),
    ("import json, sys; sys.stdout.write(json.dumps({'ok': None, 'problemas': ['la verificación falló: CDP caído']})); sys.exit(1)", 'no pudo medir'),
])
def test_verifier_infrastructure_failures_are_reported_as_errors(client, owner, settings, tmp_path, script, expected):
    _, raw = owner
    draft = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
    path = tmp_path / 'verificador.py'
    path.write_text(script + '\n', encoding='utf-8')
    settings.DESIGN_VERIFIER_CMD = f'{sys.executable} {path}'
    settings.DESIGN_VERIFIER_TIMEOUT = 1
    result = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})
    assert not result['isError'], result
    content = result['structuredContent']
    assert content['estado'] == 'error' and content['ok'] is None and expected in content['mensaje']
    assert str(tmp_path) not in json.dumps(content) and 'no es culpa de la plantilla' in content['siguiente']
    assert McpPendingChange.objects.get(pk=draft['token']).payload['verificacion']['estado'] == 'error'
    assert call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']


# // Falla si un verificador con JSON válido pero salida 1, o con «problemas» que no es lista, se interpreta mal.
def test_verifier_output_shapes(client, owner, settings, tmp_path):
    _, raw = owner
    draft = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
    path = tmp_path / 'v.py'
    path.write_text("import json, sys; sys.stdout.write(json.dumps({'ok': False, 'problemas': 'abc', 'capturas': ['/srv/evidencia/borrador-375.png'], 'medidas': 'x'})); sys.exit(1)\n", encoding='utf-8')
    settings.DESIGN_VERIFIER_CMD = f'{sys.executable} {path}'
    content = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    assert content == {**content, 'estado': 'problemas', 'ok': False, 'problemas': [], 'medidas': {}, 'capturas': ['borrador-375.png']}
    settings.DESIGN_VERIFIER_CMD = '   '
    assert call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']['estado'] == 'no_disponible'


# // Falla si un borrador que no toca plantillas exige verificación, o si la última verificación deja de mandar (verde → rojo).
def test_gate_applies_only_to_new_templates_and_uses_the_latest_verification(client, owner, settings, tmp_path):
    _, raw = owner
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False', ['nunca debería ejecutarse'])
    variants = call(client, raw, 'preparar_tema', {'tema': {'variantes': {'boton': 'contorno'}}})['structuredContent']
    assert not call(client, raw, 'confirmar_cambio', {'token': variants['token']})['isError']
    assert 'verificacion' not in McpPendingChange.objects.get(pk=variants['token']).payload
    draft = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    first = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False', ['se solapa'])
    second = call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})['structuredContent']
    assert first['ok'] is True and second['ok'] is False
    saved = McpPendingChange.objects.get(pk=draft['token']).payload['verificacion']
    assert saved['ok'] is False and saved['fecha'] >= first_date(first, draft)
    assert call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'True')
    call(client, raw, 'verificar_borrador', {'borrador': draft['borrador']})
    assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
    # Con una plantilla propia guardada, restablecer otra capa no toca componentes y tampoco exige verificación.
    settings.DESIGN_VERIFIER_CMD = verifier(tmp_path, 'False', ['x'])
    other = call(client, raw, 'restablecer_tema', {'capa': 'variantes'})['structuredContent']
    assert not call(client, raw, 'confirmar_cambio', {'token': other['token']})['isError']


def first_date(result, draft):
    return McpPendingChange.objects.get(pk=draft['token']).payload['verificacion']['fecha'] if result else ''


# // Falla si verificar_borrador acepta borradores de otra clave, del POS, caducados, aplicados o el token de confirmación.
@pytest.mark.parametrize('case', ['otra-clave', 'pos', 'caducado', 'aplicado', 'token-de-confirmacion'])
def test_verify_scope(api_client, client, owner, settings, tmp_path, case):
    _, raw = owner
    marker = tmp_path / 'ejecutado'
    path = tmp_path / 'v.py'
    path.write_text(f"import json, sys, pathlib; pathlib.Path({str(marker)!r}).write_text('x'); sys.stdout.write(json.dumps({{'ok': True, 'problemas': []}}))\n", encoding='utf-8')
    settings.DESIGN_VERIFIER_CMD = f'{sys.executable} {path}'
    if case == 'pos':
        settings.EXPERIENCE_INTERNAL_KEY = 'interna'
        body = {'plantilla': 'S1', 'tema': {'componentes': {'plato': {'version': 1, 'html': MINIMAL}}}}
        token = api_client.post('/internal/v1/burger-house/poblado/menu/borradores/', body, format='json', HTTP_X_INTERNAL_KEY='interna').json()['borrador']
    else:
        draft = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})['structuredContent']
        token = draft['borrador']
        if case == 'otra-clave':
            _, raw = keys.create('burger-house', 'poblado', 'Otra clave')
        elif case == 'caducado':
            McpPendingChange.objects.filter(pk=draft['token']).update(created_at=timezone.now() - timedelta(minutes=31))
        elif case == 'aplicado':
            call(client, raw, 'verificar_borrador', {'borrador': token})
            assert not call(client, raw, 'confirmar_cambio', {'token': draft['token']})['isError']
            marker.unlink()
        elif case == 'token-de-confirmacion':
            token = draft['token']
    assert call(client, raw, 'verificar_borrador', {'borrador': token})['isError']
    assert not marker.exists()


# // Falla si los avisos de medidas dependen de que el contrato tenga límites, o si avisan de ancho en componentes anchos.
def test_warnings_without_limits_or_in_wide_components(monkeypatch):
    plato = plantillas.COMPONENTS['componentes']['plato']
    noisy = compile('<div class="ds-rejilla-2"><h3 class="ds-texto-grande"><dato nombre="plato.nombre"/></h3><div class="ds-fila"><span class="ds-foto-grande">x</span></div>' + MINIMAL + '<decoracion id="stars"/><decoracion id="qr"/></div>')
    monkeypatch.setitem(plantillas.COMPONENTS['componentes'], 'ancho', {**plato, 'limites': {'ancho_minimo': 360}})
    monkeypatch.setitem(plantillas.COMPONENTS['componentes'], 'sinlimites', {k: v for k, v in plato.items() if k != 'limites'})
    for component_id in ('ancho', 'sinlimites'):
        assert plantillas.warnings(component_id, noisy) == ['ds-foto-grande dentro de una fila (ds-fila) no deja sitio al resto; úsala en una pila.']


# // Falla si un árbol enviado directamente (en vez de html) puede colar claves ocultas, hijos sin recorrer o texto sin colapsar.
def test_trees_sent_by_clients_are_canonicalized():
    tree = compile(MINIMAL)
    smuggled = json.loads(json.dumps(tree))
    smuggled[0]['hijos'][0]['hijos'] = []
    smuggled[0]['hijos'][1]['hijos'][0]['onclick'] = 'alert(1)'
    with pytest.raises(plantillas.InvalidTemplate, match='campo inesperado «onclick»'):
        plantillas.validate('plato', smuggled)
    hidden = json.loads(json.dumps(tree))
    hidden[0]['hijos'][2]['hijos'] = [{'tipo': 'elemento', 'etiqueta': 'script', 'clases': [], 'hijos': []}]
    with pytest.raises(plantillas.InvalidTemplate, match='campo inesperado «hijos»'):
        plantillas.validate('plato', hidden)
    spaced = json.loads(json.dumps(tree))
    spaced[0]['hijos'][1]['hijos'].append({'tipo': 'texto', 'texto': 'muy   largo\n\n espacio'})
    assert plantillas.validate('plato', spaced)[0]['hijos'][1]['hijos'][-1] == {'tipo': 'texto', 'texto': 'muy largo espacio'}
    assert design.validate({'componentes': {'plato': {'version': 1, 'arbol': tree}}})['componentes']['plato']['arbol'] == tree
