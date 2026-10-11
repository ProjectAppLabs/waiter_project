"""Convierte las páginas legales de ProjectApp (design/legal/*.html) en componentes JSX con las clases de app/legal.css.

Conserva el texto tal cual; cambia las clases de Tailwind de ProjectApp por las de Waiter y los enlaces de
projectapp.co/es-co/waiter por las rutas de la landing. Los saltos de línea del HTML guardado son de formato
(el original no tenía ninguno) y se descartan.

Uso: python3 scripts/legal2jsx.py design/legal components/legal
"""
import json
import re
import sys
from html.parser import HTMLParser

SRC, OUT = sys.argv[1], sys.argv[2]

PAGINAS = [  # archivo, componente, comentario
    ('privacy', 'Privacidad', 'Política de tratamiento de datos personales'),
    ('terms', 'Condiciones', 'Condiciones del servicio'),
    ('data-deletion', 'EliminacionDatos', 'Cómo pedir la eliminación de tus datos'),
]

ENLACES = {
    '/es-co/waiter': '/',
    '/es-co/waiter/privacy': '/privacy',
    '/es-co/waiter/terms': '/terms',
    '/es-co/waiter/data-deletion': '/data-deletion',
    '/es-co/privacy-policy': 'https://projectapp.co/es-co/privacy-policy',
}

VOID = {'br', 'img', 'hr'}


def clase(tag, cls):
    """Clase de Waiter según la etiqueta y las clases de Tailwind de ProjectApp."""
    c = set(cls.split())
    if tag == 'article':
        return 'legal-doc'
    if tag == 'h1':
        return 'legal-h1'
    if tag == 'h2':
        return 'legal-h2'
    if tag == 'h3':
        return 'legal-h3'
    if tag == 'p':
        if 'text-text-muted' in c:
            return 'legal-fecha'
        if 'rounded-2xl' in c:
            return 'legal-aviso'
        return 'legal-p'
    if tag == 'section':
        return 'legal-seccion'
    if tag == 'ul':
        return 'legal-lista legal-lista-anidada' if 'list-[circle]' in c else 'legal-lista'
    if tag == 'ol':
        return 'legal-lista legal-lista-numerada'
    if tag == 'a':
        return 'legal-volver-enlace' if 'inline-flex' in c else 'legal-a'
    if tag == 'div':
        if 'overflow-x-auto' in c:
            return 'legal-tabla'
        if 'border-t' in c:
            return 'legal-volver'
    if tag == 'span' and 'me-2' in c:
        return 'legal-flecha'
    return None


class Arbol(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.raiz = {'tag': '#raiz', 'attrs': {}, 'hijos': []}
        self.pila = [self.raiz]

    def handle_starttag(self, tag, attrs):
        nodo = {'tag': tag, 'attrs': dict(attrs), 'hijos': []}
        self.pila[-1]['hijos'].append(nodo)
        if tag not in VOID:
            self.pila.append(nodo)

    def handle_endtag(self, tag):
        nodo = self.pila.pop()
        assert nodo['tag'] == tag, (nodo['tag'], tag)

    def handle_data(self, data):
        data = data.replace('\n', '')
        if data:
            self.pila[-1]['hijos'].append({'texto': data})


def texto(t):
    for a, b in (('&', '&amp;'), ('{', "{'{'}"), ('}', "{'}'}"), ('<', '&lt;'), ('>', '&gt;'), ('"', '&quot;'), ("'", '&apos;')):
        t = t.replace(a, b)
    return t


def bloque(nodo):
    """Un elemento va en varias líneas solo si todos sus hijos son elementos (no hay texto que unir)."""
    return nodo['hijos'] and all('tag' in h for h in nodo['hijos'])


def jsx(nodo, ind):
    if 'texto' in nodo:
        return texto(nodo['texto'])
    tag, a = nodo['tag'], nodo['attrs']
    props = []
    if a.get('id'):
        props.append(f'id="{a["id"]}"')
    c = clase(tag, a.get('class', ''))
    if c:
        props.append(f'className="{c}"')
    if tag == 'a':
        href = a.get('href', '')
        href = ENLACES.get(href, href)
        props.append(f'href="{href}"')
        if href.startswith('http'):
            props.append('target="_blank" rel="noopener noreferrer"')
    if a.get('aria-hidden'):
        props.append(f'aria-hidden="{a["aria-hidden"]}"')
    if tag == 'a' and props[-1].startswith('href="/'):
        tag = 'Link'  # las rutas de la landing navegan sin recargar
    apertura = f'<{tag}' + ''.join(' ' + p for p in props)
    if tag in VOID:
        return apertura + ' />'
    pad = '  ' * ind
    if bloque(nodo):
        dentro = '\n'.join(pad + '  ' + jsx(h, ind + 1) for h in nodo['hijos'])
        return f'{apertura}>\n{dentro}\n{pad}</{tag}>'
    return f'{apertura}>' + ''.join(jsx(h, ind) for h in nodo['hijos']) + f'</{tag}>'


for archivo, nombre, titulo in PAGINAS:
    html = open(f'{SRC}/{archivo}.html', encoding='utf-8').read()
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    arbol = Arbol()
    arbol.feed(html)
    articulo = [h for h in arbol.raiz['hijos'] if 'tag' in h]
    assert len(articulo) == 1 and articulo[0]['tag'] == 'article', archivo
    cuerpo = jsx(articulo[0], 2)
    src = (f'// Generado desde design/legal/{archivo}.html (copia de projectapp.co/es-co/waiter/{archivo}) con\n'
           '// scripts/legal2jsx.py: no editar a mano, regenerar.\n'
           + ("import Link from 'next/link'\n" if '<Link' in cuerpo else '') + '\n'
           f'// {titulo}\n'
           f'export function {nombre}() {{\n  return (\n    {cuerpo}\n  )\n}}\n')
    open(f'{OUT}/{nombre}.tsx', 'w', encoding='utf-8').write(src)
    print(json.dumps({'pagina': archivo, 'componente': nombre, 'caracteres': len(src)}, ensure_ascii=False))
