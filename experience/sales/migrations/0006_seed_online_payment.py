"""Siembra el método del menú para las organizaciones existentes."""
from django.db import migrations


def seed(apps, schema_editor):
    Organization = apps.get_model('tenancy', 'Organization')
    Method = apps.get_model('sales', 'PaymentMethod')
    for org in Organization.objects.using(schema_editor.connection.alias).iterator():
        Method.objects.using(schema_editor.connection.alias).get_or_create(organization=org, name='Pago en línea', type='bank')


class Migration(migrations.Migration):
    dependencies = [('sales', '0005_order_channel_request_orderline_coupon_code_and_more')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
