"""Prepara las organizaciones y restaurantes anteriores a T2 sin duplicar efectivo."""
from django.db import migrations


def seed(apps,schema_editor):
    Organization=apps.get_model('tenancy','Organization')
    Restaurant=apps.get_model('tenancy','Restaurant')
    PaymentMethod=apps.get_model('sales','PaymentMethod')
    Settings=apps.get_model('sales','RestaurantSettings')
    Floor=apps.get_model('tables','Floor')
    alias=schema_editor.connection.alias
    for org in Organization.objects.using(alias).all():
        for name in ('Datáfono','QR'):
            PaymentMethod.objects.using(alias).get_or_create(organization=org,name=name,type='bank')
    for restaurant in Restaurant.objects.using(alias).all():
        Settings.objects.using(alias).get_or_create(restaurant=restaurant)
        if not PaymentMethod.objects.using(alias).filter(organization_id=restaurant.organization_id,type='cash',restaurants=restaurant).exists():
            method=PaymentMethod.objects.using(alias).create(organization_id=restaurant.organization_id,name='Efectivo',type='cash')
            method.restaurants.add(restaurant)
        if not Floor.objects.using(alias).filter(restaurant=restaurant).exists():
            Floor.objects.using(alias).create(restaurant=restaurant,name='Salón')


class Migration(migrations.Migration):
    dependencies=[('sales','0001_initial')]
    operations=[migrations.RunPython(seed,migrations.RunPython.noop)]
