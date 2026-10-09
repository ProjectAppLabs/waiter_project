"""El correo de producción falla cerrado y respeta el TLS implícito del puerto 465 (ronda r4)."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

# Los fixtures automáticos de experience_app consultan la base de pruebas.
pytestmark = pytest.mark.django_db

EXPERIENCE = Path(__file__).resolve().parents[3]
SMTP = 'django.core.mail.backends.smtp.EmailBackend'
LEER = (
    "import json, experience_project.settings as s; o = s.MAILERS['waiter']['OPTIONS']; "
    "print(json.dumps({'backend': s.MAILERS['waiter']['BACKEND'], 'ssl': o.get('use_ssl'), 'tls': o.get('use_tls')}))"
)


def cargar(**entorno):
    """Importa la configuración en un proceso aparte, con el entorno dado, sin contaminar la de las pruebas."""
    base = {'PATH': os.environ['PATH'], 'HOME': os.environ.get('HOME', '/tmp'), 'DJANGO_SECRET_KEY': 'x' * 64,
            'DJANGO_DEBUG': 'false'}
    return subprocess.run([sys.executable, '-c', LEER], cwd=EXPERIENCE, env={**base, **entorno},
                          capture_output=True, text=True, timeout=60)


def test_produccion_sin_correo_real_no_arranca():
    """Producción no arranca si el mailer waiter no saca el correo del servidor."""
    # Falla si producción arranca con el respaldo de archivo y reporta como enviados correos que nunca salen.
    resultado = cargar(DJANGO_ENV='production')
    assert resultado.returncode != 0
    assert 'EMAIL_BACKEND' in resultado.stderr


def test_ssl_implicito_excluye_starttls():
    """EMAIL_USE_SSL enciende el TLS implícito y apaga STARTTLS."""
    # Falla si EMAIL_USE_SSL se ignora y el mailer intenta STARTTLS contra el puerto 465.
    resultado = cargar(DJANGO_ENV='production', EMAIL_BACKEND=SMTP, EMAIL_PORT='465', EMAIL_USE_SSL='true')
    assert resultado.returncode == 0, resultado.stderr
    assert json.loads(resultado.stdout) == {'backend': SMTP, 'ssl': True, 'tls': False}


def test_desarrollo_conserva_el_respaldo_de_archivo():
    """Desarrollo sigue dejando los correos en archivo."""
    # Falla si la guarda de producción rompe el desarrollo, que deja los correos en experience/mail.
    resultado = cargar()
    assert resultado.returncode == 0, resultado.stderr
    assert json.loads(resultado.stdout)['backend'] == 'django.core.mail.backends.filebased.EmailBackend'
