from django.db import models


class Restaurant(models.Model):
    """Organización dueña de los restaurantes. Su slug es el primer segmento de toda URL pública."""

    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Marca (sistema de diseño §06): dos entradas del restaurante, el resto se deriva.
    brand_color = models.CharField(max_length=7, default="#C1873A", help_text="Color de acción, #RRGGBB")
    brand_font = models.CharField(max_length=40, default="Instrument Serif", help_text="Una de las seis fuentes curadas")
    brand_radius = models.PositiveSmallIntegerField(default=14, help_text="4 recto · 14 suave · 24 muy redondeado")
    tagline = models.CharField(max_length=80, blank=True, default="")
    logo_url = models.URLField(blank=True, default="")
    greeting = models.CharField(max_length=60, blank=True, default="")
    waiter_name = models.CharField(max_length=40, blank=True, default="")
    welcome = models.CharField(max_length=140, blank=True, default="")

    def __str__(self) -> str:
        return self.slug

    def brand(self) -> dict:
        from registry_app.utils.brand import theme
        t = theme(self.brand_color, self.brand_font, self.brand_radius)
        return {"nombre": self.name, "lema": self.tagline, "logo": self.logo_url or None, "saludo": self.greeting, "mesero": self.waiter_name,
                "bienvenida": self.welcome, **t}
