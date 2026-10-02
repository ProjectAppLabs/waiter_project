# Generada por Django 6.1 el 2026-10-02 03:56

import accounts.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='notify_prefs',
            field=models.JSONField(default=accounts.models.default_notify_prefs),
        ),
    ]
