"""Catálogo de plantillas y elección por sede (ADR 2026-09-05-plantillas-en-el-modulo-3).

`MenuTemplate` es una copia en base de `catalogo/<codigo>.json`: se siembra por upsert y nunca se edita a mano, así el
catálogo vive versionado en el repo y añadir una plantilla es añadir un JSON. `VenueMenuSettings` es lo único que el
restaurante escribe (desde el POS, por la pasarela del addon): qué plantilla y con qué colores y tipografía.
"""
from django.db import models


class MenuTemplate(models.Model):
    code = models.CharField(max_length=4, primary_key=True)  # "B1"
    family = models.CharField(max_length=1)  # "A".."F"
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    spec = models.JSONField(default=dict)  # Contrato 1 completo (tokens, personalizable, pantallas, fotos, fuentesGoogle)
    sort = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort', 'code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class VenueMenuSettings(models.Model):
    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60)
    template = models.ForeignKey(MenuTemplate, on_delete=models.PROTECT, related_name='venues')
    palette = models.JSONField(default=dict)  # {"acento": "#RRGGBB", ...} solo tokens de spec.personalizable.colores
    typography = models.JSONField(default=dict)  # {"display": "Fraunces"}
    theme = models.JSONField(default=dict)  # Tema v2; {} conserva la compatibilidad con los ajustes anteriores.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant_slug', 'venue_slug'], name='uniq_venue_menu_settings')]

    def __str__(self):
        return f'{self.restaurant_slug}/{self.venue_slug} → {self.template_id}'
