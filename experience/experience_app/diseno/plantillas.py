"""Plan K1: plantillas HTML restringidas por componente.

Una plantilla llega como HTML de un lenguaje cerrado y se guarda como árbol JSON validado; el comensal la dibuja
desde el árbol, nunca desde HTML crudo. Reglas: solo las etiquetas de `componentes.json`, solo clases `ds-*` de
`utilidades.json`, datos y ranuras del contrato del componente (con las obligatorias presentes), decoraciones del
catálogo y límites de tamaño. Cada error dice qué falló y dónde, para que la IA lo corrija sola.
"""
import contextlib
import contextvars
import html as html_module
import json
import logging
import re
from html.parser import HTMLParser
from pathlib import Path

_HERE = Path(__file__).parent
COMPONENTS = json.loads((_HERE / 'componentes.json').read_text(encoding='utf-8'))
# Un contrato por archivo (componentes/<id>.json): cada componente plantillable se añade sin tocar los demás.
COMPONENTS['componentes'] = {path.stem: json.loads(path.read_text(encoding='utf-8'))
                             for path in sorted((_HERE / 'componentes').glob('*.json'))}
UTILITIES = json.loads((_HERE / 'utilidades.json').read_text(encoding='utf-8'))
DECORATIONS = json.loads((_HERE / 'decoraciones.json').read_text(encoding='utf-8'))
UTILITY_CLASSES = {u['clase'] for group in UTILITIES['grupos'] for u in group['utilidades']}
TAGS = set(COMPONENTS['etiquetas'])
FORMATS = tuple(COMPONENTS['formatos'])
LIMITS = COMPONENTS['limites']
SPECIAL = {'dato', 'ranura', 'si', 'cada', 'decoracion'}
logger = logging.getLogger(__name__)
FACTORY_FILES = {d['id']: d['archivo'] for d in DECORATIONS['fabrica']}
# Sede cuyo tema se está validando: sus decoraciones cuentan además de las de fábrica. La fijan las rutas que conocen la sede.
_venue = contextvars.ContextVar('venue', default=None)


@contextlib.contextmanager
def for_venue(restaurant: str, venue: str):
    token = _venue.set((restaurant, venue))
    try:
        yield
    finally:
        _venue.reset(token)


def decoration_files(extra=()) -> dict:
    """{id: archivo} disponible ahora: fábrica más las de la sede en contexto. Los ids de fábrica no se pueden pisar."""
    files = {}
    current = _venue.get()
    if current is not None:
        from experience_app.diseno import decoraciones
        files.update(decoraciones.files(*current))
    files.update({d: '' for d in extra})
    files.update(FACTORY_FILES)
    return files


class InvalidTemplate(ValueError):
    """La plantilla no cumple el lenguaje o el contrato del componente."""


def component(component_id: str) -> dict:
    try:
        return COMPONENTS['componentes'][component_id]
    except KeyError:
        raise InvalidTemplate(f'componente desconocido «{component_id}»; admitidos: {", ".join(COMPONENTS["componentes"])}.') from None


def decoration_ids(extra=()) -> set:
    return set(decoration_files(extra))


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

    def unknown_decl(self, data):
        # <![CDATA[…]]> y similares: sin esto, HTMLParser los traga en silencio y parte de la plantilla desaparecería.
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
_KEYS = {'elemento': {'etiqueta', 'clases', 'hijos'}, 'texto': {'texto'}, 'dato': {'nombre', 'formato'}, 'ranura': {'nombre', 'hijos'},
         'si': {'dato', 'hijos'}, 'cada': {'dato', 'como', 'hijos'}, 'decoracion': {'id', 'movimiento', 'posicion', 'archivo'}}


class _Checker:
    """Comprueba un árbol contra el contrato y devuelve uno canónico: solo las claves de cada tipo de nodo.

    Así un `arbol` enviado por un cliente en vez de `html` no puede colar claves ocultas ni hijos que no se recorren.
    """

    def __init__(self, contract, decorations):
        # `decorations` es {id: archivo}; el archivo se guarda en el nodo para que el comensal no tenga que resolverlo.
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
        clean = []
        for node in nodes:
            self.nodes += 1
            if self.nodes > LIMITS['nodos']:
                raise InvalidTemplate(f'la plantilla supera los {LIMITS["nodos"]} nodos.')
            if not isinstance(node, dict) or node.get('tipo') not in _KEYS:
                raise InvalidTemplate(f'{where}: nodo desconocido.')
            unexpected = set(node) - {'tipo'} - _KEYS[node['tipo']]
            if unexpected:
                raise InvalidTemplate(f'{where}: campo inesperado «{sorted(unexpected)[0]}» en un nodo {node["tipo"]}.')
            clean.append(getattr(self, node['tipo'])(node, depth, scope, where))
        return clean

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
        # Los elementos decorativos, incluida ds-barra, admiten hijos vacíos.
        return {'tipo': 'elemento', 'etiqueta': tag, 'clases': list(dict.fromkeys(classes)),
                'hijos': self.walk(node.get('hijos', []), depth + 1, scope, f'<{tag}>')}

    def texto(self, node, depth, scope, where):
        text = node.get('texto')
        if not isinstance(text, str) or not text.strip():
            raise InvalidTemplate(f'{where}: texto vacío.')
        if len(text) > LIMITS['texto']:
            raise InvalidTemplate(f'{where}: un texto fijo supera los {LIMITS["texto"]} caracteres; los datos largos van con <dato>.')
        if re.search(r'://|www\.', text, re.I):
            raise InvalidTemplate(f'{where}: no se admiten direcciones web en el texto.')
        return {'tipo': 'texto', 'texto': re.sub(r'\s+', ' ', text)}

    def _resolve(self, name, scope, where):
        if not isinstance(name, str):
            raise InvalidTemplate(f'{where}: nombre de dato inválido.')
        head = name.split('.', 1)[0]
        if head in scope:
            rest = name[len(head):]
            return f'{scope[head]}{rest}'
        return name

    def _rule(self, name):
        """Regla de un dato del contrato o de un campo de una de sus listas («pedido.lineas.cantidad»)."""
        rule = self.datos.get(name)
        if rule is not None:
            return rule
        parent, _, field = name.rpartition('.')
        parent_rule = self.datos.get(parent)
        if parent_rule and parent_rule['tipo'] == 'lista':
            return parent_rule.get('campos', {}).get(field)
        return None

    def _available(self, scope):
        names = list(self.datos)
        for alias, list_name in scope.items():
            names.extend(f'{alias}.{field}' for field in self.datos[list_name].get('campos', {}))
        return ', '.join(names)

    def dato(self, node, depth, scope, where):
        name = self._resolve(node.get('nombre'), scope, where)
        rule = self._rule(name)
        if rule is None:
            raise InvalidTemplate(f'{where}: dato desconocido «{node.get("nombre")}»; disponibles: {self._available(scope)}.')
        if rule['tipo'] in ('booleano', 'lista'):
            raise InvalidTemplate(f'{where}: «{name}» es {rule["tipo"]}; úsalo con <si> o <cada>, no con <dato>.')
        fmt = node.get('formato', 'texto')
        if fmt not in FORMATS:
            raise InvalidTemplate(f'{where}: formato desconocido «{fmt}»; admitidos: {", ".join(FORMATS)}.')
        if fmt == 'precio' and rule['tipo'] != 'precio':
            raise InvalidTemplate(f'{where}: «{name}» no es un precio; quita formato="precio".')
        self.used_datos.add(name)
        return {'tipo': 'dato', 'nombre': node['nombre'], **({'formato': fmt} if fmt != 'texto' else {})}

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
        return {'tipo': 'ranura', 'nombre': name, 'hijos': self.walk(children, depth + 1, scope, f'<ranura nombre="{name}">')}

    def si(self, node, depth, scope, where):
        name = self._resolve(node.get('dato'), scope, where)
        if self._rule(name) is None:
            raise InvalidTemplate(f'<si>: dato desconocido «{node.get("dato")}»; disponibles: {self._available(scope)}.')
        self.used_datos.add(name)
        return {'tipo': 'si', 'dato': node['dato'], 'hijos': self.walk(node.get('hijos', []), depth + 1, scope, f'<si dato="{name}">')}

    def cada(self, node, depth, scope, where):
        name = self._resolve(node.get('dato'), scope, where)
        rule = self.datos.get(name)
        if rule is None or rule['tipo'] != 'lista':
            raise InvalidTemplate(f'<cada>: «{node.get("dato")}» no es una lista del contrato.')
        alias = node.get('como')
        if not isinstance(alias, str) or not re.fullmatch(r'[a-z][a-z0-9]*', alias) or alias in scope:
            raise InvalidTemplate('<cada>: «como» debe ser un nombre simple en minúsculas y distinto de los ya usados.')
        self.used_datos.add(name)
        return {'tipo': 'cada', 'dato': node['dato'], 'como': alias,
                'hijos': self.walk(node.get('hijos', []), depth + 1, {**scope, alias: name}, f'<cada dato="{name}">')}

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
        return {'tipo': 'decoracion', 'id': node['id'], 'movimiento': movement, 'posicion': position,
                'archivo': self.decorations[node['id']] or f'/smart-menu/{node["id"]}.png'}

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
    """Comprueba el árbol contra el contrato del componente y devuelve su forma canónica."""
    contract = component(component_id)
    checker = _Checker(contract, decoration_files(decorations))
    clean = checker.walk(tree)
    checker.finish()
    return clean


def compile_html(component_id: str, html: str, *, decorations=()) -> list:
    return validate(component_id, parse(html), decorations=decorations)


def factory(component_id: str) -> list:
    return compile_html(component_id, component(component_id)['plantilla_fabrica'])


def _tags(node):
    kind = node['tipo']
    if kind == 'elemento':
        return node['etiqueta'] + (f' class="{" ".join(node["clases"])}"' if node.get('clases') else ''), node['etiqueta']
    if kind == 'ranura':
        return f'ranura nombre="{node["nombre"]}"', 'ranura'
    if kind == 'si':
        return f'si dato="{node["dato"]}"', 'si'
    return f'cada dato="{node["dato"]}" como="{node["como"]}"', 'cada'


def _void(node):
    kind = node['tipo']
    if kind == 'texto':
        return html_module.escape(node['texto'], quote=False)
    if kind == 'dato':
        return f'<dato nombre="{node["nombre"]}"' + (f' formato="{node["formato"]}"' if node.get('formato') else '') + '/>'
    if kind == 'decoracion':
        return f'<decoracion id="{node["id"]}" movimiento="{node["movimiento"]}" posicion="{node["posicion"]}"/>'
    if kind == 'ranura' and not node.get('hijos'):
        return f'<ranura nombre="{node["nombre"]}"/>'
    return None


def _inline(nodes) -> str:
    parts = []
    for node in nodes:
        text = _void(node)
        if text is None:
            opening, closing = _tags(node)
            text = f'<{opening}>{_inline(node.get("hijos", []))}</{closing}>'
        parts.append(text)
    return ''.join(parts)


def to_html(tree: list, indent: int = 0) -> str:
    """Árbol → HTML del lenguaje, para que la IA lea y edite la plantilla actual sin conocer el JSON.

    Los bloques van en líneas con sangría; en cuanto hay texto suelto, ese nivel se escribe en una sola línea para
    conservar los espacios exactos (« min» junto a un <dato>). Recompilar el resultado devuelve el mismo árbol.
    """
    pad, lines = '  ' * indent, []
    if any(node['tipo'] == 'texto' for node in tree):
        # Con texto suelto en este nivel no puede haber saltos de línea: se pegarían al texto como espacios.
        return pad + _inline(tree)
    for node in tree:
        text = _void(node)
        if text is not None:
            lines.append(pad + text)
            continue
        opening, closing = _tags(node)
        children = node.get('hijos', [])
        if not children:
            lines.append(pad + f'<{opening}></{closing}>')
        elif any(child['tipo'] == 'texto' for child in children):
            lines.append(pad + f'<{opening}>{_inline(children)}</{closing}>')
        else:
            lines.append(pad + f'<{opening}>')
            lines.append(to_html(children, indent + 1))
            lines.append(pad + f'</{closing}>')
    return '\n'.join(lines)


# Criterios de medidas que se pueden juzgar sin navegador. Son avisos: la IA los ve al preparar y decide;
# la comprobación definitiva de desbordes y solapes la hace verificar_borrador con el borrador abierto.
def warnings(component_id: str, tree: list) -> list:
    contract = component(component_id)
    narrow = contract.get('limites', {}).get('ancho_minimo', 10_000)
    found, classes, decorations = [], [], 0

    def walk(nodes, inside_row=False):
        nonlocal decorations
        for node in nodes:
            if node['tipo'] == 'elemento':
                classes.extend(node.get('clases', []))
                if inside_row and 'ds-foto-grande' in node.get('clases', []):
                    found.append('ds-foto-grande dentro de una fila (ds-fila) no deja sitio al resto; úsala en una pila.')
                walk(node.get('hijos', []), inside_row or 'ds-fila' in node.get('clases', []))
            elif node['tipo'] == 'decoracion':
                decorations += 1
            elif node.get('hijos'):
                walk(node['hijos'], inside_row)

    walk(tree)
    if narrow < 200 and any(c in classes for c in ('ds-texto-grande', 'ds-texto-titulo')):
        found.append(f'ds-texto-titulo o ds-texto-grande en un componente de {narrow} px de ancho mínimo: los nombres largos se parten en sílabas. Usa ds-texto-subtitulo o ds-texto-cuerpo.')
    if narrow < 200 and 'ds-rejilla-2' in classes:
        found.append(f'ds-rejilla-2 en un componente de {narrow} px: las dos columnas no caben; quedará en una.')
    if decorations > 1 and narrow < 200:
        found.append(f'{decorations} decoraciones en un componente de {narrow} px se solapan con el contenido; deja una.')
    return list(dict.fromkeys(found))


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
