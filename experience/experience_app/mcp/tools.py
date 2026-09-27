"""Herramientas del MCP de Waiter (v1: diseño del menú y banners).

Toda herramienta recibe la clave ya autenticada y trabaja sobre SU sede. Las que cambian algo nunca guardan: validan con
las mismas reglas que el POS y dejan un cambio pendiente (McpPendingChange) con su vista previa. Solo
`confirmar_cambio`, con el token que devolvió la preparación, lo aplica. Así la IA propone y una persona decide.
"""
import uuid
from datetime import timedelta

from django.utils import timezone

from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import Tenant, resolve
from experience_app.mcp.models import McpKey, McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.plantillas.defaults import DEFAULT_CODE
from experience_app.services import brand

CHANGE_TTL = timedelta(minutes=30)
GREETING_MAX = 40
BANNER_FIELDS = ('layout', 'title', 'subtitle', 'button', 'target', 'targetId', 'theme', 'active')
COLOR_ROLES = {'acento': 'botones y color de acción', 'tintaTerciaria': 'textos secundarios y etiquetas', 'fondo': 'fondo del menú',
               'superficie': 'tarjetas de los platos', 'tinta': 'texto principal'}


class ToolError(Exception):
    """Error que la IA debe leer y corregir (dato inválido, algo que no existe). Llega como resultado con isError."""


# ---- acceso a la sede ---------------------------------------------------------------------------------------------
def _tenant(key: McpKey) -> Tenant:
    return resolve(key.restaurant_slug, key.venue_slug)


def _odoo(tenant: Tenant, model: str, method: str, args: list, kwargs: dict | None = None):
    try:
        return OdooClient(tenant.odoo).call_kw(model, method, args, kwargs)
    except OdooError as exc:
        raise ToolError(f'Odoo rechazó la operación: {exc}') from exc


def _banners(tenant: Tenant) -> list[dict]:
    return _odoo(tenant, 'pos.config', 'waiter_banner_settings', [[tenant.odoo.pos_config_id]]).get('banners', [])


def _pending(key: McpKey, kind: str, payload: dict) -> str:
    McpPendingChange.objects.filter(key=key, applied_at__isnull=True, created_at__lt=timezone.now() - CHANGE_TTL).delete()
    return str(McpPendingChange.objects.create(key=key, kind=kind, payload=payload).id)


# ---- diseño del menú ----------------------------------------------------------------------------------------------
def leer_diseno_menu(key: McpKey, args: dict) -> dict:
    tenant = _tenant(key)
    current = templates.settings_view(key.restaurant_slug, key.venue_slug)
    resolved = templates.resolve_template(tenant)
    template = templates.default_template()
    if template is None:
        raise ToolError('El catálogo de plantillas no está cargado en este servidor.')
    spec = template.spec
    company = brand.get_company_brand(tenant)
    editable = spec.get('personalizable', {}).get('colores', [])
    return {
        'restaurante': tenant.restaurant_name,
        'colores': {c: {'actual': resolved['tokens'].get(c), 'personalizado': c in current['paleta'], 'uso': COLOR_ROLES.get(c, '')} for c in editable},
        'tipografia': {'actual': resolved['tokens'].get('displayFont'), 'personalizada': bool(current['tipografia']),
                       'permitidas': sorted(set(templates.MENU_FONTS) | {spec['tokens'].get('displayFont')})},
        'saludo': {'actual': (company and company.greeting) or '', 'maximo': GREETING_MAX,
                   'nota': 'Vacío = saludo automático según la hora (Buenos días / Buenas tardes / Buenas noches).'},
        'logo': {'tiene': bool(company and company.has_logo), 'nota': 'El logo se sube desde el POS (Configuración › Diseño del menú).'},
        'reglas': [f'Colores en #RRGGBB. El acento necesita contraste de al menos {templates.MIN_CONTRAST}:1 con su texto, '
                   f'y la tinta con el fondo y con las tarjetas también.',
                   'Para volver un color al de la plantilla, pásalo como null.'],
    }


def preparar_diseno_menu(key: McpKey, args: dict) -> dict:
    colors, font, greeting = args.get('colores'), args.get('tipografia'), args.get('saludo')
    if colors is None and font is None and greeting is None:
        raise ToolError('No hay nada que cambiar: pasa colores, tipografia o saludo.')
    current = templates.settings_view(key.restaurant_slug, key.venue_slug)
    palette = dict(current['paleta'])
    if colors is not None:
        if not isinstance(colors, dict):
            raise ToolError('colores debe ser un objeto {nombre: "#RRGGBB" | null}.')
        for name, value in colors.items():
            if value is None:
                palette.pop(name, None)
            else:
                palette[name] = value
    typography = dict(current['tipografia'])
    if font is not None:
        typography = {'display': font} if font else {}
    body = {'plantilla': DEFAULT_CODE, 'paleta': palette, 'tipografia': typography}
    try:
        _, palette, typography = templates.validate(body)
    except templates.InvalidSettings as exc:
        raise ToolError(str(exc)) from exc
    payload = {'plantilla': DEFAULT_CODE, 'paleta': palette, 'tipografia': typography}
    before = leer_diseno_menu(key, {})
    preview = {'colores': {c: {'antes': v['actual'], 'despues': palette.get(c) or '(el de la plantilla)'}
                           for c, v in before['colores'].items() if (palette.get(c) or None) != (current['paleta'].get(c) or None)},
               'tipografia': {'antes': before['tipografia']['actual'], 'despues': typography.get('display') or '(la de la plantilla)'}
               if typography != current['tipografia'] else None}
    if greeting is not None:
        if not isinstance(greeting, str) or len(greeting.strip()) > GREETING_MAX:
            raise ToolError(f'El saludo debe ser texto de hasta {GREETING_MAX} caracteres.')
        payload['saludo'] = greeting.strip()
        preview['saludo'] = {'antes': before['saludo']['actual'], 'despues': payload['saludo'] or '(automático según la hora)'}
    return {'token': _pending(key, 'design', payload), 'vista_previa': {k: v for k, v in preview.items() if v},
            'siguiente': 'Muestra la vista previa a la persona y, si la aprueba, llama confirmar_cambio con este token.'}


# ---- banners ------------------------------------------------------------------------------------------------------
def leer_banners(key: McpKey, args: dict) -> dict:
    rows = _banners(_tenant(key))
    return {'banners': [{**{f: b.get(f) for f in BANNER_FIELDS}, 'posicion': i, 'tiene_imagen': bool(b.get('image'))} for i, b in enumerate(rows)],
            'limites': {'maximo': 8, 'title': 80, 'subtitle': 160, 'button': 35},
            'valores': {'layout': ['product', 'promotion', 'category', 'image', 'notice'], 'target': ['product', 'category', 'none'],
                        'theme': ['violet', 'amber', 'dark']},
            'nota': 'targetId es el id de product.product (target=product) o de pos.category (target=category); '
                    'búscalos con listar_catalogo. Las imágenes se suben desde el POS; para conservar la de un banner '
                    'existente pasa imagen_de_banner con su posición.'}


def preparar_banners(key: McpKey, args: dict) -> dict:
    wanted = args.get('banners')
    if not isinstance(wanted, list):
        raise ToolError('banners debe ser la lista completa de banners (reemplaza a los actuales).')
    tenant = _tenant(key)
    current = _banners(tenant)
    rows = []
    for i, item in enumerate(wanted):
        if not isinstance(item, dict):
            raise ToolError(f'El banner {i + 1} no es un objeto.')
        row = {f: item[f] for f in BANNER_FIELDS if f in item}
        row.setdefault('subtitle', ''); row.setdefault('button', ''); row.setdefault('active', True)
        source = item.get('imagen_de_banner')
        if source is not None:
            if type(source) is not int or not 0 <= source < len(current):
                raise ToolError(f'El banner {i + 1} pide la imagen de un banner que no existe ({source}).')
            row['image'] = current[source].get('image') or ''
        else:
            row['image'] = ''
        rows.append(row)
    # Odoo valida con las mismas reglas del POS (textos, destino en el catálogo, imagen) sin guardar.
    clean = _odoo(tenant, 'pos.config', 'waiter_banner_settings_integration', [[tenant.odoo.pos_config_id], rows],
                  {'dry_run': True, 'actor': f'MCP {key.prefix}'})['banners']
    preview = [{'titulo': b['title'], 'diseno': b['layout'], 'destino': b['target'], 'visible': b['active'],
                'con_imagen': bool(b.get('image'))} for b in clean]
    return {'token': _pending(key, 'banners', {'banners': clean}), 'vista_previa': {'antes': len(current), 'despues': preview},
            'siguiente': 'Muestra la vista previa a la persona y, si la aprueba, llama confirmar_cambio con este token.'}


def listar_catalogo(key: McpKey, args: dict) -> dict:
    tenant = _tenant(key)
    products = _odoo(tenant, 'product.product', 'search_read', [[['available_in_pos', '=', True], ['sale_ok', '=', True]],
                                                                  ['name', 'lst_price', 'pos_categ_ids']], {'order': 'name'})
    categories = _odoo(tenant, 'pos.category', 'search_read', [[], ['name']], {'order': 'sequence, name'})
    return {'productos': [{'id': p['id'], 'nombre': p['name'], 'precio': p['lst_price'], 'categorias': p['pos_categ_ids']} for p in products],
            'categorias': [{'id': c['id'], 'nombre': c['name']} for c in categories]}


# ---- confirmar ----------------------------------------------------------------------------------------------------
def confirmar_cambio(key: McpKey, args: dict) -> dict:
    token = args.get('token')
    change = McpPendingChange.objects.filter(key=key, id=token).first() if isinstance(token, str) and _is_uuid(token) else None
    if change is None:
        raise ToolError('No hay un cambio preparado con ese token para esta clave.')
    if change.applied_at is not None:
        raise ToolError('Ese cambio ya se aplicó.')
    if timezone.now() - change.created_at > CHANGE_TTL:
        raise ToolError('El cambio caducó (30 minutos). Vuelve a prepararlo.')
    tenant = _tenant(key)
    if change.kind == 'design':
        payload = dict(change.payload)
        greeting = payload.pop('saludo', None)
        templates.save(key.restaurant_slug, key.venue_slug, payload)
        if greeting is not None:
            _odoo(tenant, 'res.company', 'write_brand', [{'brand_greeting': greeting}])
            brand.invalidate(key.restaurant_slug, key.venue_slug)
        templates.invalidate(key.restaurant_slug, key.venue_slug)
    else:
        _odoo(tenant, 'pos.config', 'waiter_banner_settings_integration', [[tenant.odoo.pos_config_id], change.payload['banners']],
              {'dry_run': False, 'actor': f'MCP {key.prefix}'})
    McpPendingChange.objects.filter(pk=change.pk).update(applied_at=timezone.now())
    return {'aplicado': change.kind, 'mensaje': 'Guardado. El comensal lo verá al recargar la carta.'}


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


# ---- catálogo de herramientas (tools/list) ------------------------------------------------------------------------
_COLOR = {'type': ['string', 'null'], 'pattern': '^#[0-9A-Fa-f]{6}$'}
TOOLS = [
    {'name': 'leer_diseno_menu', 'handler': leer_diseno_menu, 'annotations': {'readOnlyHint': True},
     'description': 'Lee el diseño del menú del restaurante: colores editables (con su uso), tipografía y las permitidas, saludo, logo y reglas de contraste.',
     'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}},
    {'name': 'preparar_diseno_menu', 'handler': preparar_diseno_menu,
     'description': 'Prepara un cambio del diseño del menú (colores, tipografía de títulos, saludo) y devuelve una vista previa y un token. '
                    'NO guarda: hay que llamar confirmar_cambio con el token después de que la persona apruebe.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'properties': {
         'colores': {'type': 'object', 'description': 'Solo los colores a cambiar. null vuelve al de la plantilla.',
                     'properties': {c: {**_COLOR, 'description': u} for c, u in COLOR_ROLES.items()}, 'additionalProperties': False},
         'tipografia': {'type': 'string', 'description': 'Tipografía de títulos (de la lista permitida). Vacío vuelve a la de la plantilla.'},
         'saludo': {'type': 'string', 'maxLength': GREETING_MAX, 'description': 'Saludo de la cabecera del menú. Vacío = automático según la hora.'}}}},
    {'name': 'leer_banners', 'handler': leer_banners, 'annotations': {'readOnlyHint': True},
     'description': 'Lee los banners del carrusel del menú (hasta 8), con los valores permitidos y los límites de texto.',
     'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}},
    {'name': 'preparar_banners', 'handler': preparar_banners,
     'description': 'Prepara la lista COMPLETA de banners (reemplaza la actual) y devuelve una vista previa y un token. NO guarda: '
                    'hay que llamar confirmar_cambio con el token después de que la persona apruebe.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['banners'], 'properties': {
         'banners': {'type': 'array', 'maxItems': 8, 'items': {'type': 'object', 'additionalProperties': False,
                                                                  'required': ['layout', 'title', 'target', 'theme'], 'properties': {
             'layout': {'type': 'string', 'enum': ['product', 'promotion', 'category', 'image', 'notice'], 'description': 'product: plato o combo destacado; promotion; category; notice: anuncio sencillo; image: flyer de imagen completa (solo conservando una imagen existente con imagen_de_banner; las imágenes nuevas se suben desde el POS).'},
             'title': {'type': 'string', 'maxLength': 80}, 'subtitle': {'type': 'string', 'maxLength': 160},
             'button': {'type': 'string', 'maxLength': 35, 'description': 'Texto del botón.'},
             'target': {'type': 'string', 'enum': ['product', 'category', 'none']},
             'targetId': {'type': ['integer', 'null'], 'description': 'id de listar_catalogo (producto o categoría).'},
             'theme': {'type': 'string', 'enum': ['violet', 'amber', 'dark']},
             'active': {'type': 'boolean'},
             'imagen_de_banner': {'type': 'integer', 'description': 'Conserva la imagen del banner actual en esa posición.'}}}}}}},
    {'name': 'listar_catalogo', 'handler': listar_catalogo, 'annotations': {'readOnlyHint': True},
     'description': 'Lista los productos y categorías de la carta, con sus ids, para usarlos como destino de los banners.',
     'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}},
    {'name': 'confirmar_cambio', 'handler': confirmar_cambio,
     'description': 'Aplica un cambio preparado (diseño o banners) con el token que devolvió la preparación. Úsalo solo cuando la persona haya aprobado la vista previa.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['token'], 'properties': {'token': {'type': 'string'}}},
     'annotations': {'destructiveHint': True}},
]
TOOLS_BY_NAME = {t['name']: t for t in TOOLS}
