#!/usr/bin/env python3
"""Plan J1: pasa los valores fijos del CSS del menú a variables del design system.

Uso:  python3 scripts/design-system/tokenizar.py [--aplicar] [--reporte]
Sin --aplicar solo informa. Es idempotente: una declaración que ya usa var(--ds-…) no se toca.

Reglas (docs/planes/2026-09-24-plan-J-design-system-del-menu.md):
- Espaciado (padding, margin, gap): cada medida de 2 a 64 px pasa a la escala de pasos de 2 px
  (`var(--ds-espacio-N)`, N = px redondeado al par; el impar sube). Una escala de 4 px movía 206 de 775 valores
  y agrandaba justo los más usados (10 → 12 px, 51 veces); con pasos de 2 px solo se mueven los impares, 1 px.
  0 y 1 px (líneas finas) y las medidas grandes (> 64 px, hueco para barras fijas) quedan igual.
- Texto: `font-size` y `line-height` en px se multiplican por la escala de texto
  (`calc(Npx * var(--ds-texto))`), y en las reglas de títulos (fuente --t-display) también por la de títulos. Los
  valores no se redondean: con las escalas en 1 el texto queda idéntico.
- Radios: cada radio de 2 a 32 px se redondea al par y se multiplica por la forma de su rol
  (`calc(Kpx * var(--ds-forma-<rol>))`); el rol sale del selector (tarjeta, botón, chip, imagen, campo, hoja).
  50 %, 0 y los radios decorativos grandes quedan igual.
"""
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = sorted((ROOT / 'components' / 'smart').glob('*.css'))
TOKENS_FILE = 'smart-tokens.css'

SPACING_PROPS = re.compile(r'^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$')
PX = re.compile(r'(?<![\w.-])(-?)(\d+(?:\.\d+)?)px\b')

# Rol del radio según el selector. El orden importa: gana la primera coincidencia.
ROLES = [
    ('hoja', {'sheet', 'dialog', 'drawer', 'modal', 'popover', 'reminder', 'toast', 'receipt'}),
    ('imagen', {'photo', 'img', 'image', 'hero', 'avatar', 'thumb', 'logo', 'picture', 'orbits', 'media', 'symbol', 'thumb'}),
    ('chip', {'chip', 'chips', 'pill', 'tag', 'tags', 'badge', 'dot', 'dots', 'count', 'categories', 'methods'}),
    ('campo', {'field', 'input', 'textarea', 'search', 'select', 'boxes', 'coupon'}),
    ('boton', {'button', 'btn', 'cta', 'stepper', 'primary', 'secondary', 'add', 'remove', 'close', 'back', 'toggle', 'launch', 'submit'}),
]


def half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def spacing_step(px: float) -> str | None:
    if px <= 1 or px > 64:
        return None
    return str(max(2, half_up(px / 2) * 2))


def radius_px(px: float) -> int | None:
    if px < 2 or px > 32:
        return None
    return max(2, half_up(px / 2) * 2)


def role_for(selector: str, value: str) -> str:
    # Una hoja inferior tiene solo las esquinas de arriba redondeadas (N N 0 0).
    if re.fullmatch(r'\s*\d+px \d+px 0 0\s*', value):
        return 'hoja'
    # Palabras del selector: nombres de clase y de elemento partidos por guiones (.sm-chat-add → sm, chat, add).
    words = {w for token in re.findall(r'[a-z][a-z0-9_-]*', selector.lower()) for w in token.split('-')}
    for role, keys in ROLES:
        if words & keys:
            return role
    return 'tarjeta'


def convert_spacing(value: str, stats: Counter) -> str:
    def sub(m):
        sign, num = m.group(1), float(m.group(2))
        step = spacing_step(num)
        if step is None:
            return m.group(0)
        stats[(num, step)] += 1
        var = f'var(--ds-espacio-{step})'
        return f'calc(-1 * {var})' if sign else var
    return PX.sub(sub, value)


def convert_text(value: str, display: bool) -> str:
    factor = 'var(--ds-texto) * var(--ds-titulo)' if display else 'var(--ds-texto)'

    def sub(m):
        if m.group(1):
            return m.group(0)
        return f'calc({m.group(2)}px * {factor})'
    return PX.sub(sub, value)


def convert_font_shorthand(value: str, display: bool) -> str:
    # font: <peso> <tamaño>/<interlineado> <familia>  →  tamaño e interlineado a la escala; el resto igual.
    factor = 'var(--ds-texto) * var(--ds-titulo)' if display or '--t-display' in value else 'var(--ds-texto)'
    m = re.match(r'^(\s*(?:[\w-]+\s+)*?)(\d+(?:\.\d+)?)px(?:/(\d+(?:\.\d+)?)px)?(\s+.*)$', value)
    if not m:
        return value
    size = f'calc({m.group(2)}px * {factor})'
    line = f'/calc({m.group(3)}px * {factor})' if m.group(3) else ''
    return f'{m.group(1)}{size}{line}{m.group(4)}'


def convert_radius(selector: str, value: str, stats: Counter, roles: dict) -> str:
    role = role_for(selector, value)
    changed = False

    def sub(m):
        nonlocal changed
        if m.group(1):
            return m.group(0)
        px = radius_px(float(m.group(2)))
        if px is None:
            return m.group(0)
        changed = True
        stats[(float(m.group(2)), px)] += 1
        return f'calc({px}px * var(--ds-forma-{role}))'
    out = PX.sub(sub, value)
    if changed:
        roles[role].append(selector.strip()[:90])
    return out


def transform(css: str, stats: dict, roles: dict) -> str:
    """Recorre el CSS con una pila de llaves; convierte las declaraciones de cada bloque según su propiedad."""
    out, i, n = [], 0, len(css)
    selector_stack: list[str] = []
    buf_start = 0
    while i < n:
        ch = css[i]
        if css.startswith('/*', i):
            end = css.find('*/', i + 2)
            i = n if end < 0 else end + 2
            continue
        if ch == '{':
            header = css[buf_start:i]
            out.append(header + '{')
            selector_stack.append(header.split('}')[-1].split(';')[-1])
            i += 1
            buf_start = i
            # Si el bloque no contiene otro bloque, es un bloque de declaraciones.
            close, nxt = css.find('}', i), css.find('{', i)
            if close >= 0 and (nxt < 0 or close < nxt):
                body = css[i:close]
                out.append(transform_block(selector_stack[-1], body, stats, roles))
                out.append('}')
                selector_stack.pop()
                i = close + 1
                buf_start = i
            continue
        if ch == '}':
            out.append(css[buf_start:i] + '}')
            if selector_stack:
                selector_stack.pop()
            i += 1
            buf_start = i
            continue
        i += 1
    out.append(css[buf_start:])
    return ''.join(out)


def transform_block(selector: str, body: str, stats: dict, roles: dict) -> str:
    display = '--t-display' in body
    parts = re.split(r'(;)', body)
    result = []
    for part in parts:
        if ':' not in part or part.strip().startswith('--') or 'var(--ds-' in part:
            result.append(part)
            continue
        prop, _, value = part.partition(':')
        name = prop.strip().lower()
        if SPACING_PROPS.match(name):
            value = convert_spacing(value, stats['espacio'])
        elif name in ('font-size', 'line-height'):
            value = convert_text(value, display)
            stats['texto'][name] += 1
        elif name == 'font':
            new = convert_font_shorthand(value, display)
            if new != value:
                stats['texto']['font'] += 1
            value = new
        elif name == 'border-radius' or re.match(r'border-(top|bottom)-(left|right)-radius', name):
            value = convert_radius(selector, value, stats['radio'], roles)
        result.append(f'{prop}:{value}')
    return ''.join(result)


def main():
    apply = '--aplicar' in sys.argv
    stats = {'espacio': Counter(), 'texto': Counter(), 'radio': Counter()}
    roles: dict = defaultdict(list)
    for path in FILES:
        if path.name == TOKENS_FILE:
            continue
        css = path.read_text()
        new = transform(css, stats, roles)
        if apply and new != css:
            path.write_text(new)
    moved = sum(c for (px, step), c in stats['espacio'].items() if px != int(step))
    print(f"espaciado: {sum(stats['espacio'].values())} valores → escala; {moved} se mueven de medida")
    print(f"texto: {dict(stats['texto'])}")
    print(f"radios: {sum(stats['radio'].values())} → escala por rol; {sum(c for (a, b), c in stats['radio'].items() if a != b)} se mueven")
    if '--reporte' in sys.argv:
        print('\n== desplazamientos de espaciado (px → paso) ==')
        for (px, step), c in sorted(stats['espacio'].items()):
            target = int(step)
            if px != target:
                print(f'  {px:g}px → {target}px  (x{c})')
        print('\n== radios por rol ==')
        for role, sels in sorted(roles.items()):
            print(f'  {role} ({len(sels)}): ' + ' | '.join(sorted(set(sels))[:14]))
    print('APLICADO' if apply else '(solo informe; usa --aplicar para escribir)')


if __name__ == '__main__':
    main()
