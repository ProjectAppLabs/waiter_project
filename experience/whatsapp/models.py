"""Cuentas y conversaciones de WhatsApp, aisladas por organización."""
from django.db import models
from django.utils import timezone
from tenancy.fields import ExactCharField, only_when


class WhatsAppAccount(models.Model):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.PROTECT)
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.PROTECT, null=True, blank=True)
    phone_number_id = ExactCharField(max_length=80, unique=True)
    waba_id = ExactCharField(max_length=80)
    phone = models.CharField(max_length=80, blank=True)
    name = models.CharField(max_length=200, blank=True)
    quality = models.CharField(max_length=30, blank=True)
    token_encrypted = ExactCharField(max_length=4096, blank=True)
    pin_encrypted = ExactCharField(max_length=512, blank=True)
    status = models.CharField(max_length=12, default='connected', choices=[('connected', 'Conectado'), ('disconnected', 'Desconectado')])
    connected_by = models.ForeignKey('accounts.Account', on_delete=models.SET_NULL, null=True)
    connected_at = models.DateTimeField(default=timezone.now)
    active_organization = only_when(models.Q(status='connected'), 'organization_id', models.UUIDField())

    class Meta:
        constraints = [models.UniqueConstraint(fields=['active_organization'], name='wa_una_cuenta_conectada')]


class WhatsAppConversation(models.Model):
    account = models.ForeignKey(WhatsAppAccount, on_delete=models.CASCADE, related_name='conversations')
    wa_id = ExactCharField(max_length=32)
    profile_name = models.CharField(max_length=200, blank=True)
    last_inbound_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['account', 'wa_id'], name='wa_cliente_por_cuenta')]


class WhatsAppMessage(models.Model):
    conversation = models.ForeignKey(WhatsAppConversation, on_delete=models.CASCADE, related_name='messages')
    direction = models.CharField(max_length=3, choices=[('in', 'Entrante'), ('out', 'Saliente')])
    wamid = ExactCharField(max_length=255, blank=True, default='')
    unique_wamid = only_when(~models.Q(wamid=''), 'wamid', ExactCharField(max_length=255))
    type = models.CharField(max_length=30)
    text = models.TextField(blank=True)
    template = models.CharField(max_length=512, blank=True)
    language = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=12, choices=[('received', 'Recibido'), ('sent', 'Enviado'), ('delivered', 'Entregado'), ('read', 'Leído'), ('failed', 'Fallido')])
    error_code = models.CharField(max_length=30, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    received_at = models.DateTimeField(null=True)
    sent_at = models.DateTimeField(null=True)
    delivered_at = models.DateTimeField(null=True)
    read_at = models.DateTimeField(null=True)
    failed_at = models.DateTimeField(null=True)
    raw = models.JSONField(default=dict)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['unique_wamid'], name='wa_mensaje_unico')]


class WhatsAppWebhookEvent(models.Model):
    # Meta no entrega un id único del sobre: su huella canónica identifica cada reintento.
    event_id = ExactCharField(max_length=64, unique=True)
    raw_body = models.BinaryField()
    received_at = models.DateTimeField(default=timezone.now)
    processed_at = models.DateTimeField(null=True, db_index=True)
    error = models.TextField(blank=True)
    attempts = models.PositiveIntegerField(default=0)
