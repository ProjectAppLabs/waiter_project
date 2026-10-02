# Generada por Django 6.1 el 2026-10-02 03:56

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_account_notify_prefs'),
        ('notifications', '0001_initial'),
        ('tenancy', '0003_organization_banners_configured_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='low_stock_open',
            field=models.BooleanField(default=False),
        ),
        migrations.AddConstraint(
            model_name='notification',
            constraint=models.UniqueConstraint(condition=models.Q(('kind', 'inventory'), ('low_stock_open', True), ('res_model', 'catalog.Product')), fields=('restaurant', 'res_id'), name='notification_low_stock_episode_unique'),
        ),
    ]
