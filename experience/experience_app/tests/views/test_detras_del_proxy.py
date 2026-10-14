"""Detrás de nginx y de Next: la IP del cliente para los límites de intentos y la dirección pública de experience."""
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import RequestFactory
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from accounts.universal import client_ip, throttle_keys
from experience_app.tests.conftest import TABLE
from experience_app.tests.views.test_smart_menu import client_for
from sales.services import seed_organization, seed_restaurant
from tenancy.models import Organization, Restaurant

pytestmark = pytest.mark.django_db

PEDIDO = RequestFactory()
ADMIN = '/api/pos/v1/admin/'
# La IP que agrega nginx al final de X-Forwarded-For y las que puede inventar el cliente delante.
REAL, OTRA_REAL = '203.0.113.7', '198.51.100.4'


def detras(remote, cadena=None):
    """Una petición que llega a gunicorn desde `remote`, con la X-Forwarded-For dada."""
    return PEDIDO.get('/', REMOTE_ADDR=remote, **({'HTTP_X_FORWARDED_FOR': cadena} if cadena is not None else {}))


def dueno_del_pos():
    """La sede y su dueña con la sesión del POS abierta, como `admin_client` de test_core."""
    org = Organization.objects.create(slug='la-casa', name='La casa', status='active')
    venue = Restaurant.objects.create(organization=org, slug='centro', name='Centro')
    seed_organization(org)
    seed_restaurant(venue)
    Account.objects.create(organization=org, username='duena', name='Dueña', role='owner', activated=True,
                           password=make_password('Clave-2026'))
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    response = client.post('/api/pos/v1/auth/login', {'login': 'duena', 'password': 'Clave-2026', 'restaurant_id': venue.pk}, format='json')
    assert response.status_code == 200, response.data
    return client


# Falla si detrás del proxy se toma la primera entrada de X-Forwarded-For (la escribe el cliente) en vez de la última (la
# agrega nginx), o si ::1 o un socket unix (sin dirección) no cuentan como un proxy de esta máquina.
@pytest.mark.parametrize('remote', ['127.0.0.1', '::1', ''])
def test_detras_del_proxy_vale_la_ultima_entrada(remote):
    """La última entrada no vacía de X-Forwarded-For es la IP del cliente; sin cabecera, la de la conexión."""
    assert client_ip(detras(remote, f'10.6.6.6, {REAL}')) == REAL
    assert client_ip(detras(remote, f'{REAL}, ')) == REAL
    assert client_ip(detras(remote)) == remote


# Falla si una conexión que no viene de esta máquina puede elegir su IP mandando X-Forwarded-For.
def test_sin_proxy_local_la_cabecera_no_se_cree():
    """Sin un proxy de esta máquina delante vale la IP de la conexión, diga lo que diga la cabecera."""
    assert client_ip(detras(OTRA_REAL, REAL)) == OTRA_REAL


# Falla si cambiar la primera entrada de X-Forwarded-For le da a quien adivina contraseñas un contador nuevo en el inicio
# de sesión universal, o si dos clientes distintos detrás del proxy comparten el contador de IP.
def test_el_inicio_universal_cuenta_por_la_ip_real():
    """Las claves de límite del inicio universal sólo dependen de la IP que agregó nginx."""
    def llaves(cadena):
        """Las claves de límite de un intento con esa X-Forwarded-For."""
        return throttle_keys(detras('127.0.0.1', cadena), 'ana')
    assert llaves(f'10.1.1.1, {REAL}') == llaves(f'10.2.2.2, {REAL}')
    assert llaves(f'10.1.1.1, {REAL}')['ip'] != llaves(f'10.1.1.1, {OTRA_REAL}')['ip']


def entrar(client, real, inventada):
    """Un intento fallido de entrar a la cuenta del comensal desde `real`, con una entrada inventada delante."""
    return client.post(reverse('account-login'), {'correo': 'Ana@example.com', 'clave': 'no es la clave'}, format='json',
                       REMOTE_ADDR='127.0.0.1', HTTP_X_FORWARDED_FOR=f'{inventada}, {real}')


# Falla si el límite de intentos del comensal mete a todos los clientes detrás del proxy en un solo contador (127.0.0.1),
# lo que deja a un tercero bloquear la cuenta de otro, o si un cliente lo esquiva cambiando la entrada inventada.
def test_el_login_del_comensal_cuenta_por_cliente():
    """Cinco fallos frenan a ese cliente aunque cambie la entrada inventada; otro cliente sigue pudiendo intentar."""
    cache.clear()
    ana, _ = client_for()
    beto, _ = client_for('Beto')
    for intento in range(5):
        assert entrar(ana, REAL, f'10.0.0.{intento}').status_code == 400
    assert entrar(ana, REAL, '10.0.0.99').status_code == 429
    assert entrar(beto, OTRA_REAL, '10.0.0.1').status_code == 400


def pedir_enlace(client, real, inventada):
    """Pide el enlace de recuperación de la cuenta de Ana desde `real`, con una entrada inventada delante."""
    return client.post(reverse('account-reset-request'), {'correo': 'Ana@example.com'}, format='json',
                       REMOTE_ADDR='127.0.0.1', HTTP_X_FORWARDED_FOR=f'{inventada}, {real}')


# Falla si el freno de los enlaces de recuperación mete a todos los clientes detrás del proxy en un solo contador o si un
# cliente lo esquiva cambiando la entrada inventada de X-Forwarded-For.
def test_el_enlace_de_recuperacion_frena_por_cliente(settings):
    """Un segundo pedido del mismo cliente espera; el de otro cliente sale."""
    settings.DINER_EMAIL_ENABLED = True
    settings.MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}
    cache.clear()
    ana, _ = client_for()
    beto, _ = client_for('Beto')
    with patch('experience_app.views.password_reset.resolve', return_value=TABLE):
        assert pedir_enlace(ana, REAL, '10.0.0.1').status_code == 200
        assert pedir_enlace(ana, REAL, '10.0.0.2').status_code == 429
        assert pedir_enlace(beto, OTRA_REAL, '10.0.0.1').status_code == 200


# Falla si en staging o producción, sin PAYMENTS_PUBLIC_URL, el POS recibe como dirección de experience la del rewrite de
# Next (127.0.0.1:8107) y arma con ella el conector de la IA, en vez de una dirección vacía que dice «sin configurar».
@pytest.mark.parametrize('entorno', ['IS_STAGING', 'IS_PRODUCTION'])
def test_sin_url_publica_el_mcp_queda_sin_configurar(settings, entorno):
    """La lista y la clave nueva traen mcpUrl vacía, los ajustes del menú experienceUrl vacía y la clave se entrega igual."""
    client = dueno_del_pos()
    settings.PAYMENTS_PUBLIC_URL = ''
    setattr(settings, entorno, True)
    claves = client.post(ADMIN + 'mcp_keys', {'action': 'list'}, format='json')
    nueva = client.post(ADMIN + 'mcp_keys', {'action': 'create', 'nombre': 'Claude'}, format='json')
    ajustes = client.post(ADMIN + 'menu_settings', {'action': 'get'}, format='json')
    assert (claves.status_code, nueva.status_code, ajustes.status_code) == (200, 200, 200)
    assert (claves.data['mcpUrl'], nueva.data['mcpUrl'], ajustes.data['experienceUrl']) == ('', '', '')
    assert nueva.data['clave'].startswith('wtr_')


# Falla si en desarrollo se pierde la dirección de la petición (el conector de la IA quedaría vacío en la VM) o si, con
# PAYMENTS_PUBLIC_URL, staging no la usa para el MCP y para experience.
def test_la_url_del_mcp_sale_del_host_en_desarrollo_y_de_la_publica_si_existe(settings):
    """En desarrollo vale el Host; en staging, PAYMENTS_PUBLIC_URL."""
    client = dueno_del_pos()
    settings.IS_PRODUCTION = settings.IS_STAGING = False
    settings.PAYMENTS_PUBLIC_URL = ''
    assert client.post(ADMIN + 'mcp_keys', {'action': 'list'}, format='json').data['mcpUrl'] == 'http://testserver/mcp/'
    settings.IS_STAGING = True
    settings.PAYMENTS_PUBLIC_URL = 'https://api.waiter.projectapp.co'
    assert client.post(ADMIN + 'mcp_keys', {'action': 'list'}, format='json').data['mcpUrl'] == 'https://api.waiter.projectapp.co/mcp/'
    assert client.post(ADMIN + 'menu_settings', {'action': 'get'}, format='json').data['experienceUrl'] == 'https://api.waiter.projectapp.co'
