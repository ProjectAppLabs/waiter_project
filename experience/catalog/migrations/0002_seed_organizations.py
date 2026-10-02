"""Siembra T1 para las organizaciones que ya existían al cerrar T0."""
from django.db import migrations


def seed(apps, schema_editor):
    alias = schema_editor.connection.alias
    Organization = apps.get_model('tenancy', 'Organization')
    Unit = apps.get_model('catalog', 'Unit')
    Tax = apps.get_model('catalog', 'Tax')
    Revision = apps.get_model('catalog', 'CatalogRevision')
    units = [('kg', 'weight', 1), ('g', 'weight', '0.001'), ('L', 'volume', 1), ('ml', 'volume', '0.001'),
             ('Unidades', 'count', 1), ('Manojo', 'count', 1), ('Diente', 'count', 1), ('Rebanada', 'count', 1)]
    for org in Organization.objects.using(alias).iterator():
        for name, root, factor in units:
            Unit.objects.using(alias).get_or_create(organization_id=org.pk, name=name, defaults={'root': root, 'factor': factor})
        for name, amount in [('INC 8 %', 8), ('IVA 19 %', 19)]:
            Tax.objects.using(alias).get_or_create(organization_id=org.pk, name=name, defaults={'amount': amount, 'included': True})
        Revision.objects.using(alias).get_or_create(organization_id=org.pk)


class Migration(migrations.Migration):
    dependencies = [('catalog', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
