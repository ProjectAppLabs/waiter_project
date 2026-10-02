# Migración generada por Django para el contrato T2.

import sales.policy
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='role_policy',
            field=models.JSONField(default=sales.policy.default_role_policy),
        ),
    ]
