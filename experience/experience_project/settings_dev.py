"""Desarrollo: DEBUG, cualquier host (la VM escucha en 192.168.56.10), sqlite local.

manage.py lo carga por defecto. Con DJANGO_ENV=staging no pisa nada: las migraciones, los comandos y las units del
fleet ven la misma configuración segura de settings.py.
"""
from .settings import *  # noqa: F401,F403

if not IS_STAGING:  # noqa: F405
    DEBUG = True
    ALLOWED_HOSTS = ['*']
