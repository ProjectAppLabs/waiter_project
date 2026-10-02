"""Configuración común de pytest para todo experience."""
import pytest


@pytest.fixture(autouse=True)
def _odoo_orgs_fijo(settings):
    # Las pruebas no heredan el .env de desarrollo: tras el corte de T6 ese .env deja ODOO_ORGS vacío, pero la suite
    # sigue probando el camino de Odoo de Burger House con su cliente simulado. Las que prueban el sistema propio usan
    # otras organizaciones o fijan ODOO_ORGS por su cuenta.
    settings.ODOO_ORGS = 'burger-house'
