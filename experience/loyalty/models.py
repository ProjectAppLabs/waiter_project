"""Clientes y beneficios compartidos por organización, con movimientos auditables."""

import secrets

from django.db import models

from catalog.models import Owned, choices, decimal
from tenancy.fields import ExactCharField


def card_code():
    return secrets.token_hex(4).upper()


ID_TYPES = [
    ("CC", "Cédula de ciudadanía"),
    ("CE", "Cédula de extranjería"),
    ("NIT", "NIT"),
    ("PAS", "Pasaporte"),
    ("TI", "Tarjeta de identidad"),
    ("PEP", "Permiso especial de permanencia"),
]


class Customer(Owned):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40, blank=True, default="")
    normalized_phone = ExactCharField(max_length=13, null=True, blank=True)
    data_consent_at = models.DateTimeField(null=True, blank=True)
    data_consent_channel = models.CharField(max_length=8, blank=True, default='')
    data_consent_version = models.CharField(max_length=40, blank=True, default='')
    data_consent_revoked_at = models.DateTimeField(null=True, blank=True)
    email = models.EmailField(blank=True, default="")
    id_type = models.CharField(max_length=3, choices=ID_TYPES, default="CC")
    vat = models.CharField(max_length=40, blank=True, default="")
    street = models.CharField(max_length=250, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    diner_key = models.UUIDField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        from .delivery import phone
        self.normalized_phone = phone(self.phone, required=False)
        if kwargs.get('update_fields') and 'phone' in kwargs['update_fields']:
            kwargs['update_fields'] = [*kwargs['update_fields'], 'normalized_phone']
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "diner_key"], name="customer_org_diner_unique"),
                       models.UniqueConstraint(fields=['organization', 'normalized_phone'], name='customer_org_phone_unique')]


class LoyaltyProgram(models.Model):
    organization = models.OneToOneField("tenancy.Organization", on_delete=models.CASCADE)
    name = models.CharField(max_length=120, default="Puntos Waiter")
    spend_per_point = decimal(1000)
    value_per_point = decimal(100)
    minimum_points = decimal(10)
    active = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(spend_per_point__gt=0, value_per_point__gt=0, minimum_points__gte=1),
                name="loyalty_program_positive",
            )
        ]


class LoyaltyCard(Owned):
    customer = models.OneToOneField(Customer, on_delete=models.PROTECT, related_name="card")
    code = models.CharField(max_length=8, default=card_code)
    points = decimal()
    expires = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="card_org_code_unique"),
            models.CheckConstraint(condition=models.Q(points__gte=0), name="card_points_nonnegative"),
        ]


class LoyaltyMove(Owned):
    card = models.ForeignKey(LoyaltyCard, on_delete=models.PROTECT, related_name="moves")
    kind = models.CharField(max_length=8, choices=choices("earn", "redeem", "reserve", "release", "grant", "reversal"))
    points = models.DecimalField(max_digits=18, decimal_places=6)
    order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, null=True, blank=True)
    key = ExactCharField(max_length=160)
    description = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "key"], name="loyalty_move_org_key_unique")]


class Coupon(Owned):
    name = models.CharField(max_length=80)
    code = models.CharField(max_length=32)
    percent = decimal()
    minimum = decimal()
    start = models.DateField(null=True, blank=True)
    end = models.DateField(null=True, blank=True)
    active = models.BooleanField(default=True)
    restaurants = models.ManyToManyField("tenancy.Restaurant", blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="coupon_org_code_unique"),
            models.CheckConstraint(
                condition=models.Q(percent__gte="0.01", percent__lte=100), name="coupon_percent_range"
            ),
        ]


class BenefitAction(Owned):
    action = models.CharField(max_length=14, choices=choices("cuenta", "opinion", "novedades", "pago_en_linea"))
    active = models.BooleanField(default=False)
    reward = models.CharField(max_length=9, choices=choices("descuento", "cupon", "puntos"), default="descuento")
    percent = decimal(5)
    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, null=True, blank=True)
    points = models.PositiveIntegerField(default=10)
    restaurants = models.ManyToManyField("tenancy.Restaurant", blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "action"], name="benefit_org_action_unique")]


class BenefitGrant(Owned):
    key = ExactCharField(max_length=160)
    card = models.ForeignKey(LoyaltyCard, on_delete=models.PROTECT)
    points = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "key"], name="grant_org_key_unique"),
            models.CheckConstraint(condition=models.Q(points__gt=0), name="grant_positive"),
        ]


class Banner(Owned):
    sequence = models.PositiveSmallIntegerField(default=0)
    layout = models.CharField(max_length=9, choices=choices("product", "promotion", "category", "image", "notice"))
    title = models.CharField(max_length=80)
    subtitle = models.CharField(max_length=160, blank=True, default="")
    button = models.CharField(max_length=35, blank=True, default="")
    target = models.CharField(max_length=8, choices=choices("product", "category", "none"))
    target_id = models.PositiveBigIntegerField(null=True, blank=True)
    image = models.FileField(max_length=300, blank=True, default="")
    theme = models.CharField(max_length=6, choices=choices("violet", "amber", "dark"))
    active = models.BooleanField(default=True)
    restaurants = models.ManyToManyField("tenancy.Restaurant", blank=True)

    class Meta:
        ordering = ["sequence", "id"]


class CustomerAddress(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='addresses')
    label = models.CharField(max_length=60, default='Casa')
    text = models.CharField(max_length=300)
    details = models.CharField(max_length=200, blank=True, default='')
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    # Identificador del lugar en Google (sus términos permiten conservarlo); las coordenadas son las del pin del cliente.
    place_id = models.CharField(max_length=255, blank=True, default='')
    last_used_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CustomerDinerIdentity(Owned):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    key = models.UUIDField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'key'], name='customer_diner_identity_unique')]


class CustomerCookieIdentity(Owned):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    key = ExactCharField(max_length=64)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'key'], name='customer_cookie_identity_unique')]
