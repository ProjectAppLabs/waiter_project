"""Claves MCP: se generan desde el POS (vía la pasarela del addon de Odoo), se guardan como sha256 y se revocan.

La clave tiene 256 bits al azar (`secrets.token_urlsafe(32)`): con eso, un sha256 sin sal basta (no es una contraseña
que alguien elija) y permite buscarla directo por su huella.
"""
import hashlib
import secrets
from datetime import timedelta

from django.utils import timezone

from experience_app.mcp.models import McpKey

PREFIX = 'wtr_'
# Cada cuánto se anota «último uso»: sin esto, cada llamada de la IA escribiría en la base.
TOUCH_EVERY = timedelta(minutes=1)
MAX_ACTIVE_PER_VENUE = 10


class KeyLimit(Exception):
    pass


def fingerprint(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def create(restaurant: str, venue: str, name: str, created_by: str = '') -> tuple[McpKey, str]:
    """Crea una clave para la sede y devuelve (registro, clave en claro). La clave en claro no se vuelve a ver."""
    active = McpKey.objects.filter(restaurant_slug=restaurant, venue_slug=venue, revoked_at__isnull=True).count()
    if active >= MAX_ACTIVE_PER_VENUE:
        raise KeyLimit(f'Ya hay {active} claves activas. Revoca una que no uses para crear otra.')
    raw = PREFIX + secrets.token_urlsafe(32)
    key = McpKey.objects.create(restaurant_slug=restaurant, venue_slug=venue, name=name.strip()[:60] or 'Clave MCP',
                                prefix=raw[:10], key_hash=fingerprint(raw), created_by=created_by[:120])
    return key, raw


def authenticate(raw: str | None) -> McpKey | None:
    """La clave activa que corresponde a `raw`, o None. Anota el último uso como mucho una vez por minuto."""
    if not raw or not raw.startswith(PREFIX) or len(raw) > 100:
        return None
    key = McpKey.objects.filter(key_hash=fingerprint(raw), revoked_at__isnull=True).first()
    if key is None:
        return None
    now = timezone.now()
    if key.last_used_at is None or now - key.last_used_at > TOUCH_EVERY:
        McpKey.objects.filter(pk=key.pk).update(last_used_at=now)
    return key


def listing(restaurant: str, venue: str) -> list[dict]:
    rows = McpKey.objects.filter(restaurant_slug=restaurant, venue_slug=venue).order_by('-created_at')
    return [view(k) for k in rows]


def view(key: McpKey) -> dict:
    return {'id': key.id, 'nombre': key.name, 'prefijo': key.prefix, 'creadaPor': key.created_by,
            'creada': key.created_at.isoformat(), 'ultimoUso': key.last_used_at.isoformat() if key.last_used_at else None,
            'revocada': key.revoked_at.isoformat() if key.revoked_at else None}


def revoke(restaurant: str, venue: str, key_id: int) -> bool:
    """Revoca una clave de ESA sede (el id de otra sede no se toca). True si estaba activa."""
    return bool(McpKey.objects.filter(pk=key_id, restaurant_slug=restaurant, venue_slug=venue, revoked_at__isnull=True)
                .update(revoked_at=timezone.now()))
