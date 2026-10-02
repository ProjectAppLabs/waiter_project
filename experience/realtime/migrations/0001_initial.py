# Migración generada por Django para el contrato T2.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenancy', '0002_organization_role_policy'),
    ]

    operations = [
        migrations.CreateModel(
            name='SalesEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('orders', 'orders'), ('kitchen', 'kitchen'), ('tables', 'tables'), ('cash', 'cash'), ('notify', 'notify')], max_length=8)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
            options={
                'indexes': [models.Index(fields=['restaurant', 'id'], name='realtime_sa_restaur_e83002_idx')],
            },
        ),
    ]
