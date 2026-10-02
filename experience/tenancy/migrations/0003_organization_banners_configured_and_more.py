# Generada por Django 6.1 el 2026-10-02 03:56

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0002_organization_role_policy'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='banners_configured',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='organization',
            name='signup_discount_percent',
            field=models.DecimalField(decimal_places=2, default=5, max_digits=5),
        ),
    ]
