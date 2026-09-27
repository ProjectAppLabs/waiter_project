"""Tema v2 cerrado: valores por defecto, validación y adaptación del contrato de plantillas."""
import json
import logging
import math
import re
from copy import deepcopy
from pathlib import Path

import requests

from experience_app.diseno import plantillas
from experience_app.utils.brand import contrast, ink_for

SCHEMA = json.loads(Path(__file__).with_name('esquema.json').read_text(encoding='utf-8'))
# Plan K: la capa `componentes` del esquema se completa con los contratos de componentes/<id>.json.
SCHEMA['properties']['componentes']['properties'] = {
    component_id: {'type': 'plantilla', 'componente': component_id, 'default': None,
                   'description': f'{rule["nombre"]} (contrato v{rule["version"]}).'}
    for component_id, rule in plantillas.COMPONENTS['componentes'].items()}


def public_schema() -> dict:
    """El esquema para clientes (tools/list y GET /api/v1/diseno/): `plantilla` no es un tipo JSON Schema, así que la
    capa componentes se publica como null | {version, html}."""
    schema = deepcopy(SCHEMA)
    for component_id, rule in schema['properties']['componentes']['properties'].items():
        version = plantillas.COMPONENTS['componentes'][component_id]['version']
        rule.pop('type', None)
        rule.pop('componente', None)
        rule['oneOf'] = [{'type': 'null'}, {'type': 'object', 'additionalProperties': False, 'required': ['version', 'html'],
                                            'properties': {'version': {'const': version}, 'html': {'type': 'string', 'maxLength': 20000}}}]
    return schema
INVENTORY = json.loads(Path(__file__).with_name('inventario.json').read_text(encoding='utf-8'))
logger = logging.getLogger(__name__)
GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2'
GOOGLE_FONTS_TIMEOUT = 3


class InvalidTheme(ValueError):
    """El tema no cumple el esquema o una regla de legibilidad."""


def _normalize(value, schema, path='tema'):
    kind = schema['type']
    if kind == 'plantilla':
        # Plan K: la plantilla de un componente se valida con su contrato y se guarda como árbol.
        try:
            return plantillas.normalize(schema['componente'], value, path)
        except plantillas.InvalidTemplate as exc:
            raise InvalidTheme(str(exc)) from None
    if kind == 'object':
        if not isinstance(value, dict):
            raise InvalidTheme(f'{path} debe ser un objeto.')
        props = schema['properties']
        unknown = set(value) - set(props)
        if unknown:
            raise InvalidTheme(f'{path}: campo desconocido «{sorted(unknown)[0]}».')
        clean = {key: _normalize(value.get(key, deepcopy(rule.get('default', {}))), rule, f'{path}.{key}')
                 for key, rule in props.items()}
        for key, rule in props.items():
            if key not in value and 'x-defaultFrom' in rule:
                clean[key] = clean[rule['x-defaultFrom']]
        return clean
    if kind == 'array':
        if not isinstance(value, list):
            raise InvalidTheme(f'{path} debe ser una lista.')
        if not schema['minItems'] <= len(value) <= schema['maxItems']:
            raise InvalidTheme(f'{path}: admite de {schema["minItems"]} a {schema["maxItems"]} familias.')
        clean = [_normalize(item, schema['items'], f'{path}[{index}]') for index, item in enumerate(value)]
        if schema.get('uniqueItems') and len(set(clean)) != len(clean):
            raise InvalidTheme(f'{path}: las familias no se pueden repetir.')
        return clean
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
                requirement = '#RRGGBB' if schema['pattern'].startswith('^#') else 'una familia con el patrón ^[A-Z][A-Za-z0-9 ]{1,39}$'
                raise InvalidTheme(f'{path} debe ser {requirement}.')
            if schema['pattern'].startswith('^#'):
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
    typography = clean['fundamentos']['tipografia']
    rules = SCHEMA['properties']['fundamentos']['properties']['tipografia']['properties']
    for role in ('display', 'cuerpo'):
        if typography[role] not in rules[role]['anyOf'][0]['enum'] + typography['fuentes']:
            raise InvalidTheme(f'tema.fundamentos.tipografia.{role}: elige una familia de la lista fija o declárala en tipografia.fuentes.')
    # Las fotos redondean según fundamentos.imagenes.radio; forma.imagen (factor sobre 16 px) se deriva de él.
    clean['fundamentos']['forma']['imagen'] = round(clean['fundamentos']['imagenes']['radio'] / 16, 4)
    colors = clean['fundamentos']['colores']
    original = defaults()['fundamentos']['colores']
    # S1 conserva sus derivados exactos; una paleta nueva mezcla el acento sobre las tarjetas.
    if any(colors[k] != original[k] for k in ('acento', 'fondo', 'superficie')):
        colors['acentoTinta'] = ink_for(colors['acento'])
        colors['acentoSuave'] = _mix(colors['acento'], colors['superficie'])
    else:
        for key in ('acentoTinta', 'acentoSuave'):
            colors[key] = original[key]
    pairs = [('tintaFondo', 'fondo'), ('tinta', 'superficie'), ('tintaSuave', 'superficie'),
             ('tinta', 'acentoSuave'), ('acentoTinta', 'acento')]
    for ink, surface in pairs:
        ratio = contrast(colors[ink], colors[surface])
        if ratio < 4.5:
            raise InvalidTheme(f'{ink} sobre {surface}: {ratio:.2f}:1; mínimo 4.5:1.')
    return clean


def check_google_fonts(theme: dict) -> None:
    """Comprueba las familias globales al preparar; las lecturas del menú nunca dependen de la red."""
    for family in theme['fundamentos']['tipografia']['fuentes']:
        try:
            # Sin redirecciones ni descarga del cuerpo: solo vale el 200 del origen de Google Fonts.
            with requests.get(GOOGLE_FONTS_URL, params={'family': family}, timeout=GOOGLE_FONTS_TIMEOUT,
                              allow_redirects=False, stream=True) as response:
                status = response.status_code
        except requests.RequestException as exc:
            raise InvalidTheme(f'No se pudo comprobar «{family}» en Google Fonts por un problema de red o tiempo de espera. '
                               'No se preparó el borrador; vuelve a intentarlo con conexión.') from exc
        if status != 200:
            raise InvalidTheme(f'Google Fonts no confirmó la familia «{family}» (HTTP {status}; se requiere 200). '
                               'Revisa el nombre exacto y vuelve a preparar.')


def from_tokens(tokens: dict) -> dict:
    theme = defaults()
    foundation = theme['fundamentos']
    foundation['colores'].update({k: tokens[k] for k in foundation['colores'] if k in tokens})
    foundation['colores']['tintaFondo'] = tokens.get('tintaFondo', tokens['tinta'])
    foundation['tipografia'].update(display=tokens['displayFont'], cuerpo=tokens['cuerpoFont'])
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
    # El contrato anterior de tokens conserva sus claves; tintaFondo viaja en tema.fundamentos.colores.
    colors = {key: value for key, value in foundation['colores'].items() if key != 'tintaFondo'}
    return {**tokens, **colors, 'displayFont': foundation['tipografia']['display'],
            'cuerpoFont': foundation['tipografia']['cuerpo'], 'monoFont': foundation['tipografia']['cuerpo']}
