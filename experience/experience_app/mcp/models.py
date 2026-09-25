"""Claves MCP por sede y borradores compartidos entre IA y vista previa del POS."""
import uuid

from django.db import models


class McpKey(models.Model):
    """Una clave MCP de una sede. Solo se guarda su sha256: la clave en claro se muestra una vez, al crearla.

    La clave es lo único que decide a qué restaurante se accede: el servidor MCP nunca acepta un slug del cliente.
    """

    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60)
    name = models.CharField(max_length=60)
    # Primeros caracteres de la clave (wtr_xxxxxx), para reconocerla en la lista sin guardarla.
    prefix = models.CharField(max_length=16)
    key_hash = models.CharField(max_length=64, unique=True)
    created_by = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=['restaurant_slug', 'venue_slug'])]


class McpPendingChange(models.Model):
    """Un cambio que la IA preparó y validó pero que aún no se guarda. `id` es el token que confirma: 122 bits al azar,
    y además solo lo acepta la misma clave que lo preparó. Caduca y se usa una sola vez."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.ForeignKey(McpKey, on_delete=models.CASCADE, related_name='changes', null=True, blank=True)
    kind = models.CharField(max_length=20)  # 'design' | 'banners' | 'theme' | 'preview'
    payload = models.JSONField()
    # J4: el enlace público no sirve para confirmar. Las vistas del POS no necesitan una clave MCP ficticia.
    preview_token = models.UUIDField(null=True, blank=True, unique=True, editable=False)
    restaurant_slug = models.SlugField(max_length=60, blank=True, default='')
    venue_slug = models.SlugField(max_length=60, blank=True, default='')
    preview = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)
