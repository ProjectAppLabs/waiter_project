"""Siembra clientes y programas también en las organizaciones anteriores a T3."""
from django.db import migrations


def seed(apps, schema_editor):
    Organization = apps.get_model('tenancy', 'Organization')
    Customer = apps.get_model('loyalty', 'Customer')
    Program = apps.get_model('loyalty', 'LoyaltyProgram')
    alias = schema_editor.connection.alias
    for org in Organization.objects.using(alias).all().iterator():
        Customer.objects.using(alias).get_or_create(organization_id=org.pk, vat='222222222222',
            defaults={'name': 'Consumidor final', 'id_type': 'CC'})
        Program.objects.using(alias).get_or_create(organization_id=org.pk,
            defaults={'name': 'Puntos Waiter', 'active': False})


class Migration(migrations.Migration):
    dependencies = [('loyalty', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
