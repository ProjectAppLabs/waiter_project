from django.db import models
from django.core.exceptions import ValidationError

from registry_app.utils import crypto


class Venue(models.Model):
    """Restaurante de una organización: comparte su base de Odoo y tiene su propio config."""

    restaurant = models.ForeignKey("registry_app.Restaurant", on_delete=models.CASCADE, related_name="venues")
    slug = models.SlugField(max_length=60)
    name = models.CharField(max_length=120)
    odoo_url = models.URLField()
    odoo_db = models.CharField(max_length=63)
    odoo_login = models.CharField(max_length=120)
    odoo_secret = models.TextField(help_text="Contraseña del usuario de servicio, cifrada con Fernet.")
    pos_config_id = models.PositiveIntegerField()
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["restaurant", "slug"], name="uniq_venue_slug_per_restaurant"),
                       models.UniqueConstraint(fields=["restaurant", "pos_config_id"], name="uniq_config_per_organization")]

    def clean(self):
        super().clean()
        if not self.restaurant_id:
            return
        siblings = type(self).objects.filter(restaurant_id=self.restaurant_id).exclude(pk=self.pk)
        if siblings.exclude(odoo_db=self.odoo_db, odoo_url=self.odoo_url).exists():
            raise ValidationError('Todos los restaurantes de una organización deben usar la misma base de Odoo.')

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.restaurant.slug}/{self.slug}"

    @property
    def odoo_password(self) -> str:
        return crypto.decrypt(self.odoo_secret)

    @odoo_password.setter
    def odoo_password(self, plain: str) -> None:
        self.odoo_secret = crypto.encrypt(plain)
