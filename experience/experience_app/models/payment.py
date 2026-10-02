"""Provider-neutral configuration and durable attempts; no card data or API payloads."""
import uuid

from django.db import models


class PaymentGateway(models.Model):
    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60)
    provider = models.SlugField(default='wompi')
    environment = models.CharField(max_length=10, default='test')
    enabled = models.BooleanField(default=False)
    public_key = models.CharField(max_length=200, blank=True)
    secrets_cipher = models.TextField(blank=True)
    payment_method_id = models.PositiveIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant_slug', 'venue_slug', 'provider', 'environment'], name='unique_venue_gateway_environment'),
                       models.UniqueConstraint(fields=['restaurant_slug', 'venue_slug'], condition=models.Q(enabled=True), name='one_active_gateway_per_venue')]


class PaymentAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gateway = models.ForeignKey(PaymentGateway, on_delete=models.PROTECT)
    # Un intento paga una de dos cosas: la cuenta de una visita (session + diner + order) o el anticipo de una reserva
    # (reservation_token, el secreto del enlace público; la reserva vive en el sistema propio). Nunca las dos ni ninguna.
    session = models.ForeignKey('TableSession', on_delete=models.PROTECT, related_name='payments', null=True, blank=True)
    diner = models.ForeignKey('Diner', on_delete=models.PROTECT, null=True, blank=True)
    order = models.ForeignKey('Order', on_delete=models.PROTECT, null=True, blank=True)
    reservation_token = models.CharField(max_length=64, blank=True, default='', db_index=True)
    reservation_code = models.CharField(max_length=40, blank=True, default='')
    amount_in_cents = models.PositiveBigIntegerField()
    method = models.CharField(max_length=40)
    status = models.CharField(max_length=20, default='CREATING')
    provider_id = models.CharField(max_length=100, blank=True)
    # Immutable credentials snapshot lets in-flight payments survive administrator rotation.
    credentials_cipher = models.TextField()
    payment_method_id = models.PositiveIntegerField(null=True)
    reconciled = models.BooleanField(default=False)
    needs_review = models.BooleanField(default=False)
    qr_image = models.TextField(blank=True)
    challenge_html = models.TextField(blank=True)
    card_brand = models.CharField(max_length=20, blank=True)
    redirect_url = models.URLField(max_length=2048, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    checked_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['session'], condition=models.Q(status__in=['CREATING', 'UNKNOWN', 'PENDING', 'APPROVED']), name='one_unresolved_payment_per_visit'),
                       models.UniqueConstraint(fields=['reservation_token'], condition=models.Q(status__in=['CREATING', 'UNKNOWN', 'PENDING', 'APPROVED']) & ~models.Q(reservation_token=''), name='one_unresolved_payment_per_reservation'),
                       models.CheckConstraint(condition=(models.Q(session__isnull=False, diner__isnull=False, order__isnull=False, reservation_token='')
                                                         | (models.Q(session__isnull=True, diner__isnull=True, order__isnull=True) & ~models.Q(reservation_token=''))),
                                              name='payment_is_for_a_visit_or_a_reservation')]

    @property
    def reference(self):
        return f'waiter-{self.id.hex}'
