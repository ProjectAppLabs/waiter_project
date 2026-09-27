"""Preparación compartida por MCP y POS: instantánea validada, enlace de lectura, caducidad y verificación en navegador."""
import json
import logging
import os
import shlex
import subprocess
import threading
import uuid
from copy import deepcopy
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections, connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from experience_app.diseno import plantillas
from experience_app.diseno import services as design
from experience_app.mcp.models import McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.plantillas.models import VenueMenuSettings

TTL = timedelta(minutes=30)
LAYERS = ('fundamentos', 'variantes', 'distribucion', 'componentes')
VERIFICATION_MARGIN = 5
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
    design.check_google_fonts(theme)
    current = templates.settings_view(tenant.restaurant_slug, tenant.venue_slug)['tema'] if before is None else before
    preview = deepcopy(templates.resolve_template(tenant))
    preview.update(tema=theme, tokens=design.apply_to_tokens(theme, preview['tokens']))
    typography = theme['fundamentos']['tipografia']
    preview['fuentesGoogle'] = list(dict.fromkeys([typography['display'], typography['cuerpo'], *typography['fuentes']]))
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


def get(restaurant, venue, token, *, lock=False):
    """Resuelve el token público dentro de su sede; el guardado bloquea la fila hasta consumirla."""
    try:
        token = uuid.UUID(str(token))
    except ValueError:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado.') from None
    changes = McpPendingChange.objects.select_for_update() if lock else McpPendingChange.objects.all()
    change = changes.filter(preview_token=token,
        restaurant_slug=restaurant, venue_slug=venue, kind__in=['theme', 'preview']).first()
    if (change is None or change.applied_at or timezone.now() >= change.created_at + TTL
            or (change.key_id and change.key.revoked_at)):
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado.')
    return change


def read(restaurant, venue, token):
    change = get(restaurant, venue, token)
    return {'plantilla': change.preview, 'caduca': (change.created_at + TTL).isoformat()}


def introduces_templates(change) -> bool:
    """True si el borrador introduce o cambia una plantilla propia. Volver a fábrica no cuenta: no hay nada que medir."""
    base = change.payload['base'].get('componentes', {})
    return any(value is not None and value != base.get(component_id)
               for component_id, value in change.payload['tema'].get('componentes', {}).items())


def require_verified(change):
    """La última medición del borrador debe ser verde; explica qué falta para poder publicar."""
    verification = change.payload.get('verificacion', {})
    if verification.get('ok') is True:
        return
    state = verification.get('estado')
    if state == 'no_disponible' or (not state and not settings.DESIGN_VERIFIER_CMD.strip()):
        reason = 'La verificación en navegador no está configurada; configura DESIGN_VERIFIER_CMD.'
    elif state == 'error':
        reason = 'La última verificación terminó con error; revisa el verificador y vuelve a intentarlo.'
    elif state == 'problemas':
        reason = 'La última verificación encontró problemas; corrige la plantilla y prepara otro borrador.'
    elif state == 'en_curso':
        reason = 'La verificación está en curso; espera y vuelve a consultar el mismo borrador.'
    else:
        reason = 'Falta una verificación en verde de este borrador.'
    raise InvalidDraft(f'{reason} Ejecuta verificar_borrador (MCP) o verify (POS) y publica solo con ok: true.')


def verification_result(change, result):
    """MCP y POST interno devuelven el mismo contrato, sin exponer el token de confirmación."""
    following = {'en_curso': 'La verificación está en curso. Espera unos segundos y vuelve a llamar verificar_borrador (MCP) o verify (POS) con el mismo borrador.',
                 'ok': 'Muestra el resultado a la persona; con su aprobación, confirma o guarda el borrador.',
                 'problemas': 'Corrige los problemas y prepara de nuevo.',
                 'error': 'La verificación no pudo medir: no es culpa de la plantilla. Avísale a la persona; para reintentar prepara otro borrador.',
                 'no_disponible': 'Configura DESIGN_VERIFIER_CMD y prepara otro borrador para verificar antes de publicar.'
                 if settings.DESIGN_VERIFIER_REQUIRED else 'Revisa el borrador a ojo con la persona en url y url_design_system.'}
    return {**result, 'borrador': str(change.preview_token), 'siguiente': following[result['estado']]}


def _verification_lock(change):
    return f'verificacion:{change.restaurant_slug}/{change.venue_slug}'


def _verification_owner(change):
    return f'{change.pk}:{change.payload["verificacion"].get("inicio")}'


def _release_verification(change):
    # Un trabajo atrasado no debe liberar el cerrojo de una verificación posterior de la sede.
    lock = _verification_lock(change)
    if cache.get(lock) == _verification_owner(change):
        cache.delete(lock)


def _save_verification(change, result):
    """Solo el trabajo vigente puede sustituir su en_curso; un hilo tardío no pisa un error ni otro resultado."""
    saved = {**result, 'inicio': change.payload['verificacion'].get('inicio'), 'fecha': timezone.now().isoformat()}
    McpPendingChange.objects.filter(pk=change.pk, payload=change.payload, applied_at__isnull=True).update(
        payload={**change.payload, 'verificacion': saved})
    return saved


def _verification_error(message):
    return {'estado': 'error', 'ok': None, 'problemas': [], 'mensaje': message}


def _verification_expired(verification):
    try:
        started = parse_datetime(verification.get('inicio', ''))
    except (TypeError, ValueError):
        started = None
    return (started is None or timezone.is_naive(started)
            or timezone.now() >= started + timedelta(seconds=settings.DESIGN_VERIFIER_TIMEOUT + VERIFICATION_MARGIN))


def _verification_status(change):
    saved = change.payload.get('verificacion')
    if saved and saved['estado'] == 'en_curso' and _verification_expired(saved):
        _save_verification(change, _verification_error('La verificación en segundo plano superó el tiempo máximo o se interrumpió. Prepara otro borrador para reintentar.'))
        _release_verification(change)
        change.refresh_from_db()
        saved = change.payload['verificacion']
    return saved


def _verify_worker(change):
    try:
        close_old_connections()
        current = get(change.restaurant_slug, change.venue_slug, change.preview_token)
        if current.payload == change.payload:
            verify(change)
    except Exception:
        logger.exception('Falló el trabajo de verificación del borrador %s', change.pk)
        try:
            _save_verification(change, _verification_error('El trabajo de verificación se interrumpió. Prepara otro borrador para reintentar.'))
        except Exception:
            # Si la base tampoco responde, la consulta detectará el en_curso vencido y lo pasará a error.
            logger.exception('No se pudo guardar el error de verificación del borrador %s', change.pk)
    finally:
        try:
            _release_verification(change)
        finally:
            connections.close_all()


def _launch_verification(change):
    try:
        threading.Thread(target=_verify_worker, args=(change,), daemon=True).start()
    except Exception:
        logger.exception('No se pudo iniciar el hilo de verificación del borrador %s', change.pk)
        try:
            _save_verification(change, _verification_error('No se pudo iniciar la verificación. Prepara otro borrador para reintentar.'))
        finally:
            _release_verification(change)


def start_verification(change):
    """Inicia una vez o consulta el resultado guardado; nunca espera al navegador en la petición HTTP."""
    change = get(change.restaurant_slug, change.venue_slug, change.preview_token)
    saved = _verification_status(change)
    if saved:
        return saved
    pending = {'estado': 'en_curso', 'ok': None, 'inicio': timezone.now().isoformat()}
    owner = f'{change.pk}:{pending["inicio"]}'
    lock = _verification_lock(change)
    if not cache.add(lock, owner, timeout=settings.DESIGN_VERIFIER_TIMEOUT + VERIFICATION_MARGIN):
        # Otra petición del mismo borrador puede haberlo arrancado mientras leíamos.
        change = get(change.restaurant_slug, change.venue_slug, change.preview_token)
        saved = _verification_status(change)
        if saved:
            return saved
        raise InvalidDraft('Ya hay una verificación en curso para esta sede; espera a que termine.')
    try:
        payload = {**change.payload, 'verificacion': pending}
        # Comparar la instantánea evita iniciar dos veces o medir después de una confirmación concurrente.
        updated = McpPendingChange.objects.filter(pk=change.pk, payload=change.payload, applied_at__isnull=True).update(payload=payload)
        if not updated:
            raise InvalidDraft('El borrador cambió mientras se iniciaba la verificación; vuelve a consultarlo.')
        change.payload = payload
        # El hilo usa otra conexión: no puede leer el borrador antes de confirmar esta escritura.
        transaction.on_commit(lambda: _launch_verification(change))
    except Exception:
        if cache.get(lock) == owner:
            cache.delete(lock)
        raise
    return pending


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
    if type(data['ok']) is not bool:
        raise ValueError('el campo ok del verificador debe ser booleano o null')
    captures = data.get('capturas') if isinstance(data.get('capturas'), list) else []
    return {'estado': 'ok' if data['ok'] else 'problemas', 'ok': bool(data['ok']), 'problemas': problems,
            'medidas': data.get('medidas') if isinstance(data.get('medidas'), dict) else {},
            'capturas': [os.path.basename(str(c)) for c in captures]}


def verify(change) -> dict:
    """Trabajador síncrono: mide el borrador reservado por start_verification y guarda su resultado.

    El comando recibe DRAFT_TOKEN, REST y SEDE y escribe en stdout {"ok": bool|null, "problemas": [...]}. Sin comando,
    la verificación no está disponible y se dice; nunca se inventa un resultado. El iniciador conserva el cerrojo por
    sede hasta que este trabajo termina o vence el tiempo máximo más el margen.
    """
    if change.applied_at or timezone.now() >= change.created_at + TTL:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado.')
    if _verification_expired(change.payload['verificacion']):
        return _save_verification(change, _verification_error('La verificación superó el tiempo máximo antes de poder medir.'))
    command = settings.DESIGN_VERIFIER_CMD
    if not command.strip():
        result = {'estado': 'no_disponible', 'ok': None, 'problemas': [],
                  'mensaje': 'La verificación en navegador no está configurada en este servidor (DESIGN_VERIFIER_CMD).'}
    else:
        try:
            result = _run_verifier(command, change)
        except subprocess.TimeoutExpired:
            result = {'estado': 'error', 'ok': None, 'problemas': [],
                      'mensaje': f'La verificación superó el tiempo máximo (DESIGN_VERIFIER_TIMEOUT = {settings.DESIGN_VERIFIER_TIMEOUT} s).'}
        except (OSError, ValueError, subprocess.SubprocessError):
            logger.exception('La verificación del borrador %s no pudo ejecutarse', change.pk)
            result = {'estado': 'error', 'ok': None, 'problemas': [],
                      'mensaje': 'La verificación no pudo ejecutarse; revisa el registro del servidor.'}
    if _verification_expired(change.payload['verificacion']):
        result = _verification_error('La verificación superó el tiempo máximo; su resultado tardío no permite publicar.')
    return _save_verification(change, result)


@transaction.atomic
def confirm(key, token):
    change = McpPendingChange.objects.select_for_update().filter(pk=token, key=key, kind='theme').first()
    if change is None or change.applied_at or timezone.now() >= change.created_at + TTL:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado. Vuelve a prepararlo.')
    # Cierre A: el modo estricto exige verificación incluso sin comando; false conserva la puerta de K3.
    # Volver a fábrica no exige verificación: no hay plantilla que medir.
    if (settings.DESIGN_VERIFIER_REQUIRED or settings.DESIGN_VERIFIER_CMD.strip()) and introduces_templates(change):
        require_verified(change)
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
