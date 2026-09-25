"""Plan K1: plantillas HTML restringidas por componente.

Una plantilla llega como HTML de un lenguaje cerrado y se guarda como árbol JSON validado; el comensal la dibuja
desde el árbol, nunca desde HTML crudo. Reglas: solo las etiquetas de `componentes.json`, solo clases `ds-*` de
`utilidades.json`, datos y ranuras del contrato del componente (con las obligatorias presentes), decoraciones del
catálogo y límites de tamaño. Cada error dice qué falló y dónde, para que la IA lo corrija sola.
"""
import json
import logging
import re
from html.parser import HTMLParser
from pathlib import Path

_HERE = Path(__file__).parent
COMPONENTS = json.loads((_HERE / 'componentes.json').read_text(encoding='utf-8'))
UTILITIES = json.loads((_HERE / 'utilidades.json').read_text(encoding='utf-8'))
DECORATIONS = json.loads((_HERE / 'decoraciones.json').read_text(encoding='utf-8'))
UTILITY_CLASSES = {u['clase'] for group in UTILITIES['grupos'] for u in group['utilidades']}
TAGS = set(COMPONENTS['etiquetas'])
FORMATS = tuple(COMPONENTS['formatos'])
LIMITS = COMPONENTS['limites']
SPECIAL = {'dato', 'ranura', 'si', 'cada', 'decoracion'}
logger = logging.getLogger(__name__)


class InvalidTemplate(ValueError):
    """La plantilla no cumple el lenguaje o el contrato del componente."""


def component(component_id: str) -> dict:
    try:
        return COMPONENTS['componentes'][component_id]
    except KeyError:
        raise InvalidTemplate(f'componente desconocido «{component_id}»; admitidos: {", ".join(COMPONENTS["componentes"])}.') from None


def decoration_ids(extra=()) -> set:
    return {d['id'] for d in DECORATIONS['fabrica']} | set(extra)


# ---- parseo ------------------------------------------------------------------------------------------------------
class _Parser(HTMLParser):
    """HTML → árbol. Solo comprueba la sintaxis; el contrato se comprueba en `validate`."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'hijos': []}
        self.stack = [self.root]

    def _node(self, tag, attrs, closed):
        attrs = dict(attrs)
        if None in attrs.values():
            raise InvalidTemplate(f'<{tag}>: todos los atributos necesitan valor.')
        if tag == 'dato':
            return {'tipo': 'dato', **_only(tag, attrs, {'nombre'}, {'formato'})}, True
        if tag == 'decoracion':
            return {'tipo': 'decoracion', **_only(tag, attrs, {'id'}, {'movimiento', 'posicion'})}, True
        if tag == 'ranura':
            return {'tipo': 'ranura', **_only(tag, attrs, {'nombre'}, set()), 'hijos': []}, closed
        if tag == 'si':
            return {'tipo': 'si', **_only(tag, attrs, {'dato'}, set()), 'hijos': []}, closed
        if tag == 'cada':
            return {'tipo': 'cada', **_only(tag, attrs, {'dato', 'como'}, set()), 'hijos': []}, closed
        if tag not in TAGS:
            raise InvalidTemplate(f'etiqueta no admitida <{tag}>; admitidas: {", ".join(sorted(TAGS))}, dato, ranura, si, cada y decoracion.')
        unknown = set(attrs) - {'class'}
        if unknown:
            raise InvalidTemplate(f'<{tag}>: atributo no admitido «{sorted(unknown)[0]}»; solo se admite class con utilidades ds-*.')
        classes = attrs.get('class', '').split()
        return {'tipo': 'elemento', 'etiqueta': tag, 'clases': list(dict.fromkeys(classes)), 'hijos': []}, closed

    def handle_starttag(self, tag, attrs):
        node, closed = self._node(tag, attrs, closed=False)
        self.stack[-1]['hijos'].append(node)
        if not closed:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node, _ = self._node(tag, attrs, closed=True)
        self.stack[-1]['hijos'].append(node)

    def handle_endtag(self, tag):
        if len(self.stack) == 1:
            raise InvalidTemplate(f'cierre </{tag}> sin apertura.')
        open_tag = self.stack[-1].get('etiqueta', self.stack[-1]['tipo'])
        if open_tag != tag:
            raise InvalidTemplate(f'se esperaba </{open_tag}> y llegó </{tag}>.')
        self.stack.pop()

    def handle_data(self, data):
        # Se colapsan los espacios como en HTML; se conserva uno en los bordes para no pegar el texto a un <dato> vecino.
        text = re.sub(r'\s+', ' ', data)
        if text.strip():
            self.stack[-1]['hijos'].append({'tipo': 'texto', 'texto': text})

    def handle_comment(self, data):
        raise InvalidTemplate('no se admiten comentarios.')

    def handle_decl(self, decl):
        raise InvalidTemplate('no se admiten declaraciones.')

    def handle_pi(self, data):
        raise InvalidTemplate('no se admiten instrucciones de proceso.')


def _only(tag, attrs, required, optional):
    unknown = set(attrs) - required - optional
    if unknown:
        raise InvalidTemplate(f'<{tag}>: atributo no admitido «{sorted(unknown)[0]}».')
    missing = required - set(attrs)
    if missing:
        raise InvalidTemplate(f'<{tag}>: falta el atributo «{sorted(missing)[0]}».')
    return dict(attrs)


def parse(html: str) -> list:
    if not isinstance(html, str) or not html.strip():
        raise InvalidTemplate('la plantilla debe ser HTML no vacío.')
    if len(html) > 20_000:
        raise InvalidTemplate('la plantilla supera los 20 000 caracteres.')
    if re.search(r'<\s*(script|style|iframe|object|embed|link|meta|svg|img|a|button|input|form)\b', html, re.I):
        raise InvalidTemplate('no se admiten etiquetas de script, estilo, medios, enlaces ni formularios: usa ranuras y decoraciones.')
    parser = _Parser()
    parser.feed(html)
    parser.close()
    if len(parser.stack) > 1:
        open_tag = parser.stack[-1].get('etiqueta', parser.stack[-1]['tipo'])
        raise InvalidTemplate(f'falta cerrar <{open_tag}>.')
    return parser.root['hijos']


# ---- validación del árbol -----------------------------------------------------------------------------------------
class _Checker:
    def __init__(self, contract, decorations):
        self.contract, self.decorations = contract, decorations
        self.datos, self.ranuras = contract['datos'], contract['ranuras']
        self.nodes, self.decoration_count = 0, 0
        self.used_datos, self.used_ranuras = set(), []

    def walk(self, nodes, depth=1, scope=None, where='plantilla'):
        scope = scope or {}
        if depth > LIMITS['profundidad']:
            raise InvalidTemplate(f'{where}: supera la profundidad máxima de {LIMITS["profundidad"]} niveles.')
        if not isinstance(nodes, list):
            raise InvalidTemplate(f'{where}: los hijos deben ser una lista.')
        for node in nodes:
            self.nodes += 1
            if self.nodes > LIMITS['nodos']:
                raise InvalidTemplate(f'la plantilla supera los {LIMITS["nodos"]} nodos.')
            if not isinstance(node, dict) or node.get('tipo') not in ('elemento', 'texto', 'dato', 'ranura', 'si', 'cada', 'decoracion'):
                raise InvalidTemplate(f'{where}: nodo desconocido.')
            getattr(self, node['tipo'])(node, depth, scope, where)

    def elemento(self, node, depth, scope, where):
        tag = node.get('etiqueta')
        if tag not in TAGS:
            raise InvalidTemplate(f'{where}: etiqueta no admitida <{tag}>.')
        classes = node.get('clases', [])
        if not isinstance(classes, list) or any(not isinstance(c, str) for c in classes):
            raise InvalidTemplate(f'<{tag}>: class inválido.')
        unknown = [c for c in classes if c not in UTILITY_CLASSES]
        if unknown:
            raise InvalidTemplate(f'<{tag}>: clase desconocida «{unknown[0]}»; usa solo las utilidades ds-* del catálogo.')
        if set(node) - {'tipo', 'etiqueta', 'clases', 'hijos'}:
            raise InvalidTemplate(f'<{tag}>: campo inesperado en el árbol.')
        self.walk(node.get('hijos', []), depth + 1, scope, f'<{tag}>')

    def texto(self, node, depth, scope, where):
        text = node.get('texto')
        if not isinstance(text, str) or not text.strip():
            raise InvalidTemplate(f'{where}: texto vacío.')
        if len(text) > LIMITS['texto']:
            raise InvalidTemplate(f'{where}: un texto fijo supera los {LIMITS["texto"]} caracteres; los datos largos van con <dato>.')
        if re.search(r'://|www\.', text, re.I):
            raise InvalidTemplate(f'{where}: no se admiten direcciones web en el texto.')

    def _resolve(self, name, scope, where):
        if not isinstance(name, str):
            raise InvalidTemplate(f'{where}: nombre de dato inválido.')
        head = name.split('.', 1)[0]
        if head in scope:
            rest = name[len(head):]
            return f'{scope[head]}{rest}'
        return name

    def dato(self, node, depth, scope, where):
        name = self._resolve(node.get('nombre'), scope, where)
        rule = self.datos.get(name)
        if rule is None:
            raise InvalidTemplate(f'{where}: dato desconocido «{node.get("nombre")}»; disponibles: {", ".join(self.datos)}.')
        if rule['tipo'] in ('booleano', 'lista'):
            raise InvalidTemplate(f'{where}: «{name}» es {rule["tipo"]}; úsalo con <si> o <cada>, no con <dato>.')
        fmt = node.get('formato', 'texto')
        if fmt not in FORMATS:
            raise InvalidTemplate(f'{where}: formato desconocido «{fmt}»; admitidos: {", ".join(FORMATS)}.')
        if fmt == 'precio' and rule['tipo'] != 'precio':
            raise InvalidTemplate(f'{where}: «{name}» no es un precio; quita formato="precio".')
        self.used_datos.add(name)

    def ranura(self, node, depth, scope, where):
        name = node.get('nombre')
        rule = self.ranuras.get(name)
        if rule is None:
            raise InvalidTemplate(f'{where}: ranura desconocida «{name}»; disponibles: {", ".join(self.ranuras)}.')
        children = node.get('hijos', [])
        if children and not rule.get('envoltorio'):
            raise InvalidTemplate(f'<ranura nombre="{name}"> no admite contenido: escríbela como <ranura nombre="{name}"/>.')
        if scope:
            raise InvalidTemplate(f'{where}: las ranuras no van dentro de <cada>.')
        self.used_ranuras.append(name)
        self.walk(children, depth + 1, scope, f'<ranura nombre="{name}">')

    def si(self, node, depth, scope, where):
        name = self._resolve(node.get('dato'), scope, where)
        if name not in self.datos:
            raise InvalidTemplate(f'<si>: dato desconocido «{node.get("dato")}».')
        self.used_datos.add(name)
        self.walk(node.get('hijos', []), depth + 1, scope, f'<si dato="{name}">')

    def cada(self, node, depth, scope, where):
        name = self._resolve(node.get('dato'), scope, where)
        rule = self.datos.get(name)
        if rule is None or rule['tipo'] != 'lista':
            raise InvalidTemplate(f'<cada>: «{node.get("dato")}» no es una lista del contrato.')
        alias = node.get('como')
        if not isinstance(alias, str) or not re.fullmatch(r'[a-z][a-z0-9]*', alias) or alias in scope:
            raise InvalidTemplate('<cada>: «como» debe ser un nombre simple en minúsculas y distinto de los ya usados.')
        self.used_datos.add(name)
        self.walk(node.get('hijos', []), depth + 1, {**scope, alias: name}, f'<cada dato="{name}">')

    def decoracion(self, node, depth, scope, where):
        self.decoration_count += 1
        if self.decoration_count > LIMITS['decoraciones']:
            raise InvalidTemplate(f'la plantilla supera las {LIMITS["decoraciones"]} decoraciones permitidas.')
        if node.get('id') not in self.decorations:
            raise InvalidTemplate(f'{where}: decoración desconocida «{node.get("id")}»; elige una de la galería.')
        movement = node.get('movimiento', 'ninguno')
        if movement not in DECORATIONS['movimientos']:
            raise InvalidTemplate(f'{where}: movimiento desconocido «{movement}»; admitidos: {", ".join(DECORATIONS["movimientos"])}.')
        position = node.get('posicion', 'libre')
        if position not in DECORATIONS['posiciones']:
            raise InvalidTemplate(f'{where}: posición desconocida «{position}»; admitidas: {", ".join(DECORATIONS["posiciones"])}.')
        node['movimiento'], node['posicion'] = movement, position

    def finish(self):
        for name, rule in self.ranuras.items():
            count = self.used_ranuras.count(name)
            if rule.get('obligatoria') and count != 1:
                raise InvalidTemplate(f'la ranura obligatoria «{name}» debe aparecer exactamente una vez (aparece {count}).')
            if count > 1:
                raise InvalidTemplate(f'la ranura «{name}» aparece {count} veces; como máximo una.')
        for name, rule in self.datos.items():
            if rule.get('obligatorio') and name not in self.used_datos:
                raise InvalidTemplate(f'falta el dato obligatorio «{name}».')
        for requirement in self.contract.get('requisitos', []):
            if not any(self._satisfied(option) for option in requirement['cualquiera']):
                raise InvalidTemplate(f'falta {requirement["mensaje"]}.')

    def _satisfied(self, option):
        kind, name = option.split(':', 1)
        return name in self.used_datos if kind == 'dato' else name in self.used_ranuras


def validate(component_id: str, tree: list, *, decorations=()) -> list:
    """Comprueba el árbol contra el contrato del componente y lo devuelve normalizado."""
    contract = component(component_id)
    checker = _Checker(contract, decoration_ids(decorations))
    checker.walk(tree)
    checker.finish()
    return tree


def compile_html(component_id: str, html: str, *, decorations=()) -> list:
    return validate(component_id, parse(html), decorations=decorations)


def factory(component_id: str) -> list:
    return compile_html(component_id, component(component_id)['plantilla_fabrica'])


# ---- integración con el tema v2 -------------------------------------------------------------------------------------
def normalize(component_id: str, value, path: str):
    """Valor de `tema.componentes.<id>`: None (de fábrica), {version, html} al preparar o {version, arbol} guardado.

    Un HTML inválido se rechaza con su error. Un árbol guardado que ya no cumple el contrato (otra versión, un
    dato retirado) vuelve a fábrica y se registra: nunca impide cargar la carta.
    """
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - {'version', 'html', 'arbol'} or ('html' in value) == ('arbol' in value):
        raise InvalidTemplate(f'{path}: envía {{"version": N, "html": "…"}} o null para volver a la plantilla de fábrica.')
    contract = component(component_id)
    if 'html' in value:
        if value.get('version') != contract['version']:
            raise InvalidTemplate(f'{path}: la versión del contrato de «{component_id}» es {contract["version"]}; lee el componente de nuevo.')
        try:
            return {'version': contract['version'], 'arbol': compile_html(component_id, value['html'])}
        except InvalidTemplate as exc:
            raise InvalidTemplate(f'{path}: {exc}') from None
    try:
        if value.get('version') != contract['version']:
            raise InvalidTemplate(f'versión {value.get("version")} distinta de {contract["version"]}')
        return {'version': contract['version'], 'arbol': validate(component_id, value['arbol'])}
    except InvalidTemplate as exc:
        logger.warning('Plantilla guardada de «%s» ya no es válida; se usa la de fábrica: %s', component_id, exc)
        return None


def contract() -> dict:
    """Lo que ven la IA y la página viva: componentes con datos, ranuras, plantilla de fábrica, utilidades y decoraciones."""
    components = {}
    for component_id, rule in COMPONENTS['componentes'].items():
        components[component_id] = {k: v for k, v in rule.items() if k != 'plantilla_fabrica'}
        components[component_id]['plantilla_fabrica'] = {'html': rule['plantilla_fabrica'], 'arbol': factory(component_id)}
    return {'version': COMPONENTS['version'], 'limites': LIMITS, 'etiquetas': sorted(TAGS), 'formatos': list(FORMATS),
            'componentes': components, 'utilidades': UTILITIES, 'decoraciones': DECORATIONS}
