"""Preparación compartida por MCP y POS: instantánea validada, enlace de lectura, caducidad y verificación en navegador."""
import json
import logging
import os
import shlex
import subprocess
import uuid
from copy import deepcopy
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from experience_app.diseno import plantillas
from experience_app.diseno import services as design
from experience_app.mcp.models import McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.plantillas.models import VenueMenuSettings

TTL = timedelta(minutes=30)
LAYERS = ('fundamentos', 'variantes', 'distribucion', 'componentes')
logger = logging.getLogger(__name__)


class InvalidDraft(ValueError):
    """El borrador no puede leerse o confirmarse en su estado actual."""


def merge(current, patch, schema=design.SCHEMA, path='tema'):
    """Mezcla solo hojas declaradas; rechaza tipos y derivados antes de validar el tema completo."""
    if schema['type'] != 'object':
        return design._normalize(patch, schema, path)
    if not isinstance(patch, dict):
        raise design.InvalidTheme(f'{path} debe ser un objeto.')
    result = deepcopy(current)
    for key, value in patch.items():
        rule = schema['properties'].get(key)
        if rule is None:
            raise design.InvalidTheme(f'{path}: campo desconocido «{key}».')
        if rule.get('readOnly'):
            raise design.InvalidTheme(f'{path}.{key} se calcula automáticamente y no se puede editar.')
        result[key] = merge(result[key], value, rule, f'{path}.{key}')
    return result


def _count(nodes):
    return sum(1 + _count(node.get('hijos', [])) for node in nodes)


def _describe(value):
    # Las plantillas de componente se resumen: el árbol completo no ayuda a la persona que revisa.
    if isinstance(value, dict) and 'arbol' in value:
        return f'plantilla propia (v{value["version"]}, {_count(value["arbol"])} nodos)'
    return 'de fábrica' if value is None else value


def differences(before, after, prefix=''):
    rows = []
    for key, value in after.items():
        path = f'{prefix}.{key}' if prefix else key
        if isinstance(value, dict) and 'arbol' not in value and isinstance(before.get(key), dict) and 'arbol' not in before[key]:
            rows.extend(differences(before[key], value, path))
        elif before.get(key) != value:
            rows.append({'campo': path, 'antes': _describe(before.get(key)), 'despues': _describe(value)})
    return rows


def create(tenant, theme, *, key=None, before=None):
    # La sede en contexto: sus decoraciones deben seguir siendo válidas al volver a validar el tema del borrador.
    with plantillas.for_venue(tenant.restaurant_slug, tenant.venue_slug):
        theme = design.validate(theme)
    current = templates.settings_view(tenant.restaurant_slug, tenant.venue_slug)['tema'] if before is None else before
    preview = deepcopy(templates.resolve_template(tenant))
    preview.update(tema=theme, tokens=design.apply_to_tokens(theme, preview['tokens']))
    preview['fuentesGoogle'] = list(dict.fromkeys([theme['fundamentos']['tipografia'][role] for role in ('display', 'cuerpo')]))
    McpPendingChange.objects.filter(restaurant_slug=tenant.restaurant_slug, venue_slug=tenant.venue_slug,
                                    created_at__lte=timezone.now() - TTL, applied_at__isnull=True).delete()
    return McpPendingChange.objects.create(key=key, kind='theme' if key else 'preview',
        restaurant_slug=tenant.restaurant_slug, venue_slug=tenant.venue_slug, preview_token=uuid.uuid4(), preview=preview,
        payload={'plantilla': 'S1', 'tema': theme, 'base': current})


def design_system_url(restaurant, venue, token=None):
    """Página viva del sistema de diseño (J5): todos los componentes y variantes con el tema de la sede o de un borrador."""
    url = f'{settings.DINER_PUBLIC_URL}/{quote(restaurant)}/{quote(venue)}/design-system'
    return f'{url}?borrador={token}' if token else url


def result(change):
    return {'borrador': str(change.preview_token), 'caduca': (change.created_at + TTL).isoformat(),
            'url': f'{settings.DINER_PUBLIC_URL}/{quote(change.restaurant_slug)}/{quote(change.venue_slug)}/carta?borrador={change.preview_token}',
            'url_design_system': design_system_url(change.restaurant_slug, change.venue_slug, change.preview_token),
            'vista_previa': differences(change.payload['base'], change.payload['tema'])}


def read(restaurant, venue, token):
    try:
        token = uuid.UUID(str(token))
    except ValueError:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado.') from None
    change = McpPendingChange.objects.select_related('key').filter(preview_token=token,
        restaurant_slug=restaurant, venue_slug=venue, kind__in=['theme', 'preview']).first()
    if (change is None or change.applied_at or timezone.now() >= change.created_at + TTL
            or (change.key_id and change.key.revoked_at)):
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado.')
    return {'plantilla': change.preview, 'caduca': (change.created_at + TTL).isoformat()}


def introduces_templates(change) -> bool:
    """True si el borrador introduce o cambia una plantilla propia. Volver a fábrica no cuenta: no hay nada que medir."""
    base = change.payload['base'].get('componentes', {})
    return any(value is not None and value != base.get(component_id)
               for component_id, value in change.payload['tema'].get('componentes', {}).items())


def _run_verifier(command: str, change) -> dict:
    env = {**os.environ, 'DRAFT_TOKEN': str(change.preview_token), 'REST': change.restaurant_slug, 'SEDE': change.venue_slug}
    parts = shlex.split(command)
    if not parts:
        raise ValueError('DESIGN_VERIFIER_CMD está vacío')
    run = subprocess.run(parts, capture_output=True, text=True, timeout=settings.DESIGN_VERIFIER_TIMEOUT, env=env, check=False)
    try:
        data = json.loads(run.stdout)
    except ValueError:
        logger.error('El verificador terminó con código %s sin JSON en stdout. stderr: %s', run.returncode, run.stderr[-2000:])
        raise ValueError(f'el verificador terminó con código {run.returncode} sin un resultado JSON') from None
    if not isinstance(data, dict):
        raise ValueError('el verificador no devolvió un objeto JSON')
    problems = data.get('problemas')
    problems = [p if isinstance(p, dict) else str(p) for p in problems] if isinstance(problems, list) else []
    # ok null = el navegador no pudo medir (infraestructura), distinto de una plantilla con problemas.
    if data.get('ok') is None:
        return {'estado': 'error', 'ok': None, 'problemas': problems,
                'mensaje': 'La verificación no pudo medir el borrador; revisa el registro del servidor y avísale a la persona.'}
    captures = data.get('capturas') if isinstance(data.get('capturas'), list) else []
    return {'estado': 'ok' if data['ok'] else 'problemas', 'ok': bool(data['ok']), 'problemas': problems,
            'medidas': data.get('medidas') if isinstance(data.get('medidas'), dict) else {},
            'capturas': [os.path.basename(str(c)) for c in captures]}


def verify(change) -> dict:
    """K3: abre el borrador en un navegador (comando de DESIGN_VERIFIER_CMD) y guarda el resultado en el cambio pendiente.

    El comando recibe DRAFT_TOKEN, REST y SEDE y escribe en stdout {"ok": bool|null, "problemas": [...]}. Sin comando,
    la verificación no está disponible y se dice; nunca se inventa un resultado. Solo corre una verificación a la vez
    por sede: el navegador es caro y comparte servidor con pedidos y pagos.
    """
    if change.applied_at or timezone.now() >= change.created_at + TTL:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado.')
    command = settings.DESIGN_VERIFIER_CMD
    if not command.strip():
        result = {'estado': 'no_disponible', 'ok': None, 'problemas': [],
                  'mensaje': 'La verificación en navegador no está configurada en este servidor. Revisa el borrador a ojo en url y url_design_system antes de confirmar.'}
    else:
        lock = f'verificacion:{change.restaurant_slug}/{change.venue_slug}'
        if not cache.add(lock, str(change.pk), timeout=settings.DESIGN_VERIFIER_TIMEOUT + 5):
            raise InvalidDraft('Ya hay una verificación en curso para esta sede; espera a que termine.')
        try:
            result = _run_verifier(command, change)
        except subprocess.TimeoutExpired:
            result = {'estado': 'error', 'ok': None, 'problemas': [],
                      'mensaje': f'La verificación superó el tiempo máximo (DESIGN_VERIFIER_TIMEOUT = {settings.DESIGN_VERIFIER_TIMEOUT} s).'}
        except (OSError, ValueError, subprocess.SubprocessError):
            logger.exception('La verificación del borrador %s no pudo ejecutarse', change.pk)
            result = {'estado': 'error', 'ok': None, 'problemas': [],
                      'mensaje': 'La verificación no pudo ejecutarse; revisa el registro del servidor.'}
        finally:
            cache.delete(lock)
    change.payload = {**change.payload, 'verificacion': {**result, 'fecha': timezone.now().isoformat()}}
    change.save(update_fields=['payload'])
    return result


@transaction.atomic
def confirm(key, token):
    change = McpPendingChange.objects.select_for_update().filter(pk=token, key=key, kind='theme').first()
    if change is None or change.applied_at or timezone.now() >= change.created_at + TTL:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado. Vuelve a prepararlo.')
    # K3: con verificador configurado, una plantilla propia solo se publica con la última verificación en verde.
    # Volver a fábrica no exige verificación: no hay plantilla que medir.
    if settings.DESIGN_VERIFIER_CMD.strip() and introduces_templates(change) and change.payload.get('verificacion', {}).get('ok') is not True:
        raise InvalidDraft('Este borrador introduce una plantilla propia: llama verificar_borrador y corrige los problemas antes de confirmar.')
    # Reclamar dentro de la transacción impide confirmar dos veces también en SQLite; si guardar falla, se revierte.
    if not McpPendingChange.objects.filter(pk=change.pk, applied_at__isnull=True).update(applied_at=timezone.now()):
        raise InvalidDraft('Ese cambio ya se aplicó.')
    # El bloqueo es por sede, también si dos claves distintas prepararon cambios cuando aún no había ajustes.
    template = templates.default_template()
    if template is None:
        raise InvalidDraft('El catálogo de plantillas no está cargado. Vuelve a preparar el tema cuando esté disponible.')
    VenueMenuSettings.objects.get_or_create(restaurant_slug=key.restaurant_slug, venue_slug=key.venue_slug,
                                            defaults={'template': template})
    VenueMenuSettings.objects.select_for_update().get(restaurant_slug=key.restaurant_slug, venue_slug=key.venue_slug)
    if templates.settings_view(key.restaurant_slug, key.venue_slug)['tema'] != change.payload['base']:
        raise InvalidDraft('El tema cambió después de preparar el borrador. Lee el diseño y vuelve a prepararlo.')
    templates.save(key.restaurant_slug, key.venue_slug, {'plantilla': 'S1', 'tema': change.payload['tema']})
