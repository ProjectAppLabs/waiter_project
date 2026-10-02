import uuid

from django.db import models


class TableSession(models.Model):
    """Una visita: la mesa (o un domicilio) desde que alguien toca el NFC hasta que se cierra."""

    COMPOSING, CONFIRMED, PAID, CLOSED = 'composing', 'confirmed', 'paid', 'closed'
    STATES = [(COMPOSING, 'componiendo'), (CONFIRMED, 'confirmada'), (PAID, 'pagada'), (CLOSED, 'cerrada')]
    OPEN_STATES = (COMPOSING, CONFIRMED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60)
    table_token = models.CharField(max_length=64, null=True, blank=True)  # null = domicilio
    table_number = models.PositiveIntegerField(null=True, blank=True)
    odoo_table_id = models.PositiveIntegerField(null=True, blank=True)
    state = models.CharField(max_length=12, choices=STATES, default=COMPOSING)
    confirming = models.BooleanField(default=False)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=['restaurant_slug', 'venue_slug', 'table_token', 'state'])]

    @property
    def is_delivery(self) -> bool:
        return self.table_token is None
