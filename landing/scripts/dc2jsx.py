"""Convierte la plantilla del Design Component (Landing Waiter.dc.html) en componentes JSX, sin tocar un solo estilo.

- style="a:b;c:d" → style={{ a: 'b', c: 'd' }} (mismo reparto que cssToObj de support.js: corta en «;» y camelCase).
- style-hover / style-focus → clase con `:hover` / `:focus` e `!important` (igual que createPseudoSheet de support.js).
- {{ expr }} → {v.expr} (o la variable del bucle); en estilos y atributos mixtos, plantillas de texto.
- <sc-for list as> → .map con key; <sc-if value> → condicional.
- Los espacios entre etiquetas que el runtime conserva (texto con al menos un espacio) se vuelven {' '}.
- img/… → /img/… (en src, url() y máscaras).
"""
import json
import re
import sys

SRC, OUT_DIR, CSS_OUT = sys.argv[1], sys.argv[2], sys.argv[3]
html = open(SRC, encoding='utf-8').read()
start = html.index('<div ref="{{ rootRef }}"')
end = html.index('</x-dc>')
body = html[start:end].rstrip()
assert body.endswith('</div>')

VOID = {'img', 'input', 'br', 'meta', 'link', 'hr'}
TOKEN = re.compile(r'<!--.*?-->|</([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(/?)>|([^<]+)', re.S)
ATTR = re.compile(r'([^\s=/>]+)(?:="([^"]*)")?')


def parse(text):
    root = {'tag': '#root', 'attrs': [], 'children': []}
    stack = [root]
    for m in TOKEN.finditer(text):
        close, tag, attrs, selfclose, txt = m.groups()
        if m.group(0).startswith('<!--'):
            continue
        if txt is not None:
            stack[-1]['children'].append({'text': txt})
        elif close:
            node = stack.pop()
            assert node['tag'] == close, (node['tag'], close)
        else:
            node = {'tag': tag, 'attrs': ATTR.findall(attrs or ''), 'children': []}
            stack[-1]['children'].append(node)
            if tag not in VOID and not selfclose:
                stack.append(node)
    assert len(stack) == 1
    return root['children'][0]


LOOP_VARS = set()
HOVER = {}


def expr(e):
    e = e.strip()
    head = e.split('.')[0]
    return e if head in LOOP_VARS else 'v.' + e


def fix_url(s):
    s = re.sub(r'url\((["\']?)img/', r'url(\1/img/', s)
    return s


def interp_string(raw):
    """Valor con {{ }} mezclados → expresión JS (plantilla de texto) o literal."""
    raw = fix_url(raw)
    whole = re.fullmatch(r'\s*\{\{([\s\S]+?)\}\}\s*', raw)
    if whole:
        return expr(whole.group(1))
    if '{{' in raw:
        parts = re.split(r'\{\{([\s\S]+?)\}\}', raw)
        out = ''
        for i, p in enumerate(parts):
            out += ('${' + expr(p) + '}') if i % 2 else p.replace('`', '\\`').replace('${', '\\${')
        return '`' + out + '`'
    return json.dumps(raw, ensure_ascii=False).replace('"', "'") if "'" not in raw else json.dumps(raw, ensure_ascii=False)


def camel(prop):
    if prop.startswith('--'):
        return json.dumps(prop)
    if prop.startswith('-webkit-'):
        prop = 'Webkit-' + prop[len('-webkit-'):]
    return re.sub(r'-([a-z])', lambda m: m.group(1).upper(), prop)


def style_obj(raw):
    # Como en un objeto de JS (y en cssToObj): una propiedad repetida conserva su lugar y se queda con el último valor.
    items = {}
    for decl in raw.split(';'):
        i = decl.find(':')
        if i < 0:
            continue
        prop, val = decl[:i].strip(), decl[i + 1:].strip()
        items[camel(prop)] = interp_string(val)
    return '{ ' + ', '.join(f'{k}: {v}' for k, v in items.items()) + ' }'


RENAME = {'class': 'className', 'for': 'htmlFor', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
          'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray', 'stroke-dashoffset': 'strokeDashoffset',
          'stroke-opacity': 'strokeOpacity', 'fill-opacity': 'fillOpacity', 'stroke-miterlimit': 'strokeMiterlimit'}
BOOL = {'noValidate'}
DROP = {'hint-placeholder-count', 'hint-placeholder-val'}


def hover_class(pseudo, css):
    key = (pseudo, css)
    if key not in HOVER:
        HOVER[key] = f'wl-{pseudo[0]}{len(HOVER)}'
    return HOVER[key]


def attrs_jsx(node):
    out, classes = [], []
    for name, value in node['attrs']:
        if name in DROP:
            continue
        if name.startswith('style-'):
            classes.append(hover_class(name[6:], value))
            continue
        if name == 'style':
            out.append(f'style={{{style_obj(value)}}}')
            continue
        if name == 'ref':
            out.append(f'ref={{{interp_string(value)}}}')
            continue
        key = RENAME.get(name, name)
        if key in BOOL:
            out.append(key)
            continue
        if name == 'tabIndex':
            out.append(f'tabIndex={{{int(value)}}}')
            continue
        if name in ('src', 'href') and value.startswith('img/'):
            value = '/' + value
        if '{{' in value:
            out.append(f'{key}={{{interp_string(value)}}}')
        else:
            out.append(f'{key}={json.dumps(value, ensure_ascii=False)}')
    if classes:
        out.insert(0, f'className="{" ".join(classes)}"')
    return out


def text_jsx(txt):
    """Texto: el runtime deja el texto tal cual (solo descarta el que es solo saltos de línea sin espacios)."""
    if not txt.strip():
        return "{' '}" if ' ' in txt else ''
    lead = "{' '}" if txt[0].isspace() else ''
    trail = "{' '}" if txt[-1].isspace() else ''
    core = re.sub(r'\s+', ' ', txt.strip())
    parts = re.split(r'\{\{([\s\S]+?)\}\}', core)
    out = ''
    for i, p in enumerate(parts):
        if i % 2:
            out += '{' + expr(p) + '}'
        else:
            out += p.replace('{', "{'{'}").replace('}', "{'}'}")
    return lead + out + trail


def render(node, ind=0, key=None):
    pad = '  ' * ind
    if 'text' in node:
        t = text_jsx(node['text'])
        return pad + t if t else ''
    tag = node['tag']
    if tag == 'sc-for':
        a = dict(node['attrs'])
        lst = re.fullmatch(r'\s*\{\{([\s\S]+?)\}\}\s*', a['list']).group(1).strip()
        var = a['as']
        LOOP_VARS.add(var)
        kids = [c for c in node['children'] if 'tag' in c]
        assert len(kids) == 1, 'sc-for con más de un hijo'
        inner = render(kids[0], ind + 1, key='i')
        LOOP_VARS.discard(var)
        return f'{pad}{{{expr(lst)}.map(({var}, i) => (\n{inner}\n{pad}))}}'
    if tag == 'sc-if':
        a = dict(node['attrs'])
        cond = re.fullmatch(r'\s*\{\{([\s\S]+?)\}\}\s*', a['value']).group(1).strip()
        kids = [render(c, ind + 2) for c in node['children']]
        kids = [k for k in kids if k.strip() and k.strip() != "{' '}"]
        return f'{pad}{{{expr(cond)} && (\n{pad}  <>\n' + '\n'.join(kids) + f'\n{pad}  </>\n{pad})}}'
    attrs = attrs_jsx(node)
    if key:
        attrs.insert(0, f'key={{{key}}}')
    open_tag = f'<{tag}' + ('' if not attrs else ' ' + ' '.join(attrs))
    if tag in VOID:
        return f'{pad}{open_tag} />'
    kids = [render(c, ind + 1) for c in node['children']]
    # Espacios al inicio y al final del contenido se conservan solo si el runtime los conservaba.
    kids = [k for k in kids if k != '']
    if not kids:
        return f'{pad}{open_tag}></{tag}>'
    simple = len(node['children']) == 1 and 'text' in node['children'][0] and '\n' not in node['children'][0]['text']
    if simple:
        return f'{pad}{open_tag}>{kids[0].strip()}</{tag}>'
    return f'{pad}{open_tag}>\n' + '\n'.join(kids) + f'\n{pad}</{tag}>'


root = parse(body)
sections = [c for c in root['children'] if 'tag' in c]
NAMES = []
for node in sections:
    label = dict(node['attrs']).get('data-screen-label')
    if node['tag'] == 'nav':
        name = 'Nav'
    elif node['tag'] == 'a':
        name = 'WhatsAppFlotante'
    else:
        name = {'01 Hero': 'Hero', '02 Funciona en lo que ya tienes': 'FuncionaEn', '03 Dolores': 'Dolores', '03b Tu equipo': 'TuEquipo',
                '04 Así funciona': 'AsiFunciona', '05 Módulos': 'Modulos', '06 Domicilios': 'Domicilios', '07 Mesero virtual': 'MeseroVirtual',
                '08 Banda': 'Banda', '09 Precios': 'Precios', '10 Seguridad': 'Seguridad', '11 Agenda tu demo': 'AgendaDemo',
                '12 Preguntas': 'Preguntas', '13 CTA final': 'CtaFinal', '14 Pie': 'Pie'}[label]
    NAMES.append(name)
    jsx = render(node, 2)
    uses_v = re.search(r'(?<![\w.])v\.[A-Za-z]', jsx) is not None
    sig = '{ v }: { v: LandingVals }' if uses_v else ''
    comment = f'// {label}' if label else ('// 00 Navegación' if name == 'Nav' else '// Botón flotante de WhatsApp')
    src = (("/* eslint-disable @next/next/no-img-element */\n" if '<img' in jsx else '')
           + "// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,\n"
           "// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.\n"
           + ("import type { LandingVals } from '../vals'\n\n" if uses_v else '\n')
           + f"{comment}\nexport function {name}({sig}) {{\n  return (\n{jsx}\n  )\n}}\n")
    open(f'{OUT_DIR}/{name}.tsx', 'w', encoding='utf-8').write(src)

css = '/* Generado con scripts/dc2jsx.py: los style-hover / style-focus del diseño (como createPseudoSheet de support.js). */\n'
for (pseudo, decls), cls in HOVER.items():
    body_css = ';'.join(d.strip() + ' !important' for d in decls.split(';') if d.strip())
    css += f'.{cls}:{pseudo}{{{body_css}}}\n'
open(CSS_OUT, 'w', encoding='utf-8').write(css)
root_style = style_obj(dict(root['attrs'])['style'])
print(json.dumps({'secciones': NAMES, 'raiz': root_style, 'hover': len(HOVER)}, ensure_ascii=False))
