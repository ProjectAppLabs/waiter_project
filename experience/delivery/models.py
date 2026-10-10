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
    # Cómo se cobra el envío: por distancia (tramos), tarifa fija o gratis. `free_from`: gratis desde ese valor de platos
    # (0 = no aplica). `markup_percent`: recargo en los platos de los pedidos a domicilio (para ofrecer envío gratis); el
    # comensal ve esos precios desde que escoge «A domicilio».
    fee_mode = models.CharField(max_length=10, default='distance', choices=[(m, m) for m in ('distance', 'flat', 'free')])
    flat_fee = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    free_from = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    markup_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)


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
    # Líneas del pedido que ya llevan el recargo de domicilio: si el pedido recibe más platos, no se recargan dos veces.
    marked_lines = models.JSONField(default=list)


class SearchUsage(models.Model):
    session = models.ForeignKey('experience_app.TableSession', on_delete=models.CASCADE)
    day = models.DateField()
    searches = models.PositiveSmallIntegerField(default=0)
    # Lecturas de la dirección aproximada al soltar el pin del mapa.
    reverses = models.PositiveSmallIntegerField(default=0)
    # Sugerencias de dirección mientras se escribe.
    suggests = models.PositiveSmallIntegerField(default=0)

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
    # Plan D: el pedido completo por WhatsApp. La sede que atiende la ubicación, los platos escogidos en la conversación,
    # el paso en que va (nombre, teléfono, indicaciones, pago) y los datos de entrega; la visita se crea al resumir.
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.SET_NULL, null=True)
    cart = models.JSONField(default=list)
    step = models.CharField(max_length=20, blank=True, default='')
    name = models.CharField(max_length=120, blank=True, default='')
    phone = models.CharField(max_length=13, blank=True, default='')
    details = models.CharField(max_length=200, blank=True, default='')
    session = models.ForeignKey('experience_app.TableSession', on_delete=models.SET_NULL, null=True)


class MapsUsage(models.Model):
    """Consultas pagas a Google Maps por organización y día (gasto de ProjectApp, no se le cobra al restaurante)."""
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE)
    day = models.DateField()
    kind = models.CharField(max_length=20)  # geocoding, autocompletar, lugar
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'day', 'kind'], name='delivery_maps_usage_unico')]
