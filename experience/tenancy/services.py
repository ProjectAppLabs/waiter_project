"""Altas y cambios de la plataforma con auditoría y aislamiento transaccional."""
import math
from datetime import timedelta
import secrets

from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone

from accounts.models import Account, Attendance, Session
from accounts.services import digest, find_identity, invitation, revoke, suggested_username
from .http import payload, require, save_valid
from .models import Organization, PlatformAudit, PlatformSession, PlatformUser, Restaurant

ORG_FIELDS = ('name', 'legal_name', 'tax_id', 'billing_email', 'billing_contact', 'plan', 'monthly_price',
              'max_restaurants', 'trial_ends', 'timezone', 'cash_tolerance', 'brand_color', 'brand_font',
              'brand_radius', 'tagline', 'logo_url', 'greeting', 'waiter_name', 'welcome')
RESTAURANT_FIELDS = ('slug', 'name', 'street', 'city', 'phone', 'latitude', 'longitude', 'access_margin_minutes')


def assign_values(obj, data):
    """Rechaza tipos ambiguos antes de que los campos de Django los conviertan."""
    from django.db import models
    for key, value in data.items():
        field = obj._meta.get_field(key)
        if isinstance(field, models.CharField):
            require(isinstance(value, str), 'Indica un texto válido.', 'invalid_data', 400)
            value = value.strip()
        if isinstance(field, (models.IntegerField, models.FloatField, models.DecimalField)) and value is not None:
            require(type(value) in (int, float) and math.isfinite(value), 'Indica un número válido.', 'invalid_data', 400)
            if isinstance(field, models.IntegerField):
                require(type(value) is int, 'Indica un número entero.', 'invalid_data', 400)
        if key == 'trial_ends':
            require(value is None or isinstance(value, str), 'Indica una fecha ISO válida.', 'invalid_data', 400)
        if key in ('latitude', 'longitude') and value is not None:
            require(abs(value) <= (90 if key == 'latitude' else 180), 'Las coordenadas no son válidas.', 'invalid_data', 400)
        if key == 'access_margin_minutes':
            require(type(value) is int and value >= 0, 'El margen de acceso debe ser un entero no negativo.', 'invalid_data', 400)
        setattr(obj, key, value)
    return save_valid(obj)


def audit(actor, organization, action, detail=None):
    return PlatformAudit.objects.create(actor=actor, organization=organization, action=action, detail=detail or {})


@transaction.atomic
def create_organization(actor, data):
    data = payload(data, (*ORG_FIELDS, 'slug', 'owner'), ('name', 'slug', 'owner'))
    owner_data = payload(data.pop('owner'), ('name', 'email', 'username'), ('name', 'email'))
    organization = assign_values(Organization(), data)
    from catalog.services import seed_organization
    seed_organization(organization)
    # Con fecha de prueba nace en prueba; sin ella, activa (lo que promete el asistente de la consola).
    organization.status = 'trial' if organization.trial_ends else 'active'
    organization.save(update_fields=['status'])
    for key in owner_data:
        require(isinstance(owner_data[key], str) and bool(owner_data[key].strip()), 'Completa los datos del dueño.', 'invalid_data', 400)
        owner_data[key] = owner_data[key].strip()
    owner_data['email'] = owner_data['email'].lower()
    owner_data.setdefault('username', suggested_username(owner_data['name'], Account.objects.filter(organization=organization)))
    owner = save_valid(Account(organization=organization, role='owner', **owner_data))
    sent = invitation(owner)
    audit(actor, organization, 'organization.created', {'owner_id': owner.id, 'invite_sent': sent})
    return organization, sent


@transaction.atomic
def update_organization(actor, organization, data):
    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    data = payload(data, ORG_FIELDS)
    assign_values(organization, data)
    audit(actor, organization, 'organization.updated', {'fields': sorted(data)})
    return organization


@transaction.atomic
def set_suspension(actor, organization, suspended, reason=''):
    require(actor.role == 'admin')
    require(isinstance(reason, str), 'Indica el motivo de suspensión.', 'invalid_data', 400)
    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    # Al reactivar vuelve a prueba si su fecha de prueba sigue vigente; si no, activa.
    still_trial = organization.trial_ends is not None and organization.trial_ends >= timezone.localdate()
    organization.status = 'suspended' if suspended else 'trial' if still_trial else 'active'
    organization.suspended_at = timezone.now() if suspended else None
    organization.suspended_reason = reason if suspended else ''
    organization.save(update_fields=['status', 'suspended_at', 'suspended_reason'])
    if suspended:
        Session.objects.filter(account__organization=organization).delete()
        Attendance.objects.filter(account__organization=organization, check_out__isnull=True).update(check_out=timezone.now())
    audit(actor, organization, 'organization.suspended' if suspended else 'organization.reactivated', {'reason': reason} if suspended else {})
    return organization


@transaction.atomic
def create_restaurant(account, data):
    require(account.role == 'owner')
    organization = Organization.objects.select_for_update().get(pk=account.organization_id)
    require(organization.restaurants.count() < organization.max_restaurants,
            'Alcanzaste el límite de restaurantes de tu plan.', 'restaurant_limit', 409)
    data = payload(data, ('name', 'slug', 'street', 'city', 'phone'), ('name', 'slug'))
    return assign_values(Restaurant(organization=organization), data)


def login_platform(data):
    data = payload(data, ('login', 'password'), ('login', 'password'))
    user = find_identity(PlatformUser.objects.all(), data['login'])
    require(user and user.activated and isinstance(data['password'], str) and check_password(data['password'], user.password),
            'El usuario o la contraseña no son correctos.', 'invalid_credentials', 401)
    with transaction.atomic():
        user = PlatformUser.objects.select_for_update().get(pk=user.pk)
        require(user.active and user.activated and check_password(data['password'], user.password),
                'La cuenta no está disponible.', 'invalid_credentials', 401)
        token = secrets.token_hex(32)
        session = PlatformSession.objects.create(user=user, token_hash=digest(token), expires=timezone.now()+timedelta(hours=12))
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
    return user, session, token


@transaction.atomic
def invite_platform_user(actor, data):
    require(actor.role == 'admin')
    data = payload(data, ('name', 'email', 'username', 'role'), ('name', 'email', 'role'))
    require(isinstance(data['name'], str) and isinstance(data['email'], str), 'Completa nombre y correo.', 'invalid_data', 400)
    data['email'] = data['email'].strip().lower()
    data.setdefault('username', suggested_username(data['name'], PlatformUser.objects.all()))
    user = assign_values(PlatformUser(), data)
    sent = invitation(user)
    audit(actor, None, 'platform_user.invited', {'user_id': user.id, 'invite_sent': sent})
    return user, sent


@transaction.atomic
def deactivate_platform_user(actor, user):
    require(actor.role == 'admin')
    require(actor.pk != user.pk, 'No puedes desactivar tu propia cuenta.', 'invalid_data', 400)
    user = PlatformUser.objects.select_for_update().get(pk=user.pk)
    user.active, user.invite_code_hash, user.invite_expires = False, '', None
    user.save(update_fields=['active', 'invite_code_hash', 'invite_expires'])
    revoke(user)
    audit(actor, None, 'platform_user.deactivated', {'user_id': user.id})
