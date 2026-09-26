"""Plan K4: decoraciones del menú por sede.

Imágenes PNG o WebP pequeñas que una plantilla de componente inserta con <decoracion id="…"/>. Las sube el POS por su
pasarela de administrador; el comensal las recibe desde experience por su id, nunca por una URL externa. El binario se
guarda en la base (como el logo en Odoo): son pocas, pequeñas y viajan con la sede.
"""
from django.db import models


class MenuDecoration(models.Model):
    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60)
    # Id que usa la plantilla: minúsculas, dígitos y guiones. Único por sede; el paquete de fábrica tiene los suyos.
    slug = models.SlugField(max_length=40)
    name = models.CharField(max_length=60)
    content_type = models.CharField(max_length=20)  # image/png | image/webp
    data = models.BinaryField()
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    size = models.PositiveIntegerField()
    created_by = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant_slug', 'venue_slug', 'slug'], name='uniq_menu_decoration')]
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'{self.restaurant_slug}/{self.venue_slug} · {self.slug}'
