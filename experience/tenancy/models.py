"""Organizaciones y acceso independiente del personal de ProjectApp."""
import uuid
from sales.policy import default_role_policy

from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from .fields import ExactCharField, only_when
from .modules import MODULE_CHOICES, PLAN_CHOICES
from .pricing import default_unit_prices

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
    tax_id_dv = models.CharField(max_length=1, blank=True, default='')
    fiscal_regime = models.CharField(max_length=20, blank=True, default='', choices=[(s, s) for s in ('responsable_iva', 'no_responsable', 'inc')])
    fiscal_responsibilities = models.JSONField(default=list, blank=True)
    address = models.CharField(max_length=250, blank=True, default='')
    city = models.CharField(max_length=120, blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    brand_logo = models.BinaryField(blank=True, default=bytes)
    brand_version = models.PositiveBigIntegerField(default=0)
    billing_email = models.EmailField(blank=True, default='')
    billing_contact = models.CharField(max_length=120, blank=True, default='')
    plan = models.CharField(max_length=40, default='completo', choices=PLAN_CHOICES)
    monthly_price = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    pricing = models.JSONField(default=dict, blank=True)
    account_credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    billing_history_starts = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=[(s, s) for s in ('trial', 'active', 'suspended')], default='trial')
    trial_ends = models.DateField(null=True, blank=True)
    max_restaurants = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    role_policy = models.JSONField(default=default_role_policy)
    signup_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    banners_configured = models.BooleanField(default=False)
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
    # Plan AS: cómo habla el mesero virtual (assistant/tones.py); el dueño lo escoge en la consola.
    assistant_tone = models.CharField(max_length=20, default='neutro')
    suspension_by_billing = models.BooleanField(default=False)
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        from django.db import transaction
        from .recurring import settle_expirations, sync_recurring
        with transaction.atomic():
            previous = type(self).objects.select_for_update().filter(pk=self.pk).first() if self.pk else None
            fields = kwargs.get('update_fields')
            commercial = {'pricing', 'monthly_price', 'plan'}
            changed = (fields is None or bool(commercial & set(fields))) and (
                previous is None or any(getattr(previous, field) != getattr(self, field) for field in commercial))
            if previous and changed:
                settle_expirations(previous)
                sync_recurring(previous)
            super().save(*args, **kwargs)
            if changed:
                sync_recurring(self)

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

    def save(self, *args, **kwargs):
        from django.db import transaction
        from .recurring import settle_expirations, sync_recurring
        with transaction.atomic():
            org = Organization.objects.select_for_update().get(pk=self.organization_id)
            settle_expirations(org)
            super().save(*args, **kwargs)
            sync_recurring(org)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'slug'], name='restaurant_org_slug_unique')]


class PlatformUser(Identity):
    two_factor = models.BooleanField(default=False)
    totp_secret = models.TextField(blank=True, default="")
    totp_pending = models.TextField(blank=True, default="")
    totp_last_step = models.BigIntegerField(default=-1)
    recovery_hashes = models.JSONField(default=list, blank=True)
    username = models.CharField(max_length=32, unique=True, validators=[validate_username])
    email = models.EmailField()
    role = models.CharField(max_length=10, choices=[('admin', 'Administrador'), ('operator', 'Operador')], default='operator')

    class Meta:
        constraints = [models.UniqueConstraint(Lower('email'), name='platform_email_unique')]


class PlatformSession(models.Model):
    user = models.ForeignKey(PlatformUser, on_delete=models.CASCADE, related_name='sessions')
    token_hash = ExactCharField(max_length=64, unique=True)
    expires = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)


class PlatformAudit(models.Model):
    actor = models.ForeignKey(PlatformUser, null=True, on_delete=models.SET_NULL)
    organization = models.ForeignKey(Organization, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=40, choices=[(s, s) for s in (
        'organization.created', 'organization.updated', 'organization.suspended', 'organization.reactivated',
        'organization.invite_resent', 'platform_user.invited', 'platform_user.deactivated',
        'subscription.created', 'subscription.paid', 'subscription.void', 'subscription.overdue',
        'two_factor.enabled', 'two_factor.disabled', 'two_factor.reset', 'support.enter', 'support.started', 'support.requested',
        'subscription.reminder', 'billing_settings.updated', 'module_change', 'pricing.updated', 'credits.granted',
    )])
    detail = models.JSONField(default=dict)
    at = models.DateTimeField(auto_now_add=True)


class LegacySource(models.Model):
    """Vincula una organización a una base de origen y evita mezclar identificadores."""
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE)
    url = models.URLField()
    database = models.CharField(max_length=200)
    company_id = models.PositiveIntegerField()


class LegacyMap(models.Model):
    """Correspondencia persistente, incluidas marcas por fila del remapeo del comensal."""
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    model = models.CharField(max_length=160)
    odoo_id = models.CharField(max_length=80)
    local_model = models.CharField(max_length=100)
    local_id = models.CharField(max_length=80)
    fingerprint = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'model', 'odoo_id'], name='legacy_org_model_id_unique')]


class PlatformSettings(models.Model):
    require_2fa = models.BooleanField(default=True)
    """Una sola configuración de cobro para ProjectApp."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    pricing = models.JSONField(default=dict, blank=True)
    unit_prices = models.JSONField(default=default_unit_prices)
    billing_day = models.PositiveSmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(31)])
    grace_days = models.PositiveSmallIntegerField(default=10)
    suspend_after_days = models.PositiveSmallIntegerField(default=15)
    reminder_days = models.PositiveSmallIntegerField(default=3)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name='platform_settings_singleton'),
                       models.CheckConstraint(condition=models.Q(billing_day__gte=1, billing_day__lte=31), name='billing_day_valid')]


class SubscriptionCharge(models.Model):
    kind = models.CharField(max_length=12, default='mensualidad', choices=[('mensualidad', 'Mensualidad'), ('recarga', 'Recarga')])
    recharge = models.JSONField(default=dict, blank=True)
    advance = models.JSONField(default=dict, blank=True)
    monthly_period = only_when(models.Q(kind='mensualidad'), 'period', models.CharField(max_length=7))
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name='subscription_charges')
    period = models.CharField(max_length=7, validators=[RegexValidator(r'^[0-9]{4}-(0[1-9]|1[0-2])$')])
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
    due_date = models.DateField()
    state = models.CharField(max_length=8, default='pending', choices=[(s, s) for s in ('pending', 'paid', 'overdue', 'void')])
    paid_at = models.DateTimeField(null=True, blank=True)
    method = models.CharField(max_length=13, blank=True, default='', choices=[(s, s) for s in ('transferencia', 'nequi', 'efectivo', 'otro')])
    reference = models.CharField(max_length=200, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    recorded_by = models.ForeignKey(PlatformUser, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    due_notice_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'monthly_period'], name='subscription_org_period_unique'),
                       models.CheckConstraint(condition=models.Q(amount__gte=0), name='subscription_amount_nonnegative')]
        indexes = [models.Index(fields=['state', 'due_date'])]


class OrganizationModule(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='module_overrides')
    restaurant = models.ForeignKey(Restaurant, null=True, blank=True, on_delete=models.CASCADE)
    key = models.CharField(max_length=32, choices=MODULE_CHOICES)
    active = models.BooleanField(default=True)
    starts = models.DateTimeField(default=timezone.now)
    ends = models.DateTimeField(null=True, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    notes = models.TextField(blank=True, default='')
    actor = models.ForeignKey(PlatformUser, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)
    organization_scope = only_when(models.Q(restaurant__isnull=True), 'organization', models.UUIDField())

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'restaurant', 'key'], name='modulo_local_unico'),
                       models.UniqueConstraint(fields=['organization_scope', 'key'], name='modulo_organizacion_unico')]


class UsageRecord(models.Model):
    allocation = models.JSONField(default=dict, blank=True)
    overage = models.DecimalField(max_digits=20, decimal_places=6, null=True)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, null=True)
    quota_scope = models.CharField(max_length=80, blank=True, default='')
    included_used = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name='usage_records')
    restaurant = models.ForeignKey(Restaurant, null=True, blank=True, on_delete=models.PROTECT)
    module = models.CharField(max_length=32, choices=MODULE_CHOICES)
    unit = models.CharField(max_length=40)
    quantity = models.DecimalField(max_digits=20, decimal_places=6, validators=[MinValueValidator(0)])
    period = models.CharField(max_length=7)
    key = ExactCharField(max_length=200)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'key'], name='uso_clave_organizacion_unica'),
                       models.CheckConstraint(condition=models.Q(quantity__gte=0), name='uso_cantidad_no_negativa')]
        indexes = [models.Index(fields=['organization', 'period'], name='uso_organizacion_periodo')]


class SubscriptionChargeLine(models.Model):
    charge = models.ForeignKey(SubscriptionCharge, on_delete=models.CASCADE, related_name='lines')
    concept = models.CharField(max_length=250)
    module = models.CharField(max_length=32, choices=MODULE_CHOICES)
    unit = models.CharField(max_length=40)
    quantity = models.DecimalField(max_digits=20, decimal_places=6, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        ordering = ['id']
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0, unit_price__gte=0),
                                               name='linea_cobro_valores_positivos')]


class PricingRevision(models.Model):
    starts = models.DateTimeField(null=True, default=timezone.now)
    pricing = models.JSONField()


class RecurringPeriod(models.Model):
    """Intervalo de actividad; el día del cambio pertenece al estado nuevo."""
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='recurring_periods')
    component = models.CharField(max_length=100)
    module = models.CharField(max_length=32)
    name = models.CharField(max_length=250)
    price = models.JSONField()
    starts = models.DateTimeField()
    ends = models.DateTimeField(null=True, blank=True)
    open_component = only_when(models.Q(ends__isnull=True), 'component', models.CharField(max_length=100))

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'open_component'], name='intervalo_abierto_unico')]


class CreditMovement(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name='credit_movements')
    module = models.CharField(max_length=32)
    unit = models.CharField(max_length=40)
    kind = models.CharField(max_length=10, choices=[(s, s) for s in ('recarga', 'cortesia', 'consumo')])
    quantity = models.DecimalField(max_digits=20, decimal_places=6)
    remaining = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reference = models.CharField(max_length=250, blank=True, default='')
    actor = models.ForeignKey(PlatformUser, null=True, on_delete=models.SET_NULL)
    charge = models.OneToOneField(SubscriptionCharge, null=True, on_delete=models.PROTECT)
    usage = models.ForeignKey(UsageRecord, null=True, on_delete=models.PROTECT)
    source = models.ForeignKey('self', null=True, on_delete=models.PROTECT)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(remaining__gte=0), name='saldo_recarga_no_negativo')]


class OrganizationAudit(models.Model):
    """Historia inmutable con identidad conservada aunque cambie el nombre de la persona."""
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    restaurant = models.ForeignKey(Restaurant, null=True, on_delete=models.SET_NULL)
    actor_kind = models.CharField(max_length=10)
    actor_id = models.PositiveBigIntegerField(null=True)
    actor_name = models.CharField(max_length=180)
    action = models.CharField(max_length=100)
    entity = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=80)
    summary = models.TextField()
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=['organization', 'at'], name='historial_organizacion_fecha')]


class TwoFactorChallenge(models.Model):
    user = models.ForeignKey(PlatformUser, on_delete=models.CASCADE)
    token_hash = ExactCharField(max_length=64, unique=True)
    expires = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)


class SupportGrant(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    requested_by = models.ForeignKey(PlatformUser, null=True, on_delete=models.PROTECT)
    approved_by = models.ForeignKey('accounts.Account', null=True, on_delete=models.PROTECT)
    reason = models.CharField(max_length=1000)
    hours = models.PositiveSmallIntegerField(default=24)
    since = models.DateTimeField(null=True)
    until = models.DateTimeField(null=True)
    state = models.CharField(max_length=10, default='pedido', choices=[(v, v) for v in ('pedido', 'vigente', 'revocado', 'vencido')])
    created_at = models.DateTimeField(default=timezone.now)


class SupportToken(models.Model):
    grant = models.ForeignKey(SupportGrant, on_delete=models.CASCADE)
    agent = models.ForeignKey(PlatformUser, on_delete=models.CASCADE)
    token_hash = ExactCharField(max_length=64, unique=True)
    expires = models.DateTimeField()


class OpeningHours(models.Model):
    """Horario de atención de una sede (semanal y fechas especiales), en la zona horaria de la organización.

    Mismo formato que el horario de reservas: `weekly` {"0".."6": [[desde, hasta], …]} en horas con medias horas y
    `overrides` [{date, ranges, note}]. Sin fila, la sede no tiene horario y se trata como siempre abierta.
    """
    restaurant = models.OneToOneField(Restaurant, on_delete=models.CASCADE, related_name='opening_hours')
    weekly = models.JSONField(default=dict)
    overrides = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)
