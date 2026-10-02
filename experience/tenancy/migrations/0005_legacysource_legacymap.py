# Generada por Django 6.1 para la migración T6.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0004_organization_address_organization_brand_logo_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='LegacySource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.URLField()),
                ('database', models.CharField(max_length=200)),
                ('company_id', models.PositiveIntegerField()),
                ('organization', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='LegacyMap',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('model', models.CharField(max_length=160)),
                ('odoo_id', models.CharField(max_length=80)),
                ('local_model', models.CharField(max_length=100)),
                ('local_id', models.CharField(max_length=80)),
                ('fingerprint', models.CharField(blank=True, default='', max_length=64)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization', 'model', 'odoo_id'), name='legacy_org_model_id_unique')],
            },
        ),
    ]
