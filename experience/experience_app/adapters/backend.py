"""Selección única del motor; el cliente legado se inyecta para conservar sus pruebas."""
from django.conf import settings


def backend_for(org_slug):
    configured = settings.ODOO_ORGS
    organizations = configured.split(',') if isinstance(configured, str) else configured
    if org_slug in {value.strip() for value in organizations}:
        from .odoo import pos
    else:
        from .core import pos
    return pos


def client_for(tenant, legacy_client=None):
    backend = backend_for(tenant.restaurant_slug)
    if hasattr(backend, 'Client'):
        return backend.Client(tenant)
    if legacy_client is None:
        from .odoo.client import OdooClient
        legacy_client = OdooClient
    return legacy_client(tenant.odoo)
