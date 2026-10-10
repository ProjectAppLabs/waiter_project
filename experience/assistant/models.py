"""Memoria y decisiones aisladas por organización; nunca se guardan credenciales."""
from django.db import models
from tenancy.fields import ExactCharField


class AssistantStanding(models.Model):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE)
    participant = ExactCharField(max_length=64)
    channel = models.CharField(max_length=16)
    consecutive = models.PositiveIntegerField(default=0)
    incidents = models.JSONField(default=list)
    level = models.CharField(max_length=16, blank=True, default='')
    reason = models.CharField(max_length=200, blank=True, default='')
    until = models.DateTimeField(null=True)
    restricted_day = models.DateField(null=True)
    day = models.DateField(null=True)
    attempts = models.PositiveIntegerField(default=0)
    last_at = models.DateTimeField(null=True)
    last_fingerprint = ExactCharField(max_length=64, blank=True, default='')
    buffered_text = models.CharField(max_length=1000, blank=True, default='')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'participant'], name='asistente_participante_unico')]


class AssistantProfile(models.Model):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE)
    participant = ExactCharField(max_length=64)
    preferences = models.JSONField(default=dict)
    favorites = models.JSONField(default=dict)
    last_orders = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'participant'], name='asistente_perfil_unico')]


class AssistantConversationState(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    participant = ExactCharField(max_length=64)
    channel = models.CharField(max_length=16)
    state = models.CharField(max_length=20, default='explorando', choices=[(s, s) for s in (
        'explorando', 'eligiendo', 'falta_dato', 'resumen', 'esperando_pago', 'pagado')])
    cards = models.JSONField(default=list)
    options = models.JSONField(default=list)
    selection = models.JSONField(default=list)
    revision = models.PositiveIntegerField(default=0)
    last_question = models.CharField(max_length=40, blank=True, default='')
    question_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'participant', 'channel'], name='asistente_estado_unico')]


class AssistantDecisionCache(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    fingerprint = ExactCharField(max_length=64)
    decision = models.JSONField(default=dict)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'fingerprint'], name='asistente_decision_unica')]


class AssistantDailyUsage(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    day = models.DateField()
    attempts = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'day'], name='asistente_cupo_sede_unico')]


class AssistantTurn(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    participant = ExactCharField(max_length=64)
    channel = models.CharField(max_length=16)
    route = models.CharField(max_length=30)
    source = models.CharField(max_length=16)
    confidence = models.DecimalField(max_digits=6, decimal_places=5, null=True)
    evaluator_version = models.CharField(max_length=80, blank=True)
    model_version = models.CharField(max_length=80, blank=True)
    prompt_version = models.CharField(max_length=40, default='asistente_v1')
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    cost = models.DecimalField(max_digits=16, decimal_places=10, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
