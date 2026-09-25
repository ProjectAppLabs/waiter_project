"""Preparación compartida por MCP y POS: instantánea validada, enlace de lectura y caducidad."""
import uuid
from copy import deepcopy
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from experience_app.diseno import services as design
from experience_app.mcp.models import McpPendingChange
from experience_app.plantillas import services as templates
from experience_app.plantillas.models import VenueMenuSettings

TTL = timedelta(minutes=30)
LAYERS = ('fundamentos', 'variantes', 'distribucion')


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


def differences(before, after, prefix=''):
    rows = []
    for key, value in after.items():
        path = f'{prefix}.{key}' if prefix else key
        if isinstance(value, dict):
            rows.extend(differences(before[key], value, path))
        elif before[key] != value:
            rows.append({'campo': path, 'antes': before[key], 'despues': value})
    return rows


def create(tenant, theme, *, key=None, before=None):
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


def result(change):
    return {'borrador': str(change.preview_token), 'caduca': (change.created_at + TTL).isoformat(),
            'url': f'{settings.DINER_PUBLIC_URL}/{quote(change.restaurant_slug)}/{quote(change.venue_slug)}/carta?borrador={change.preview_token}',
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


@transaction.atomic
def confirm(key, token):
    change = McpPendingChange.objects.select_for_update().filter(pk=token, key=key, kind='theme').first()
    if change is None or change.applied_at or timezone.now() >= change.created_at + TTL:
        raise InvalidDraft('El borrador no existe, caducó o ya fue aplicado. Vuelve a prepararlo.')
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
