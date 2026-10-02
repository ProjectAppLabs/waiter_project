"""Organizaciones y acceso independiente del personal de ProjectApp."""
import uuid

from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models.functions import Lower

from .validators import validate_restaurant_slug, validate_slug, validate_timezone, validate_username


class Identity(models.Model):
    name = models.CharField(max_length=120)
    username = models.CharField(max_length=32, validators=[validate_username])
    password = models.CharField(max_length=128, default='!')
    active = models.BooleanField(default=True)
    activated = models.BooleanField(default=False)
    invite_code_hash = models.CharField(max_length=64, blank=True, default='')
    invite_expires = models.DateTimeField(null=True, blank=True)
    invite_attempts = models.PositiveSmallIntegerField(default=0)
    invite_sent_at = models.DateTimeField(null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.CharField(max_length=40, unique=True, validators=[validate_slug])
    name = models.CharField(max_length=120)
    legal_name = models.CharField(max_length=200, blank=True, default='')
    tax_id = models.CharField(max_length=40, blank=True, default='')
    billing_email = models.EmailField(blank=True, default='')
    billing_contact = models.CharField(max_length=120, blank=True, default='')
    plan = models.CharField(max_length=40, default='basico')
    monthly_price = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=12, choices=[(s, s) for s in ('trial', 'active', 'suspended')], default='trial')
    trial_ends = models.DateField(null=True, blank=True)
    max_restaurants = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    cash_tolerance = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    timezone = models.CharField(max_length=64, default='America/Bogota', validators=[validate_timezone])
    brand_color = models.CharField(max_length=7, default='#C1873A', validators=[RegexValidator(r'^#[0-9a-fA-F]{6}$')])
    brand_font = models.CharField(max_length=40, default='Instrument Serif')
    brand_radius = models.PositiveSmallIntegerField(default=14)
    tagline = models.CharField(max_length=80, blank=True, default='')
    logo_url = models.URLField(blank=True, default='')
    greeting = models.CharField(max_length=60, blank=True, default='')
    waiter_name = models.CharField(max_length=40, blank=True, default='')
    welcome = models.CharField(max_length=140, blank=True, default='')
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(max_restaurants__gte=1), name='organization_restaurants_positive')]


class Restaurant(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='restaurants')
    slug = models.CharField(max_length=40, validators=[validate_restaurant_slug])
    name = models.CharField(max_length=120)
    street = models.CharField(max_length=250, blank=True, default='')
    city = models.CharField(max_length=120, blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    access_margin_minutes = models.PositiveIntegerField(default=30)
    active = models.BooleanField(default=True)
    legacy_odoo_config_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'slug'], name='restaurant_org_slug_unique')]


class PlatformUser(Identity):
    username = models.CharField(max_length=32, unique=True, validators=[validate_username])
    email = models.EmailField()
    role = models.CharField(max_length=10, choices=[('admin', 'Administrador'), ('operator', 'Operador')], default='operator')

    class Meta:
        constraints = [models.UniqueConstraint(Lower('email'), name='platform_email_unique')]


class PlatformSession(models.Model):
    user = models.ForeignKey(PlatformUser, on_delete=models.CASCADE, related_name='sessions')
    token_hash = models.CharField(max_length=64, unique=True)
    expires = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)


class PlatformAudit(models.Model):
    actor = models.ForeignKey(PlatformUser, null=True, on_delete=models.SET_NULL)
    organization = models.ForeignKey(Organization, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=40, choices=[(s, s) for s in (
        'organization.created', 'organization.updated', 'organization.suspended', 'organization.reactivated',
        'organization.invite_resent', 'platform_user.invited', 'platform_user.deactivated',
    )])
    detail = models.JSONField(default=dict)
    at = models.DateTimeField(auto_now_add=True)
