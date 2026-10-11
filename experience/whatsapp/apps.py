"""Configuración de la integración y protección del registro HTTP de diagnóstico."""
import logging

from django.apps import AppConfig


class RegistroSeguroMeta(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        # urllib3 registra la URL completa en DEBUG, incluido el secreto del intercambio OAuth.
        if any(key in message for key in ('oauth/access_token', 'client_secret', 'hub.verify_token')):
            record.msg = 'Petición de verificación de WhatsApp: detalles reservados.'
            record.args = ()
        return True


class WhatsAppConfig(AppConfig):
    name = 'whatsapp'
    verbose_name = 'WhatsApp'

    def ready(self):
        logging.getLogger('urllib3.connectionpool').addFilter(RegistroSeguroMeta())
