from django.db import models


class DinerFavorite(models.Model):
    """Favoritos de la cuenta dentro del catálogo de su organización."""
    account = models.ForeignKey('experience_app.DinerAccount', on_delete=models.CASCADE, related_name='favorites')
    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60, blank=True, default='')
    product_id = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.venue_slug = ''
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['account', 'restaurant_slug', 'venue_slug', 'product_id'], name='unique_diner_favorite')]
