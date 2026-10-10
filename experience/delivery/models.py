"""Cobertura, cotizaciones de la visita y enlaces de ubicación por conversación."""
from django.db import models
from tenancy.fields import ExactCharField


def tiers_default():
    return [{'up_to_km': '5', 'fee': '0'}]


def methods_default():
    return ['cash']


class DeliverySettings(models.Model):
    restaurant = models.OneToOneField('tenancy.Restaurant', on_delete=models.CASCADE, related_name='delivery_settings')
    enabled = models.BooleanField(default=False)
    radius_km = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    tiers = models.JSONField(default=tiers_default)
    min_order = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    methods = models.JSONField(default=methods_default)
    notes = models.CharField(max_length=200, blank=True, default='')


class SessionDelivery(models.Model):
    session = models.OneToOneField('experience_app.TableSession', on_delete=models.CASCADE, related_name='delivery')
    diner = models.ForeignKey('experience_app.Diner', on_delete=models.CASCADE)
    customer = models.ForeignKey('loyalty.Customer', on_delete=models.SET_NULL, null=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    address = models.CharField(max_length=300)
    details = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=13)
    name = models.CharField(max_length=120)
    fee = models.DecimalField(max_digits=16, decimal_places=2)
    distance_km = models.DecimalField(max_digits=8, decimal_places=3)
    payment = models.CharField(max_length=20, blank=True, default='')


class SearchUsage(models.Model):
    session = models.ForeignKey('experience_app.TableSession', on_delete=models.CASCADE)
    day = models.DateField()
    searches = models.PositiveSmallIntegerField(default=0)
    # Lecturas de la dirección aproximada al soltar el pin del mapa.
    reverses = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['session', 'day'], name='delivery_search_session_day')]


class DeliveryLink(models.Model):
    conversation = models.ForeignKey('whatsapp.WhatsAppConversation', on_delete=models.CASCADE)
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    nonce = ExactCharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True)
    result = models.JSONField(default=dict)


class ConversationDelivery(models.Model):
    conversation = models.OneToOneField('whatsapp.WhatsAppConversation', on_delete=models.CASCADE)
    # Dato operativo temporal; el perfil y las direcciones se crean solo tras «Acepto».
    location = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
