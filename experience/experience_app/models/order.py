import uuid

from django.db import models


class Order(models.Model):
    """Una confirmación del carrito. Su id es el uuid que el sistema propio usa para no duplicar en los reintentos."""

    CHECKOUT = 'checkout'
    requires_payment = models.BooleanField(default=False)
    PENDING, SENT, FAILED = 'pending', 'sent', 'failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey('experience_app.TableSession', on_delete=models.CASCADE, related_name='orders')
    state = models.CharField(max_length=10, default=PENDING)
    odoo_order_id = models.PositiveIntegerField(null=True, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tax = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
