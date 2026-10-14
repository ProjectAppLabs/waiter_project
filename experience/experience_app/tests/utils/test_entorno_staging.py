"""Modo staging de experience: seguro por defecto y sin que manage.py lo pise (alta en el staging del fleet)."""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from django.core import signing
from django.http import HttpResponse
from django.urls import reverse

from accounts.authentication import set_cookie
from delivery.assistant import PAY_SALT

# Los fixtures automáticos de experience_app consultan la base de pruebas.
pytestmark = pytest.mark.django_db

EXPERIENCE = Path(__file__).resolve().parents[3]
ARCHIVO = 'django.core.mail.backends.filebased.EmailBackend'
SMTP = 'django.core.mail.backends.smtp.EmailBackend'
# Clave de prueba visible: cumple el largo que exige staging y no es el secreto de ningún entorno.
CLAVE_DE_PRUEBA = 'clave-de-prueba-staging-no-es-secreta-' + 'x' * 30
LLAVES_DE_PAGO = 'pruebas:' + base64.b64encode(bytes(32)).decode()
MESA = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}
# Lee los ajustes en un proceso aparte y anula load_dotenv: un .env local no puede cambiar lo que se prueba.
LEER = (
    "import dotenv, importlib, json, os; dotenv.load_dotenv = lambda *a, **k: False; "
    "m = importlib.import_module(os.environ['MODULO']); "
    "print(json.dumps({k: getattr(m, k) for k in dir(m) if k.isupper()}, default=str))"
)
SALUD = (
    "import dotenv, json; dotenv.load_dotenv = lambda *a, **k: False; import django; django.setup(); "
    "from django.test import Client; c = Client(); r = c.get('/api/health/', HTTP_HOST='127.0.0.1'); "
    "ajeno = c.get('/api/health/', HTTP_HOST='intruso.example').status_code; "
    "print(json.dumps({'estado': r.status_code, 'cuerpo': r.json(), 'ajeno': ajeno}))"
)


def cargar(modulo='experience_project.settings', codigo=LEER, **entorno):
    """Importa la configuración en un proceso aparte, con sólo el entorno dado."""
    base = {'PATH': os.environ['PATH'], 'HOME': os.environ.get('HOME', '/tmp'), 'MODULO': modulo,
            'DJANGO_SETTINGS_MODULE': modulo}
    return subprocess.run([sys.executable, '-c', codigo], cwd=EXPERIENCE, env={**base, **entorno},
                          capture_output=True, text=True, timeout=60)


def ajustes(modulo='experience_project.settings', **entorno):
    """Devuelve los ajustes en mayúsculas del módulo, cargados con el entorno dado."""
    resultado = cargar(modulo, **entorno)
    assert resultado.returncode == 0, resultado.stderr
    return json.loads(resultado.stdout)


def entorno_staging(**extra):
    """Entorno mínimo de staging (con la clave de prueba) más los extra dados."""
    return {'DJANGO_ENV': 'staging', 'DJANGO_SECRET_KEY': CLAVE_DE_PRUEBA, **extra}


def test_staging_apaga_debug_por_defecto():
    """Sin DJANGO_DEBUG, staging corre sin DEBUG."""
    # Falla si staging arranca con DEBUG encendido sin que nadie lo pida y expone trazas y configuración.
    assert ajustes(**entorno_staging())['DEBUG'] is False


@pytest.mark.parametrize('entorno', [
    {'DJANGO_ENV': 'staging'},
    {'DJANGO_ENV': 'staging', 'DJANGO_SECRET_KEY': 'change-me'},
    {'DJANGO_ENV': 'staging', 'DJANGO_SECRET_KEY': 'x' * 49},
], ids=['sin-clave', 'clave-de-ejemplo', 'clave-corta'])
def test_staging_exige_un_secreto_real(entorno):
    """Staging no arranca sin una DJANGO_SECRET_KEY real de al menos 50 caracteres."""
    # Falla si staging arranca con el secreto de ejemplo y firma con él los enlaces de domicilio y los accesos de pago.
    resultado = cargar(**entorno)
    assert resultado.returncode != 0
    assert 'DJANGO_SECRET_KEY real' in resultado.stderr


@pytest.mark.parametrize(('hosts', 'esperados'), [
    ('waiter.projectapp.co,api.waiter.projectapp.co', ['waiter.projectapp.co', 'api.waiter.projectapp.co', '127.0.0.1']),
    ('', ['127.0.0.1']),
    ('127.0.0.1,menu.waiter.projectapp.co', ['127.0.0.1', 'menu.waiter.projectapp.co']),
], ids=['hosts-publicos', 'sin-hosts', 'sin-duplicar'])
def test_staging_admite_sus_hosts_y_127_0_0_1(hosts, esperados):
    """Staging toma los hosts del entorno y suma 127.0.0.1 una sola vez."""
    # Falla si el build del POS o la sonda del fleet, que llegan por 127.0.0.1, reciben 400 en staging.
    assert ajustes(**entorno_staging(DJANGO_ALLOWED_HOSTS=hosts))['ALLOWED_HOSTS'] == esperados


def test_staging_deja_los_dos_correos_en_archivo():
    """Los remitentes default y waiter escriben en experience/mail aunque haya un SMTP configurado."""
    # Falla si un correo de staging, como la recuperación de contraseña, sale por el SMTP en vez de quedar en archivo.
    mailers = ajustes(**entorno_staging(EMAIL_HOST='smtp.example.invalid'))['MAILERS']
    assert mailers['default']['BACKEND'] == ARCHIVO
    assert mailers['waiter']['BACKEND'] == ARCHIVO
    assert mailers['default']['OPTIONS']['file_path'] == str(EXPERIENCE / 'mail')


def test_settings_dev_no_pisa_nada_en_staging():
    """manage.py carga settings_dev: en staging debe ver exactamente la misma configuración que las units."""
    # Falla si manage.py vuelve a encender DEBUG, a aceptar cualquier host o a cambiar otro ajuste en staging.
    entorno = entorno_staging(DJANGO_ALLOWED_HOSTS='waiter.projectapp.co')
    assert ajustes('experience_project.settings_dev', **entorno) == ajustes(**entorno)


def test_settings_dev_sigue_igual_en_desarrollo():
    """En desarrollo, settings_dev sólo enciende DEBUG y acepta cualquier host, como antes."""
    # Falla si el modo staging cambia el desarrollo local, que depende de DEBUG y de cualquier host (la VM).
    base = ajustes(DJANGO_DEBUG='false')
    dev = ajustes('experience_project.settings_dev', DJANGO_DEBUG='false')
    assert {clave for clave in base if base[clave] != dev[clave]} == {'DEBUG', 'ALLOWED_HOSTS'}
    assert dev['DEBUG'] is True
    assert dev['ALLOWED_HOSTS'] == ['*']


def test_produccion_no_cambia():
    """Producción conserva sus hosts, su SMTP por defecto y su DEBUG apagado."""
    # Falla si el modo staging toca producción: 127.0.0.1 agregado sin pedirlo o el remitente default fuera del SMTP.
    produccion = ajustes(DJANGO_ENV='production', DJANGO_SECRET_KEY=CLAVE_DE_PRUEBA, PAYMENTS_MASTER_KEYS=LLAVES_DE_PAGO,
                         EMAIL_BACKEND=SMTP, DJANGO_ALLOWED_HOSTS='waiter.projectapp.co')
    assert produccion['ALLOWED_HOSTS'] == ['waiter.projectapp.co']
    assert produccion['MAILERS']['default']['BACKEND'] == SMTP
    assert produccion['DEBUG'] is False
    assert produccion['IS_STAGING'] is False


def test_salud_responde_en_staging_por_127_0_0_1():
    """La sonda del fleet recibe 200 por 127.0.0.1 y un host ajeno recibe 400."""
    # Falla si /api/health/ no responde 200 a la sonda local en staging, o si staging acepta cualquier host.
    resultado = cargar(codigo=SALUD, **entorno_staging(DJANGO_ALLOWED_HOSTS='waiter.projectapp.co'))
    assert resultado.returncode == 0, resultado.stderr
    salud = json.loads(resultado.stdout.strip().splitlines()[-1])
    assert salud['estado'] == 200
    assert salud['cuerpo'] == {'status': 'ok', 'project': 'experience', 'environment': 'staging'}
    assert salud['ajeno'] == 400


@pytest.mark.parametrize(('produccion', 'staging', 'segura'), [(False, False, False), (False, True, True), (True, False, True)],
                         ids=['desarrollo', 'staging', 'produccion'])
def test_cookie_del_pos_es_segura_fuera_de_desarrollo(settings, produccion, staging, segura):
    """La cookie de sesión del POS sólo viaja por HTTPS en staging y producción."""
    # Falla si la sesión del POS viaja por HTTP en staging o producción, o si desarrollo exige HTTPS.
    settings.IS_PRODUCTION = produccion
    settings.IS_STAGING = staging
    respuesta = set_cookie(HttpResponse(), 'waiter_session', 'token-de-prueba', None)
    assert bool(respuesta.cookies['waiter_session']['secure']) is segura


@pytest.mark.parametrize(('produccion', 'staging', 'segura'), [(False, False, False), (False, True, True), (True, False, True)],
                         ids=['desarrollo', 'staging', 'produccion'])
def test_cookie_del_enlace_de_pago_es_segura_fuera_de_desarrollo(api_client, table_tenant, settings, produccion, staging,
                                                                  segura):
    """El enlace de pago por WhatsApp entrega la cookie del comensal sólo por HTTPS en staging y producción."""
    # Falla si el enlace de pago deja la identidad del comensal viajando por HTTP en staging o producción.
    settings.IS_PRODUCTION = produccion
    settings.IS_STAGING = staging
    abierta = api_client.post(reverse('open-session'), MESA, format='json', secure=segura).json()
    enlace = signing.dumps({'diner': abierta['comensal']['id'], 'session': abierta['sesion']['id']}, salt=PAY_SALT)
    respuesta = api_client.get(f'/api/v1/domicilio/pagar/{enlace}', secure=segura)
    assert respuesta.status_code == 200
    assert bool(respuesta.cookies['waiter_diner']['secure']) is segura
