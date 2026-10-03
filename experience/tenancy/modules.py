"""Catálogo comercial y excepciones vigentes, sin borrar datos de operación."""
from contextvars import ContextVar
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .http import Problem, require

MODULES = {
    'nucleo': {'name': 'Núcleo', 'depends': [], 'units': {}},
    'salon': {'name': 'Salón', 'depends': ['nucleo'], 'units': {}},
    'cocina': {'name': 'Cocina', 'depends': ['nucleo'], 'units': {}},
    'inventario': {'name': 'Inventario', 'depends': ['nucleo'], 'units': {}},
    'facturacion': {'name': 'Facturación electrónica', 'depends': ['nucleo'], 'units': {'documento': 'Documento'}},
    'menu_comensal': {'name': 'Menú del comensal', 'depends': ['nucleo'], 'units': {}},
    'pagos_en_linea': {'name': 'Pagos en línea', 'depends': ['nucleo'], 'depends_any': ['menu_comensal', 'asistente_whatsapp'], 'units': {}},
    'datafono': {'name': 'Datáfono integrado', 'depends': ['nucleo'], 'units': {}},
    'fidelizacion': {'name': 'Fidelización', 'depends': ['menu_comensal'], 'units': {'codigo_verificacion': 'Código de verificación'}},
    'reservas': {'name': 'Reservas', 'depends': ['nucleo'], 'units': {}},
    'asistente_menu': {'name': 'Asistente en el menú', 'depends': ['menu_comensal'], 'units': {'mensaje_ia': 'Mensaje respondido', 'tokens_ia': 'Tokens de entrada y salida'}},
    'asistente_whatsapp': {'name': 'Asistente de WhatsApp', 'depends': ['nucleo', 'pagos_en_linea'], 'units': {'pedido_asistente': 'Pedido del asistente', 'conversacion_sin_compra': 'Conversación sin compra', 'mensaje_meta': 'Mensaje de Meta', 'tokens_ia': 'Tokens de entrada y salida'}},
    'multisucursal': {'name': 'Varios locales', 'depends': ['nucleo'], 'units': {}},
}
UNAVAILABLE = {'datafono'}
PLANS = {'completo': [k for k in MODULES if k not in {'asistente_whatsapp', 'datafono'}], 'inicial': ['nucleo']}
PLAN_CHOICES = [('completo', 'Completo'), ('inicial', 'Inicial (reservado)')]
MODULE_CHOICES = [(key, row['name']) for key, row in MODULES.items()]
_cache = ContextVar('modulos_peticion', default=None)


class ModuleCacheMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _cache.set({})
        try:
            return self.get_response(request)
        finally:
            _cache.reset(token)


def invalidate_cache():
    if _cache.get() is not None:
        _cache.get().clear()


def resolved_modules(org, restaurant=None, *, at=None):
    from .models import OrganizationModule
    from .http import json_value
    require(restaurant is None or restaurant.organization_id == org.pk, 'El local no pertenece a la organización.', 'not_found', 404)
    now = at or timezone.now()
    cache = _cache.get() if at is None else None
    key = (org.pk, org.plan, restaurant.pk if restaurant else None)
    if cache is not None and key in cache:
        return cache[key]
    exceptions = OrganizationModule.objects.filter(organization=org, starts__lte=now).filter(
        Q(ends__isnull=True) | Q(ends__gt=now))
    rows = {(r.restaurant_id, r.key): r for r in exceptions}
    result = []
    for module in MODULES:
        row = rows.get((restaurant.pk, module)) if restaurant else None
        source = 'restaurant' if row else 'organization'
        row = row or rows.get((None, module))
        result.append({'key': module, 'active': module == 'nucleo' or (row.active if row else module in PLANS.get(org.plan, PLANS['completo'])),
                       'source': source if row else 'plan', 'starts': json_value(row.starts) if row else None,
                       'ends': json_value(row.ends) if row else None, 'limits': row.limits if row else {},
                       'price': json_value(row.price) if row else None, 'notes': row.notes if row else ''})
    if cache is not None:
        cache[key] = result
    return result


def active_modules(org, restaurant=None):
    return [r['key'] for r in resolved_modules(org, restaurant) if r['active']]


def is_active(org, key, restaurant=None):
    return key in active_modules(org, restaurant)


def require_module(org, key, restaurant=None):
    if not is_active(org, key, restaurant):
        name = MODULES[key]['name']
        raise Problem('module_inactive', f'La función «{name}» no está activa en tu plan.', 403, module=key, module_name=name)


def validate_dependencies(org, *, activating=False):
    """Comprueba también locales y vencimientos: una excepción futura no debe dejar dependencias rotas."""
    from .models import OrganizationModule
    now = timezone.now()
    moments = {now}
    for starts, ends in OrganizationModule.objects.filter(organization=org).values_list('starts', 'ends'):
        moments.update(v for v in (starts, ends) if v and v > now)
    for at in sorted(moments):
        for restaurant in [None, *org.restaurants.all()]:
            active = {r['key'] for r in resolved_modules(org, restaurant, at=at) if r['active']}
            missing = {d for k in active for d in MODULES[k]['depends'] if d not in active}
            if missing:
                dependents = [MODULES[k]['name'] for k in MODULES if k in active and set(MODULES[k]['depends']) & missing]
                raise Problem('module_dependency', 'Hay módulos activos que necesitan estas dependencias: ' + ', '.join(MODULES[k]['name'] for k in sorted(missing)) + '.', 409,
                              **({'missing': [MODULES[k]['name'] for k in sorted(missing)]} if activating else {'dependents': dependents}))
            alternatives = [MODULES[k]['depends_any'] for k in active if MODULES[k].get('depends_any') and not set(MODULES[k]['depends_any']) & active]
            if alternatives:
                names = [' o '.join(MODULES[d]['name'] for d in group) for group in alternatives]
                raise Problem('module_dependency', 'Pagos en línea necesita una de estas opciones: ' + ', '.join(names) + '.', 409, **({'missing': names} if activating else {'dependents': ['Pagos en línea']}))



@transaction.atomic
def set_module(actor, org, key, active, restaurant=None, ends=None, limits=None, price=None, notes=''):
    from .models import Organization, OrganizationModule
    from .services import audit
    require(actor is None or actor.role == 'admin')
    require(isinstance(key, str) and key in MODULES and type(active) is bool, 'Indica un módulo y estado válidos.', 'invalid_data', 400)
    require(key != 'nucleo' or active, 'El Núcleo no se puede apagar.', 'invalid_data', 400)
    require(key not in UNAVAILABLE or not active, 'Este módulo todavía no está disponible.', 'invalid_data', 400)
    require(restaurant is None or restaurant.organization_id == org.pk, 'No encontramos este local.', 'not_found', 404)
    require(ends is None or (hasattr(ends, 'tzinfo') and timezone.is_aware(ends)), 'Indica una vigencia con zona horaria.', 'invalid_data', 400)
    require(limits is None or (isinstance(limits, dict) and all(k in MODULES[key]['units'] and type(v) is int and v >= 0 for k, v in limits.items())), 'Revisa los cupos del módulo.', 'invalid_data', 400)
    require(isinstance(notes, str) and len(notes) <= 5000, 'Revisa las notas del módulo.', 'invalid_data', 400)
    if price is not None:
        try:
            price = Decimal(str(price))
            require(price.is_finite() and 0 <= price < Decimal('1000000000000') and price == price.quantize(Decimal('.01')), 'Indica un precio no negativo con hasta dos decimales.', 'invalid_data', 400)
        except (InvalidOperation, ValueError):
            raise Problem('invalid_data', 'Indica un precio válido.') from None
    locked = Organization.objects.select_for_update().get(pk=org.pk)
    from .recurring import settle_expirations, sync_recurring
    settle_expirations(locked)
    sync_recurring(locked)
    row, _ = OrganizationModule.objects.update_or_create(organization=locked, restaurant=restaurant, key=key,
        defaults={'active': active, 'starts': timezone.now(), 'ends': ends, 'limits': limits or {}, 'price': price, 'notes': notes, 'actor': actor})
    validate_dependencies(locked, activating=active)
    audit(actor, locked, 'module_change', {'key': key, 'active': active, 'restaurant_id': restaurant.pk if restaurant else None,
                                        'ends': ends.isoformat() if ends else None, 'limits': limits or {}, 'price': str(price) if price is not None else None, 'notes': notes})
    invalidate_cache()
    sync_recurring(locked)
    return row


def modules_response(org):
    return {'plan': org.plan, 'plans': [{'key': key, 'name': name} for key, name in PLAN_CHOICES],
            'catalog': [{'key': key, 'name': row['name'], 'depends': row['depends'], 'units': list(row['units']),
                         'depends_any': row.get('depends_any', []), 'required': key == 'nucleo', 'available': key not in UNAVAILABLE} for key, row in MODULES.items()],
            'organization': resolved_modules(org),
            'restaurants': [{'id': r.pk, 'name': r.name, 'modules': resolved_modules(org, r)} for r in org.restaurants.order_by('id')]}


@transaction.atomic
def change_modules(actor, org, data):
    from django.utils.dateparse import parse_datetime
    from .http import payload
    from .models import Organization, OrganizationModule
    from .services import audit
    require(actor.role == 'admin')
    org = Organization.objects.select_for_update().get(pk=org.pk)
    data = payload(data, ('plan', 'key', 'active', 'restaurant_id', 'ends', 'limits', 'price', 'notes', 'clear'))
    if 'plan' in data:
        require(set(data) == {'plan'} and data['plan'] == 'completo', 'El plan inicial está reservado; usa el plan completo.', 'invalid_data', 400)
        before = org.plan
        org.plan = data['plan']
        org.save(update_fields=['plan'])
        validate_dependencies(org)
        audit(actor, org, 'module_change', {'before_plan': before, 'plan': org.plan})
    else:
        key, rid = data.get('key'), data.get('restaurant_id')
        require(isinstance(key, str) and key in MODULES, 'Indica un módulo válido.', 'invalid_data', 400)
        require(rid is None or type(rid) is int, 'Indica un local válido.', 'invalid_data', 400)
        local = org.restaurants.filter(pk=rid).first() if rid is not None else None
        require(rid is None or local, 'No encontramos este local.', 'not_found', 404)
        current = OrganizationModule.objects.filter(organization=org, restaurant=local, key=key).first()
        if 'clear' in data:
            require(data['clear'] is True and set(data) <= {'key', 'restaurant_id', 'clear'}, 'No mezcles quitar una excepción con editarla.', 'invalid_data', 400)
            from .recurring import settle_expirations, sync_recurring
            settle_expirations(org)
            sync_recurring(org)
            if current:
                current.delete()
            validate_dependencies(org)
            audit(actor, org, 'module_change', {'key': key, 'restaurant_id': rid, 'clear': True})
        else:
            require(type(data.get('active')) is bool, 'Indica si el módulo está activo.', 'invalid_data', 400)
            values = {field: data.get(field, getattr(current, field, default)) for field, default in
                      [('ends', None), ('limits', {}), ('price', None), ('notes', '')]}
            if isinstance(values['ends'], str):
                try:
                    values['ends'] = parse_datetime(values['ends'])
                except ValueError:
                    values['ends'] = None
                require(values['ends'] is not None, 'Indica una vigencia ISO válida.', 'invalid_data', 400)
            set_module(actor, org, key, data['active'], local, **values)
    invalidate_cache()
    from .recurring import sync_recurring
    sync_recurring(org)
    return modules_response(org)
