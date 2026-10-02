import pytest


@pytest.fixture(autouse=True)
def correo(settings):
    settings.MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'},
                       'waiter': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
