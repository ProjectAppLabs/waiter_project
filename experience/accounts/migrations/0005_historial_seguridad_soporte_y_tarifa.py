# Generada por Django 6.1 el 2026-10-03 23:21

import django.db.models.deletion
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_historial_seguridad_soporte_y_tarifa'),
        ('tenancy', '0012_historial_seguridad_soporte_y_tarifa'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='support_grant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='tenancy.supportgrant'),
        ),
        migrations.AlterField(
            model_name='session',
            name='token_hash',
            field=tenancy.fields.ExactCharField(max_length=64, unique=True),
        ),
    ]
