"""Altas y cambios de la plataforma con auditoría y aislamiento transaccional."""
from tenancy.audit import audited
import math
from zoneinfo import ZoneInfo

from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone

from accounts.models import Account, Attendance, Session
from accounts.services import find_identity, invitation, revoke, suggested_username
from .http import payload, require, save_valid
from .models import Organization, PlatformAudit, PlatformUser, Restaurant

ORG_FIELDS = ('name', 'legal_name', 'tax_id', 'billing_email', 'billing_contact', 'plan', 'monthly_price',
              'max_restaurants', 'trial_ends', 'timezone', 'cash_tolerance', 'brand_color', 'brand_font',
              'brand_radius', 'tagline', 'logo_url', 'greeting', 'waiter_name', 'welcome', 'pricing')
RESTAURANT_FIELDS = ('slug', 'name', 'street', 'city', 'phone', 'latitude', 'longitude', 'access_margin_minutes', 'active')


def assign_values(obj, data):
    """Rechaza tipos ambiguos antes de que los campos de Django los conviertan."""
    from django.db import models
    for key, value in data.items():
        if key == 'pricing':
            continue
        field = obj._meta.get_field(key)
        if isinstance(field, models.BooleanField):
            require(type(value) is bool, 'Indica si el local está activo.', 'invalid_data', 400)
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
        if key == 'plan':
            require(value != 'inicial', 'El plan inicial está reservado; usa el plan completo.', 'invalid_data', 400)
        if key == 'plan' and value not in ('completo', 'inicial'):
            # Compatibilidad con clientes anteriores que enviaban planes de texto libre.
            value = 'completo'
        setattr(obj, key, value)
    if isinstance(obj, Organization):
        from .price_lists import customer_pricing
        if 'pricing' in data:
            customer_pricing(obj, data['pricing'])
        elif 'monthly_price' in data:
            customer_pricing(obj, {**obj.pricing, 'mode': 'personalizado', 'local_monthly': data['monthly_price']})
    return save_valid(obj)


@transaction.atomic
def audit(actor, organization, action, detail=None):
    if organization and action in ('support.enter', 'support.started', 'support.requested', 'organization.invite_resent'):
        from .models import OrganizationAudit
        from .audit import _context, ACTIONS
        context = _context.get()
        support = context and context[1]
        OrganizationAudit.objects.create(organization=organization, actor_kind='platform' if actor else 'system',
            actor_id=actor.pk if actor else None,
            actor_name=f'ProjectApp · {actor.name}' + (' (soporte)' if support else '') if actor else 'Sistema',
            action=action, entity='tenancy.organization', entity_id=str(organization.pk),
            summary=ACTIONS[action], before={}, after=detail or {})
    return PlatformAudit.objects.create(actor=actor, organization=organization, action=action, detail=detail or {})


@transaction.atomic
@audited
def create_organization(actor, data):
    data = payload(data, (*ORG_FIELDS, 'slug', 'owner'), ('name', 'slug', 'owner'))
    if 'pricing' in data or 'monthly_price' in data:
        require(actor.role == 'admin')
    if 'pricing' not in data and 'monthly_price' not in data:
        data['pricing'] = {'mode': 'estandar'}
    owner_data = payload(data.pop('owner'), ('name', 'email', 'username'), ('name', 'email'))
    organization = assign_values(Organization(), data)
    from catalog.services import seed_organization
    seed_organization(organization)
    from loyalty.services import seed_organization as seed_loyalty
    seed_loyalty(organization)
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
@audited
def update_organization(actor, organization, data):
    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    data = payload(data, ORG_FIELDS)
    if 'pricing' in data or 'monthly_price' in data:
        require(actor.role == 'admin')
    from .recurring import settle_expirations, sync_recurring
    settle_expirations(organization)
    sync_recurring(organization)
    if isinstance(data.get('plan'), str) and data['plan'] not in ('completo', 'inicial'):
        data['plan'] = 'completo'
    if 'plan' in data and data['plan'] in ('completo', 'inicial') and data['plan'] != organization.plan:
        from .modules import change_modules
        change_modules(actor, organization, {'plan': data['plan']})
    assign_values(organization, data)
    sync_recurring(organization)
    audit(actor, organization, 'organization.updated', {'fields': sorted(data)})
    return organization


@transaction.atomic
@audited
def set_suspension(actor, organization, suspended, reason=''):
    # actor=None se reserva a los comandos y servicios internos del cobro.
    require(actor is None or actor.role == 'admin')
    require(isinstance(reason, str), 'Indica el motivo de suspensión.', 'invalid_data', 400)
    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    # Al reactivar vuelve a prueba si su fecha de prueba sigue vigente; si no, activa.
    today = timezone.now().astimezone(ZoneInfo(organization.timezone)).date()
    still_trial = organization.trial_ends is not None and organization.trial_ends >= today
    organization.status = 'suspended' if suspended else 'trial' if still_trial else 'active'
    organization.suspended_at = timezone.now() if suspended else None
    organization.suspended_reason = reason if suspended else ''
    organization.suspension_by_billing = bool(suspended and actor is None and reason == 'mora')
    organization.save(update_fields=['status', 'suspended_at', 'suspended_reason', 'suspension_by_billing'])
    if suspended:
        Session.objects.filter(account__organization=organization).delete()
        Attendance.objects.filter(account__organization=organization, check_out__isnull=True).update(check_out=timezone.now())
    audit(actor, organization, 'organization.suspended' if suspended else 'organization.reactivated', {'reason': reason} if suspended else {})
    return organization


@transaction.atomic
@audited
def create_restaurant(account, data, *, source_restaurant=None):
    require(account.role == 'owner')
    organization = Organization.objects.select_for_update().get(pk=account.organization_id)
    from .modules import require_module
    if organization.restaurants.exists():
        require_module(organization, 'multisucursal')
    require(organization.restaurants.count() < organization.max_restaurants,
            'Alcanzaste el límite de restaurantes de tu plan.', 'restaurant_limit', 409)
    data = payload(data, ('name', 'slug', 'street', 'city', 'phone'), ('name', 'slug'))
    restaurant = assign_values(Restaurant(organization=organization), data)
    if source_restaurant is not None:
        from catalog.services import restaurant_for
        from sales.services import seed_restaurant
        source = restaurant_for(account, source_restaurant.pk)
        seed_restaurant(restaurant, source=source)
    return restaurant


def login_platform(data):
    data = payload(data, ('login', 'password'), ('login', 'password'))
    user = find_identity(PlatformUser.objects.all(), data['login'])
    require(user and user.activated and isinstance(data['password'], str) and check_password(data['password'], user.password),
            'El usuario o la contraseña no son correctos.', 'invalid_credentials', 401)
    with transaction.atomic():
        user = PlatformUser.objects.select_for_update().get(pk=user.pk)
        require(user.active and user.activated and check_password(data['password'], user.password),
                'La cuenta no está disponible.', 'invalid_credentials', 401)
        from .two_factor import challenge, create_session
        if user.two_factor:
            return user, None, challenge(user)
        return create_session(user)



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
