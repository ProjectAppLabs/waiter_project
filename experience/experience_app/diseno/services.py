"""Tema v2 cerrado: valores por defecto, validación y adaptación del contrato de plantillas."""
import json
import logging
import math
import re
from copy import deepcopy
from pathlib import Path

from experience_app.utils.brand import contrast, ink_for

SCHEMA = json.loads(Path(__file__).with_name('esquema.json').read_text(encoding='utf-8'))
logger = logging.getLogger(__name__)


class InvalidTheme(ValueError):
    """El tema no cumple el esquema o una regla de legibilidad."""


def _normalize(value, schema, path='tema'):
    kind = schema['type']
    if kind == 'object':
        if not isinstance(value, dict):
            raise InvalidTheme(f'{path} debe ser un objeto.')
        props = schema['properties']
        unknown = set(value) - set(props)
        if unknown:
            raise InvalidTheme(f'{path}: campo desconocido «{sorted(unknown)[0]}».')
        return {key: _normalize(value.get(key, deepcopy(rule.get('default', {}))), rule, f'{path}.{key}')
                for key, rule in props.items()}
    if kind in ('number', 'integer'):
        if type(value) not in (int, float) or (type(value) is float and not math.isfinite(value)) or (kind == 'integer' and value != int(value)):
            raise InvalidTheme(f'{path} debe ser un número finito.')
        if 'const' in schema and value != schema['const']:
            raise InvalidTheme(f'{path}: versión admitida {schema["const"]}.')
        if 'minimum' in schema and not schema['minimum'] <= value <= schema['maximum']:
            raise InvalidTheme(f'{path}: {value}; mínimo {schema["minimum"]}, máximo {schema["maximum"]}.')
    elif kind == 'string':
        if not isinstance(value, str):
            raise InvalidTheme(f'{path} debe ser texto.')
        if 'pattern' in schema:
            if re.fullmatch(schema['pattern'], value) is None:
                raise InvalidTheme(f'{path} debe ser #RRGGBB.')
            value = value.upper()
        if 'enum' in schema and value not in schema['enum']:
            raise InvalidTheme(f'{path}: valor fuera de la lista: {", ".join(schema["enum"])}.')
    return value


def defaults() -> dict:
    return _normalize({}, SCHEMA)


def _mix(accent: str, background: str) -> str:
    return '#' + ''.join(f'{round(int(background[i:i+2], 16) + (int(accent[i:i+2], 16) - int(background[i:i+2], 16)) * .1):02X}'
                         for i in (1, 3, 5))


def validate(theme: dict) -> dict:
    """Acepta un tema parcial, completa lo omitido y devuelve un tema canónico sin modificar la entrada."""
    clean = _normalize(theme, SCHEMA)
    colors = clean['fundamentos']['colores']
    original = defaults()['fundamentos']['colores']
    # El diseño conserva sus derivados exactos; un acento/fondo nuevo recalcula ambos.
    if any(colors[k] != original[k] for k in ('acento', 'fondo')):
        colors['acentoTinta'] = ink_for(colors['acento'])
        colors['acentoSuave'] = _mix(colors['acento'], colors['fondo'])
    else:
        for key in ('acentoTinta', 'acentoSuave'):
            colors[key] = original[key]
    pairs = [(ink, surface) for ink in ('tinta', 'tintaSuave') for surface in ('fondo', 'superficie')]
    pairs.append(('tinta', 'acentoSuave'))
    pairs.append(('acentoTinta', 'acento'))
    for ink, surface in pairs:
        ratio = contrast(colors[ink], colors[surface])
        if ratio < 4.5:
            raise InvalidTheme(f'{ink} sobre {surface}: {ratio:.2f}:1; mínimo 4.5:1.')
    return clean


def from_tokens(tokens: dict) -> dict:
    theme = defaults()
    foundation = theme['fundamentos']
    foundation['colores'].update({k: tokens[k] for k in foundation['colores']})
    foundation['tipografia'] = {'display': tokens['displayFont'], 'cuerpo': tokens['cuerpoFont']}
    return theme


def resolve(theme, tokens: dict) -> dict:
    """Sin tema usa los ajustes anteriores; un tema corrupto nunca impide abrir el menú."""
    try:
        return validate(from_tokens(tokens) if theme is None or theme == {} else theme)
    except InvalidTheme as exc:
        logger.warning('Tema del menú inválido; se usa el predeterminado: %s', exc)
        return defaults()


def apply_to_tokens(theme: dict, tokens: dict) -> dict:
    foundation = theme['fundamentos']
    return {**tokens, **foundation['colores'], 'displayFont': foundation['tipografia']['display'],
            'cuerpoFont': foundation['tipografia']['cuerpo'], 'monoFont': foundation['tipografia']['cuerpo']}
