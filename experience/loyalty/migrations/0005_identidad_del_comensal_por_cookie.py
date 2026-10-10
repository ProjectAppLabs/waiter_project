# Migración generada por Django para domicilios.

import django.db.models.deletion
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loyalty', '0004_domicilios_cobertura_direcciones_y_recibo'),
        ('tenancy', '0013_tono_del_asistente'),
    ]

    operations = [
        migrations.CreateModel(
            name='CustomerCookieIdentity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', tenancy.fields.ExactCharField(max_length=64)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='loyalty.customer')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization', 'key'), name='customer_cookie_identity_unique')],
            },
        ),
    ]
