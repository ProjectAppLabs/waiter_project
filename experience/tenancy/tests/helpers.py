"""Fábricas pequeñas compartidas por las pruebas del contrato T0."""
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from accounts.models import Account
from tenancy.models import Organization, PlatformUser, Restaurant

PASSWORD = 'contraseña-segura'


def organization(slug='burger-house', **kwargs):
    return Organization.objects.create(slug=slug, name='Burger House', **kwargs)


def restaurant(org, slug='centro', **kwargs):
    return Restaurant.objects.create(organization=org, slug=slug, name=slug.title(), **kwargs)


def account(org, role='owner', username='dueno', restaurants=(), **kwargs):
    defaults = dict(name=username.title(), email=f'{username}@ejemplo.co', password=make_password(PASSWORD), activated=True)
    defaults.update(kwargs)
    person = Account.objects.create(organization=org, username=username, role=role, **defaults)
    person.restaurants.set(restaurants)
    return person


def platform_user(role='admin', username='projectapp', **kwargs):
    defaults = dict(name='ProjectApp', email=f'{username}@projectapp.co', password=make_password(PASSWORD), activated=True)
    defaults.update(kwargs)
    return PlatformUser.objects.create(username=username, role=role, **defaults)


def pos_client(person):
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=person.organization.slug)
    response = client.post('/api/pos/v1/auth/login', {'login': person.username, 'password': PASSWORD}, format='json')
    assert response.status_code == 200, response.data
    return client


def platform_client(user):
    # Las pruebas anteriores de negocio ejercen permisos sin exigir el alta de TOTP en cada caso.
    # Las pruebas de seguridad Y usan el login real y la configuración obligatoria por omisión.
    from tenancy.models import PlatformSettings
    PlatformSettings.objects.update_or_create(pk=1, defaults={'require_2fa': False})
    client = APIClient()
    response = client.post('/api/platform/v1/auth/login', {'login': user.username, 'password': PASSWORD}, format='json')
    assert response.status_code == 200, response.data
    return client
