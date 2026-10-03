"""La actualización se ejecuta desde el esquema W con los datos anteriores."""
from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


# Falla si el esquema previo no migra o cambia el importe de los acuerdos y cuentas existentes.
@pytest.mark.django_db(transaction=True)
def test_migracion_real_conserva_acuerdos_y_cuentas():
    executor = MigrationExecutor(connection)
    previous = [('tenancy', '0009_precios_por_unidad_y_lineas_de_cobro')]
    latest = [('tenancy', '0011_conservar_precios_y_abrir_intervalos')]
    try:
        executor.migrate(previous)
        old = executor.loader.project_state(previous).apps
        Organization = old.get_model('tenancy', 'Organization')
        Restaurant = old.get_model('tenancy', 'Restaurant')
        Charge = old.get_model('tenancy', 'SubscriptionCharge')
        Usage = old.get_model('tenancy', 'UsageRecord')
        org = Organization.objects.create(slug='frisby', name='Frisby', monthly_price=Decimal('450000.25'))
        Organization.objects.create(slug='burger-house', name='Burger House', monthly_price=0)
        Restaurant.objects.create(organization=org, slug='centro', name='Centro')
        Usage.objects.create(organization=org, module='asistente_whatsapp', unit='pedido_asistente', quantity=2, period='2026-09', key='anterior')
        Charge.objects.create(organization=org, period='2026-09', amount=Decimal('450000.25'), due_date=date(2026, 9, 15))
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        new = executor.loader.project_state(latest).apps
        migrated = new.get_model('tenancy', 'Organization').objects.get(slug='frisby')
        assert migrated.pricing == {'mode': 'personalizado', 'local_monthly': '450000.25'}
        assert migrated.monthly_price == Decimal('450000.25') and migrated.account_credit == 0
        assert new.get_model('tenancy', 'Organization').objects.get(slug='burger-house').monthly_price == 0
        charge = new.get_model('tenancy', 'SubscriptionCharge').objects.get()
        assert charge.kind == 'mensualidad' and charge.amount == Decimal('450000.25')
        usage = new.get_model('tenancy', 'UsageRecord').objects.get(key='anterior')
        assert usage.overage == 2 and usage.unit_price == 500
        assert new.get_model('tenancy', 'RecurringPeriod').objects.filter(organization=migrated, component__startswith='local:').count() == 1
    finally:
        MigrationExecutor(connection).migrate(latest)
