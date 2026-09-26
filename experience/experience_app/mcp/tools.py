"""Herramientas del MCP de Waiter (v1: diseño del menú y banners).

Toda herramienta recibe la clave ya autenticada y trabaja sobre SU sede. Las que cambian algo nunca guardan: validan con
las mismas reglas que el POS y dejan un cambio pendiente (McpPendingChange) con su vista previa. Solo
`confirmar_cambio`, con el token que devolvió la preparación, lo aplica. Así la IA propone y una persona decide.
"""
import uuid
from copy import deepcopy
from datetime import timedelta

from django.utils import timezone

from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import Tenant, resolve
from experience_app.diseno import borradores, plantillas
from experience_app.diseno import services as design
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


# ---- sistema de diseño (J4) --------------------------------------------------------------------------------------
def _arguments(args, allowed, required=()):
    if set(args) - set(allowed):
        raise ToolError(f'Argumento desconocido: {sorted(set(args) - set(allowed))[0]}.')
    if set(required) - set(args):
        raise ToolError(f'Falta el argumento {sorted(set(required) - set(args))[0]}.')


def leer_design_system(key: McpKey, args: dict) -> dict:
    _arguments(args, ())
    return {'esquema': deepcopy(design.SCHEMA), 'inventario': deepcopy(design.INVENTORY),
            'tema': templates.settings_view(key.restaurant_slug, key.venue_slug)['tema'],
            'pagina': borradores.design_system_url(key.restaurant_slug, key.venue_slug),
            'plantillas': plantillas.contract(),
            'reglas': ['Cambia solo los campos del esquema. Los colores derivados son de solo lectura.',
                       'preparar_tema mezcla los campos enviados con el tema guardado; restablecer_tema prepara los valores por defecto.',
                       'El borrador caduca a los 30 minutos. Revisa el enlace antes de confirmar_cambio.',
                       'pagina muestra todos los componentes y variantes con el tema publicado; url_design_system de un borrador los muestra con ese borrador.',
                       'plantillas: cada componente plantillable tiene datos, ranuras y una plantilla de fábrica. Para rediseñarlo envía tema.componentes.<id> = {"version": N, "html": "…"} a preparar_tema; null vuelve a la de fábrica. Solo etiquetas y clases ds-* del catálogo; los datos obligatorios y las ranuras obligatorias deben estar.']}


def describir_pantalla(key: McpKey, args: dict) -> dict:
    _arguments(args, ('pantalla',), ('pantalla',))
    name = args['pantalla']
    screens = design.INVENTORY['pantallas']
    if not isinstance(name, str) or name not in screens:
        raise ToolError(f'Pantalla desconocida. Elige una de: {", ".join(screens)}.')
    components = {c['id']: c for c in design.INVENTORY['componentes']}
    theme = templates.settings_view(key.restaurant_slug, key.venue_slug)['tema']
    sections = []
    for component_id in screens[name]:
        component = deepcopy(components[component_id])
        component['opciones'] = {field: deepcopy(design.INVENTORY['variantes'][field]) for field in component['variantes']}
        sections.append(component)
    return {'pantalla': name, 'secciones': sections, 'tema': theme,
            'nota': 'Las secciones siguen el orden del inventario. El tema es global; no se admite HTML ni CSS libre.'}


def _prepare_theme(key, theme, current):
    try:
        change = borradores.create(_tenant(key), theme, key=key, before=current)
    except design.InvalidTheme as exc:
        raise ToolError(str(exc)) from exc
    return {**borradores.result(change), 'token': str(change.id),
            'siguiente': 'Muestra el enlace y los cambios a la persona (url abre la carta; url_design_system, todos los componentes). Solo tras su aprobación llama confirmar_cambio con token.'}


def _component_id(args) -> str:
    component_id = args['componente']
    if not isinstance(component_id, str):
        raise ToolError('componente debe ser texto.')
    try:
        plantillas.component(component_id)
    except plantillas.InvalidTemplate as exc:
        raise ToolError(str(exc)) from exc
    return component_id


def leer_componente(key: McpKey, args: dict) -> dict:
    _arguments(args, ('componente',), ('componente',))
    component_id = _component_id(args)
    data = plantillas.contract()
    contract = data['componentes'][component_id]
    saved = templates.settings_view(key.restaurant_slug, key.venue_slug)['tema'].get('componentes', {}).get(component_id)
    current = ({'origen': 'propia', 'version': saved['version'], 'html': plantillas.to_html(saved['arbol'])} if saved
               else {'origen': 'fabrica', 'version': contract['version'], 'html': contract['plantilla_fabrica']['html']})
    return {'componente': component_id, 'contrato': contract, 'plantilla_actual': current,
            'utilidades': data['utilidades'], 'decoraciones': data['decoraciones'], 'limites': data['limites'],
            'reglas': ['Solo las etiquetas y clases del catálogo; nada de style, script, enlaces ni imágenes propias.',
                       'Los datos obligatorios y las ranuras obligatorias deben aparecer; las ranuras son las acciones y medios reales.',
                       'Parte de plantilla_actual.html, cambia la estructura y envíala a preparar_componente. html null vuelve a la de fábrica.',
                       'Después de preparar, llama verificar_borrador con el token borrador antes de confirmar_cambio.']}


def preparar_componente(key: McpKey, args: dict) -> dict:
    _arguments(args, ('componente', 'html'), ('componente', 'html'))
    component_id, html = _component_id(args), args['html']
    contract = plantillas.component(component_id)
    if html is not None and not isinstance(html, str):
        raise ToolError('html debe ser texto con la plantilla, o null para volver a la de fábrica.')
    current = templates.settings_view(key.restaurant_slug, key.venue_slug)['tema']
    patch = {'componentes': {component_id: None if html is None else {'version': contract['version'], 'html': html}}}
    try:
        theme = borradores.merge(current, patch)
    except design.InvalidTheme as exc:
        raise ToolError(str(exc)) from exc
    result = _prepare_theme(key, theme, current)
    saved = theme['componentes'][component_id]
    result['advertencias'] = plantillas.warnings(component_id, saved['arbol']) if saved else []
    result['siguiente'] = ('Abre url y url_design_system, llama verificar_borrador con borrador para medir desbordes y solapes, '
                           'corrige lo que salga y solo con la aprobación de la persona llama confirmar_cambio con token.'
                           if saved else 'Vuelve a la plantilla de fábrica: no hay nada que medir. Con la aprobación de la persona llama confirmar_cambio con token.')
    return result


def verificar_borrador(key: McpKey, args: dict) -> dict:
    _arguments(args, ('borrador',), ('borrador',))
    token = args['borrador']
    change = McpPendingChange.objects.filter(key=key, preview_token=token, applied_at__isnull=True).first() if isinstance(token, str) and _is_uuid(token) else None
    if change is None:
        raise ToolError('No hay un borrador vigente con ese token para esta clave.')
    try:
        result = borradores.verify(change)
    except borradores.InvalidDraft as exc:
        raise ToolError(str(exc)) from exc
    following = {'ok': 'Muestra el resultado a la persona; con su aprobación, confirmar_cambio con el token de confirmación.',
                 'problemas': 'Corrige los problemas y prepara de nuevo.',
                 'error': 'La verificación no pudo medir: no es culpa de la plantilla. Avísale a la persona y vuelve a intentarlo más tarde.',
                 'no_disponible': 'Revisa el borrador a ojo con la persona en url y url_design_system.'}
    return {**result, 'borrador': token, 'siguiente': following[result['estado']]}


def preparar_tema(key: McpKey, args: dict) -> dict:
    _arguments(args, ('tema',), ('tema',))
    patch = args['tema']
    if not isinstance(patch, dict) or not patch:
        raise ToolError('tema debe ser un objeto no vacío con los campos que quieres cambiar.')
    current = templates.settings_view(key.restaurant_slug, key.venue_slug)['tema']
    try:
        theme = borradores.merge(current, patch)
    except design.InvalidTheme as exc:
        raise ToolError(str(exc)) from exc
    return _prepare_theme(key, theme, current)


def restablecer_tema(key: McpKey, args: dict) -> dict:
    _arguments(args, ('capa',))
    layer = args.get('capa', 'todo')
    if layer not in ('todo', *borradores.LAYERS):
        raise ToolError('capa debe ser todo, fundamentos, variantes, distribucion o componentes.')
    current = templates.settings_view(key.restaurant_slug, key.venue_slug)['tema']
    theme = design.defaults() if layer == 'todo' else {**current, layer: design.defaults()[layer]}
    return _prepare_theme(key, theme, current)


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
        _, palette, typography, _ = templates.prepare(key.restaurant_slug, key.venue_slug, body)
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
        row.setdefault('subtitle', '')
        row.setdefault('button', '')
        row.setdefault('active', True)
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
    if change.kind == 'theme':
        try:
            borradores.confirm(key, token)
        except (borradores.InvalidDraft, templates.InvalidSettings) as exc:
            raise ToolError(str(exc)) from exc
        return {'aplicado': 'theme', 'mensaje': 'Tema guardado. El comensal lo verá al recargar la carta.'}
    tenant = _tenant(key)
    if change.kind == 'design':
        payload = dict(change.payload)
        greeting = payload.pop('saludo', None)
        templates.save(key.restaurant_slug, key.venue_slug, payload)
        if greeting is not None:
            _odoo(tenant, 'res.company', 'write_brand', [{'brand_greeting': greeting}])
            brand.invalidate(key.restaurant_slug, key.venue_slug)
        templates.invalidate(key.restaurant_slug, key.venue_slug)
    elif change.kind == 'banners':
        _odoo(tenant, 'pos.config', 'waiter_banner_settings_integration', [[tenant.odoo.pos_config_id], change.payload['banners']],
              {'dry_run': False, 'actor': f'MCP {key.prefix}'})
    else:
        raise ToolError('Este cambio no se puede confirmar por MCP.')
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
    {'name': 'leer_design_system', 'handler': leer_design_system, 'annotations': {'readOnlyHint': True},
     'description': 'Lee el esquema versionado, inventario de componentes y pantallas, y tema actual de esta sede. Empieza aquí antes de diseñar.',
     'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}},
    {'name': 'describir_pantalla', 'handler': describir_pantalla, 'annotations': {'readOnlyHint': True},
     'description': 'Describe una pantalla: secciones en orden, componentes, fundamentos y variantes disponibles, con el tema actual.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['pantalla'],
                     'properties': {'pantalla': {'type': 'string', 'enum': list(design.INVENTORY['pantallas'])}}}},
    {'name': 'preparar_tema', 'handler': preparar_tema,
     'description': 'Mezcla cambios parciales del tema con lo guardado, valida y prepara un borrador de 30 minutos. Devuelve cambios, enlace y token; NO publica.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['tema'],
                     'properties': {'tema': design.public_schema()}}},
    {'name': 'restablecer_tema', 'handler': restablecer_tema,
     'description': 'Prepara volver todo el tema o una capa a sus valores predeterminados. Devuelve un borrador; NO publica hasta confirmar_cambio.',
     'inputSchema': {'type': 'object', 'additionalProperties': False,
                     'properties': {'capa': {'type': 'string', 'enum': ['todo', *borradores.LAYERS], 'default': 'todo'}}}},
    {'name': 'leer_componente', 'handler': leer_componente, 'annotations': {'readOnlyHint': True},
     'description': 'Lee el contrato de un componente plantillable (datos, ranuras, límites), su plantilla actual en HTML, las utilidades ds-* y las decoraciones. Empieza aquí antes de rediseñarlo.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['componente'],
                     'properties': {'componente': {'type': 'string', 'enum': list(plantillas.COMPONENTS['componentes'])}}}},
    {'name': 'preparar_componente', 'handler': preparar_componente,
     'description': 'Prepara una plantilla HTML restringida para un componente (html; null para volver a la de fábrica): valida, avisa de medidas y deja un borrador de 30 minutos. NO publica.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['componente', 'html'],
                     'properties': {'componente': {'type': 'string', 'enum': list(plantillas.COMPONENTS['componentes'])},
                                    'html': {'type': ['string', 'null'], 'maxLength': 20000}}}},
    {'name': 'verificar_borrador', 'handler': verificar_borrador,
     'description': 'Abre la carta con el borrador en un navegador a 320, 375 y 1024 px y mide en las tarjetas con plantilla propia (hasta 12) desbordes, solapes, palabras partidas, textos < 14 px y controles < 44 px. Devuelve problemas concretos; una plantilla propia solo se confirma con la última verificación en verde.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['borrador'], 'properties': {'borrador': {'type': 'string'}}}},
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
     'description': 'Aplica un cambio preparado (tema, diseño o banners) con el token de confirmación. Úsalo solo cuando la persona haya aprobado la vista previa.',
     'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['token'], 'properties': {'token': {'type': 'string'}}},
     'annotations': {'destructiveHint': True}},
]
TOOLS_BY_NAME = {t['name']: t for t in TOOLS}
