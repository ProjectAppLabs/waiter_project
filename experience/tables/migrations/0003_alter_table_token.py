# Generada por Django 6.1 el 2026-10-02 04:55

import django.core.validators
import tables.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0002_remove_table_active_table_number_unique_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='table',
            name='token',
            field=models.CharField(default=tables.models.table_token, max_length=64, unique=True, validators=[django.core.validators.RegexValidator('\\A[A-Za-z0-9]{6,64}\\Z', 'Usa entre 6 y 64 caracteres alfanuméricos.')]),
        ),
    ]
