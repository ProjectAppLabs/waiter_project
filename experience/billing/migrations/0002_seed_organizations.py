"""Numeración simulada para organizaciones anteriores a T4."""
from datetime import date
from django.db import migrations


def seed(apps, schema_editor):
    alias = schema_editor.connection.alias
    for org in apps.get_model('tenancy', 'Organization').objects.using(alias).all().iterator():
        apps.get_model('billing', 'BillingSettings').objects.using(alias).get_or_create(organization_id=org.pk)
        apps.get_model('billing', 'Resolution').objects.using(alias).get_or_create(
            organization_id=org.pk, prefix='SETP', defaults={'kind': 'pos', 'number_from': 990000000,
            'number_to': 995000000, 'next_number': 990000000, 'valid_from': date(2020,1,1),
            'valid_to': date(2099,12,31), 'technical_key': 'SIMULADO'})


class Migration(migrations.Migration):
    dependencies = [('billing', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
