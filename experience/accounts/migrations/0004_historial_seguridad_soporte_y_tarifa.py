# Generada por Django 6.1 el 2026-10-03 23:21

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_mysql_asistencia_abierta'),
        ('tenancy', '0011_conservar_precios_y_abrir_intervalos'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='hourly_rate',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True, validators=[django.core.validators.MinValueValidator(0)]),
        ),
        migrations.AddField(
            model_name='session',
            name='support_agent',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='tenancy.platformuser'),
        ),
    ]
