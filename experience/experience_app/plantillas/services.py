"""La plantilla que ve el comensal (Contrato 3 del Plan H) y los ajustes por sede que la producen.

Precedencia de los tokens, de menor a mayor:

    spec.tokens (el diseño)  ←  marca del Plan G (acento = color, displayFont = tipografía, radios = redondeo)
                             ←  paleta y tipografía de la sede (solo los tokens que `personalizable` permite)

Cuando el acento final no es el del diseño se recalculan `acentoTinta` (utils/brand.ink_for, contraste ≥ 4.5) y
`acentoSuave` (10 % del acento sobre el fondo de la plantilla; sobre blanco coincide con utils/brand.soft_for).

La plantilla resuelta se cachea TEMPLATE_CACHE_SECONDS (60 s por defecto) por sede y se invalida al guardar desde el POS
y con el aviso interno de "algo cambió en Odoo" (views/internal.py). Sin ajustes de sede se resuelve `S1`; con el catálogo
vacío, el spec embebido (defaults.FALLBACK_SPEC). En S1, el tema v2 añade los fundamentos y resuelve colores y fuentes;
los campos paleta/tipografia se conservan para el POS y el MCP anteriores.
"""
import re
from copy import deepcopy

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.urls import reverse
from django.utils import timezone

from experience_app.adapters.registry.client import Tenant
from experience_app.diseno import plantillas as component_templates
from experience_app.diseno import services as design
from experience_app.plantillas.defaults import (
    DEFAULT_CODE,
    FALLBACK_SPEC,
    LAYOUT_SCREENS,
    PATTERN_SCREENS,
    SCREENS,
)
from experience_app.plantillas.models import MenuTemplate, VenueMenuSettings
from experience_app.plantillas.seed import thumbnail_path
from experience_app.services import brand, discount
from experience_app.utils.brand import FONTS, RADII, contrast, ink_for

COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')
MIN_CONTRAST = 4.5
MENU_FONTS = [*FONTS, 'Mulish', 'DM Sans', 'Nunito Sans', 'Lato']
# Un radio de 100 px o más es una píldora (999 en los specs): no se escala con el redondeo de la marca.
PILL_RADIUS = 100
# Claves del spec que no salen en el catálogo público: son notas para quien implementa el layout, no datos del comensal.
PRIVATE_SCREEN_KEYS = ('resumen', 'estructura', 'motivo', 'reconstruido')


class InvalidSettings(Exception):
    """El PUT interno trae algo que el catálogo no admite; el mensaje va tal cual al POS (en español)."""


def _key(restaurant: str, venue: str) -> str:
    return f'template:v2:{restaurant}/{venue}'


def invalidate(restaurant: str, venue: str) -> None:
    cache.delete(_key(restaurant, venue))


# ---- catálogo -----------------------------------------------------------------------------------------------------
def default_template() -> MenuTemplate | None:
    return MenuTemplate.objects.filter(code=DEFAULT_CODE).first()


def default_code() -> str:
    template = default_template()
    return template.code if template else DEFAULT_CODE


def thumbnail_url(code: str) -> str | None:
    return reverse('template-thumbnail', args=[code]) if thumbnail_path(code) else None


def public_spec(template: MenuTemplate) -> dict:
    spec = deepcopy(template.spec)
    spec['pantallas'] = {screen: {k: v for k, v in data.items() if k not in PRIVATE_SCREEN_KEYS}
                         for screen, data in spec.get('pantallas', {}).items()}
    spec['miniatura'] = thumbnail_url(template.code)
    return spec


def catalog_view() -> dict:
    templates = list(MenuTemplate.objects.filter(code=DEFAULT_CODE))
    families = {t.family: t.spec.get('familiaNombre', 'Smart Menu') for t in templates}
    return {'familias': families, 'plantillas': [public_spec(t) for t in templates]}


# ---- tokens finales -----------------------------------------------------------------------------------------------
def _mix_over(accent: str, background: str, amount: float = 0.10) -> str:
    def channel(i):
        a, b = int(accent[i:i + 2], 16), int(background[i:i + 2], 16)
        return round(b + (a - b) * amount)
    return '#' + ''.join(f'{channel(i):02X}' for i in (1, 3, 5))


def _scaled_radii(tokens: dict, radius: int) -> dict:
    """El redondeo de la marca fija la tarjeta; botón y chip conservan la proporción del diseño (las píldoras no cambian)."""
    base = tokens.get('radioTarjeta') or 0
    out = {'radioTarjeta': radius}
    for key in ('radioBoton', 'radioChip'):
        value = tokens.get(key)
        if isinstance(value, int | float) and value < PILL_RADIUS:
            out[key] = round(value * radius / base) if base else radius
    return out


def final_tokens(spec: dict, brand_inputs: dict, palette: dict, typography: dict) -> dict:
    tokens = dict(spec['tokens'])
    customizable = spec.get('personalizable', {})
    color, font, radius = brand_inputs.get('color') or '', brand_inputs.get('fuente') or '', brand_inputs.get('radio')
    if spec['codigo'] != 'S1' and color and COLOR_RE.match(color):
        tokens['acento'] = color.upper()
    if spec['codigo'] != 'S1' and font in FONTS:
        tokens['displayFont'] = font
    if radius in RADII and spec['codigo'] != 'S1':
        tokens.update(_scaled_radii(tokens, radius))
    for key in customizable.get('colores', []):
        value = palette.get(key)
        if isinstance(value, str) and COLOR_RE.match(value):
            tokens[key] = value.upper()
    display = typography.get('display')
    if display and customizable.get('tipografiaDisplay', True):
        tokens['displayFont'] = display
    if tokens['acento'] != spec['tokens']['acento'] or 'acento' in palette or 'fondo' in palette:
        tokens['acentoTinta'] = ink_for(tokens['acento'])
        tokens['acentoSuave'] = _mix_over(tokens['acento'], tokens.get('fondo', '#FFFFFF'))
    if spec['codigo'] == 'S1' and display and display != spec['tokens']['displayFont']:
        tokens['cuerpoFont'] = tokens['displayFont']
        tokens['monoFont'] = tokens['displayFont']
    return tokens


def _google_fonts(spec: dict, tokens: dict) -> list[str]:
    fonts = list(spec.get('fuentesGoogle', []))
    designed, final = spec['tokens'].get('displayFont'), tokens.get('displayFont')
    if final != designed:
        fonts = [f for f in fonts if f != designed]
        if final in FONTS and final not in fonts:
            fonts.append(final)
    return fonts


def _layouts(spec: dict) -> dict:
    screens = spec.get('pantallas', {})
    layouts = {screen: screens.get(screen, {}).get('layout') for screen in LAYOUT_SCREENS}
    layouts.update({screen: screens.get(screen, {}).get('patron') for screen in PATTERN_SCREENS})
    return {screen: layouts[screen] for screen in SCREENS}


def build(spec: dict, brand_inputs: dict, palette: dict, typography: dict, percent: float, theme=None) -> dict:
    tokens = final_tokens(spec, brand_inputs, palette, typography)
    resolved_theme = design.resolve(theme, tokens) if spec['codigo'] == DEFAULT_CODE else None
    if resolved_theme is not None:
        tokens = design.apply_to_tokens(resolved_theme, tokens)
    return {
        'codigo': spec['codigo'], 'nombre': spec['nombre'], 'familia': spec['familia'],
        'tokens': tokens, 'layouts': _layouts(spec), 'fotos': dict(spec.get('fotos', {})),
        'fuentesGoogle': list(dict.fromkeys([tokens['displayFont'], tokens['cuerpoFont'], tokens['monoFont']]))
        if resolved_theme is not None else _google_fonts(spec, tokens),
        'descuento': {'porcentaje': percent, 'activo': percent > 0},
        **({'tema': resolved_theme} if resolved_theme is not None else {}),
    }


# ---- resolución por sede ------------------------------------------------------------------------------------------
def get_settings(restaurant: str, venue: str) -> VenueMenuSettings | None:
    return VenueMenuSettings.objects.select_related('template').filter(restaurant_slug=restaurant, venue_slug=venue).first()


def _spec_for(restaurant: str, venue: str) -> tuple[dict, dict, dict]:
    chosen = get_settings(restaurant, venue)
    if chosen is not None and chosen.template_id == DEFAULT_CODE:
        return chosen.template.spec, chosen.palette or {}, chosen.typography or {}
    template = default_template()
    return (template.spec if template else FALLBACK_SPEC), {}, {}


def _resolve_template_sin_sede(tenant: Tenant) -> dict:
    """El dict `plantilla` del contexto de entrada, desde caché."""
    key = _key(tenant.restaurant_slug, tenant.venue_slug)
    cached = cache.get(key)
    if cached is not None:
        return cached
    chosen = get_settings(tenant.restaurant_slug, tenant.venue_slug)
    if chosen is not None and chosen.template_id == DEFAULT_CODE:
        spec, palette, typography, theme = chosen.template.spec, chosen.palette, chosen.typography, chosen.theme
    else:
        template = default_template()
        spec, palette, typography, theme = (template.spec if template else FALLBACK_SPEC), {}, {}, None
    resolved = build(spec, brand.brand_inputs(tenant), palette, typography, discount.percent_for(tenant), theme)
    cache.set(key, resolved, settings.TEMPLATE_CACHE_SECONDS)
    return resolved


def _settings_view_sin_sede(restaurant: str, venue: str) -> dict:
    """Los ajustes crudos (lo que el POS edita), no la plantilla resuelta."""
    chosen = get_settings(restaurant, venue)
    if chosen is None or chosen.template_id != DEFAULT_CODE:
        return {'plantilla': default_code(), 'paleta': {}, 'tipografia': {}, 'tema': design.defaults(),
                'actualizado': None, 'porDefecto': True}
    return {'plantilla': chosen.template_id, 'paleta': chosen.palette, 'tipografia': chosen.typography,
            'tema': design.resolve(chosen.theme, final_tokens(chosen.template.spec, {}, chosen.palette, chosen.typography)),
            'actualizado': chosen.updated_at.isoformat(), 'porDefecto': False}


# ---- validación y guardado (PUT interno) --------------------------------------------------------------------------
def validate(body: dict) -> tuple[MenuTemplate, dict, dict]:
    if not isinstance(body, dict):
        raise InvalidSettings('El cuerpo debe ser un objeto con plantilla, paleta y tipografia.')
    code = body.get('plantilla')
    template = MenuTemplate.objects.filter(code=code).first() if isinstance(code, str) else None
    if template is None or code != DEFAULT_CODE:
        raise InvalidSettings(f'La plantilla {code!r} no está en el catálogo.')
    if 'tema' in body:
        if 'paleta' in body or 'tipografia' in body:
            raise InvalidSettings('Envía tema o paleta/tipografia; no ambos contratos a la vez.')
        try:
            theme = design.validate(body['tema'])
        except design.InvalidTheme as exc:
            raise InvalidSettings(str(exc)) from exc
        foundation = theme['fundamentos']
        palette = {k: foundation['colores'][k] for k in template.spec['personalizable']['colores']}
        return template, palette, {'display': foundation['tipografia']['display']}
    spec = template.spec
    customizable = spec.get('personalizable', {})
    palette = body.get('paleta') or {}
    typography = body.get('tipografia') or {}
    if not isinstance(palette, dict) or not isinstance(typography, dict):
        raise InvalidSettings('paleta y tipografia deben ser objetos.')
    allowed = customizable.get('colores', [])
    for key, value in palette.items():
        if key not in allowed:
            raise InvalidSettings(f'El color «{key}» no se puede personalizar en la plantilla {template.code}.')
        if not isinstance(value, str) or not COLOR_RE.match(value):
            raise InvalidSettings(f'El color «{key}» debe ser #RRGGBB.')
    palette = {k: v.upper() for k, v in palette.items()}
    display = typography.get('display')
    if set(typography) - {'display'}:
        raise InvalidSettings('tipografia solo admite «display».')
    if display:
        if not customizable.get('tipografiaDisplay', True):
            raise InvalidSettings(f'La plantilla {template.code} no permite cambiar la tipografía de títulos.')
        if display not in MENU_FONTS and display != spec['tokens'].get('displayFont'):
            raise InvalidSettings(f'La tipografía «{display}» no está en la lista: {", ".join(FONTS)} o la de la plantilla.')
        typography = {'display': display}
    else:
        typography = {}
    tokens = {**spec['tokens'], **palette}
    accent = tokens['acento']
    ratio = contrast(accent, ink_for(accent))
    if ratio < MIN_CONTRAST:
        raise InvalidSettings(f'El color de acción {accent} no contrasta lo suficiente con su texto ({ratio:.2f}:1; mínimo {MIN_CONTRAST}:1).')
    if palette.keys() & {'tinta', 'fondo', 'superficie'}:
        ratio = contrast(tokens['tinta'], tokens['fondo'])
        if ratio < MIN_CONTRAST:
            raise InvalidSettings(f'La tinta {tokens["tinta"]} no se lee sobre el fondo {tokens["fondo"]} ({ratio:.2f}:1; mínimo {MIN_CONTRAST}:1).')
    if code == 'S1' and contrast(tokens['tinta'], tokens['superficie']) < MIN_CONTRAST:
        raise InvalidSettings('El texto no contrasta con el color de las tarjetas.')
    return template, palette, typography


def _prepare_sin_sede(restaurant: str, venue: str, body: dict, *, chosen=None) -> tuple[MenuTemplate, dict, dict, dict]:
    """Valida ambos contratos; el POS anterior conserva fundamentos que no sabe editar."""
    template, palette, typography = validate(body)
    if 'tema' in body:
        return template, palette, typography, design.validate(body['tema'])
    chosen = chosen if chosen is not None else get_settings(restaurant, venue)
    old_palette = chosen.palette if chosen and chosen.template_id == DEFAULT_CODE else {}
    old_typography = chosen.typography if chosen and chosen.template_id == DEFAULT_CODE else {}
    old_tokens = final_tokens(template.spec, {}, old_palette, old_typography)
    theme = design.resolve(chosen.theme if chosen and chosen.template_id == DEFAULT_CODE else None, old_tokens)
    foundation = theme['fundamentos']
    new_tokens = final_tokens(template.spec, {}, palette, typography)
    for color in template.spec['personalizable']['colores']:
        foundation['colores'][color] = new_tokens[color]
    foundation['tipografia']['display'] = new_tokens['displayFont']
    # Una fuente de cuerpo elegida por v2 es independiente; el contrato antiguo solo enlazaba ambas fuentes.
    if foundation['tipografia']['cuerpo'] == old_tokens['cuerpoFont']:
        foundation['tipografia']['cuerpo'] = new_tokens['cuerpoFont']
    try:
        theme = design.validate(theme)
    except design.InvalidTheme as exc:
        raise InvalidSettings(str(exc)) from exc
    return template, palette, typography, theme


@transaction.atomic
def save(restaurant: str, venue: str, body: dict) -> VenueMenuSettings:
    previous = VenueMenuSettings.objects.select_for_update().select_related('template').filter(
        restaurant_slug=restaurant, venue_slug=venue).first()
    template, palette, typography, theme = prepare(restaurant, venue, body, chosen=previous)
    chosen, _ = VenueMenuSettings.objects.update_or_create(
        restaurant_slug=restaurant, venue_slug=venue,
        defaults={'template': template, 'palette': palette, 'typography': typography, 'theme': theme})
    brand.invalidate(restaurant, venue)
    invalidate(restaurant, venue)
    # También al confirmar la transacción: una lectura concurrente podría haber repoblado la caché con datos viejos.
    transaction.on_commit(lambda: (brand.invalidate(restaurant, venue), invalidate(restaurant, venue)))
    return chosen


@transaction.atomic
def save_verified(restaurant: str, venue: str, body: dict) -> VenueMenuSettings:
    """Puerta del PUT: consume el borrador verificado y guarda su tema en la misma transacción."""
    from experience_app.diseno import borradores
    from experience_app.mcp.models import McpPendingChange

    if not settings.DESIGN_VERIFIER_REQUIRED:
        return save(restaurant, venue, body)
    try:
        # Mismo orden que confirmar por MCP: primero borrador, luego ajustes de la sede.
        change = borradores.get(restaurant, venue, body['borrador'], lock=True) if 'borrador' in body else None
        template, _, _, _ = prepare(restaurant, venue, body)
        # También bloquea la primera publicación, cuando aún no existían ajustes para esta sede.
        VenueMenuSettings.objects.get_or_create(restaurant_slug=restaurant, venue_slug=venue,
                                                defaults={'template': template})
        previous = VenueMenuSettings.objects.select_for_update().select_related('template').get(
            restaurant_slug=restaurant, venue_slug=venue)
        _, _, _, theme = prepare(restaurant, venue, body, chosen=previous)
        current = settings_view(restaurant, venue)['tema']
        if theme['componentes'] != current['componentes'] or change is not None:
            if change is None:
                raise InvalidSettings('Cambiar tema.componentes exige borrador: prepara y verifica ese tema antes de guardar.')
            borradores.require_verified(change)
            if change.payload['tema'] != theme:
                raise InvalidSettings('El tema no coincide con el borrador verificado. Prepara y verifica el tema que vas a guardar.')
            if not McpPendingChange.objects.filter(pk=change.pk, applied_at__isnull=True).update(applied_at=timezone.now()):
                raise InvalidSettings('Ese borrador ya fue aplicado.')
        return save(restaurant, venue, body)
    except borradores.InvalidDraft as exc:
        raise InvalidSettings(str(exc)) from exc


# Plan K4: las decoraciones de la sede solo existen para su propia sede. Estas envolturas fijan la sede en contexto
# para que el validador de plantillas (diseno/plantillas.py) las reconozca al resolver, leer y preparar el tema.
def resolve_template(tenant: Tenant) -> dict:
    from experience_app.services import rewards
    actions = rewards.actions(tenant)
    with component_templates.for_venue(tenant.restaurant_slug, tenant.venue_slug):
        return {**_resolve_template_sin_sede(tenant), 'acciones': actions}


def settings_view(restaurant: str, venue: str) -> dict:
    with component_templates.for_venue(restaurant, venue):
        return _settings_view_sin_sede(restaurant, venue)


def prepare(restaurant: str, venue: str, body: dict, *, chosen=None) -> tuple[MenuTemplate, dict, dict, dict]:
    with component_templates.for_venue(restaurant, venue):
        return _prepare_sin_sede(restaurant, venue, body, chosen=chosen)
