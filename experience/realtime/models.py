"""Eventos confirmados de operación, visibles después del commit."""

from django.db import models


class SalesEvent(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.CASCADE)
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.CASCADE)
    kind = models.CharField(max_length=8, choices=[(s, s) for s in ("orders", "kitchen", "tables", "cash", "notify")])
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["restaurant", "id"])]
