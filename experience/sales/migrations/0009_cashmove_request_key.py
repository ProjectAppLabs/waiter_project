"""Conserva la clave de cada movimiento nuevo para repetirlo sin duplicar el efectivo."""

import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0008_devoluciones"),
    ]

    operations = [
        migrations.AddField(
            model_name="cashmove",
            name="request_key",
            field=tenancy.fields.ExactCharField(blank=True, default=None, max_length=80, null=True),
        ),
        migrations.AddConstraint(
            model_name="cashmove",
            constraint=models.UniqueConstraint(fields=("shift", "request_key"), name="cash_move_shift_key_unique"),
        ),
    ]
