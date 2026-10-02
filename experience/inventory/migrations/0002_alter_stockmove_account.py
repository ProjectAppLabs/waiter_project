# Generada por Django 6.1 el 2026-10-02 04:55

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_account_notify_prefs'),
        ('inventory', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockmove',
            name='account',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='accounts.account'),
        ),
    ]
