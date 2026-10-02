# Migración generada por Django para el contrato T2.

import django.db.models.deletion
import tables.models
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenancy', '0002_organization_role_policy'),
    ]

    operations = [
        migrations.CreateModel(
            name='Floor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('sequence', models.IntegerField(default=0)),
                ('active', models.BooleanField(default=True)),
                ('plan', models.JSONField(default=tables.models.empty_plan)),
                ('background', models.FileField(blank=True, upload_to='floors')),
                ('revision', models.PositiveIntegerField(default=0)),
                ('zone_staff', models.JSONField(default=dict)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='floors', to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='Table',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.PositiveIntegerField()),
                ('seats', models.PositiveIntegerField(default=4)),
                ('x', models.PositiveIntegerField(default=20)),
                ('y', models.PositiveIntegerField(default=20)),
                ('width', models.PositiveIntegerField(default=80)),
                ('height', models.PositiveIntegerField(default=80)),
                ('shape', models.CharField(choices=[('square', 'Cuadrada'), ('round', 'Redonda')], default='square', max_length=6)),
                ('color', models.CharField(blank=True, default='', max_length=7)),
                ('zone_id', models.CharField(blank=True, default='', max_length=80)),
                ('active', models.BooleanField(default=True)),
                ('call', models.CharField(choices=[('none', 'none'), ('ordering', 'ordering'), ('assist', 'assist'), ('bill', 'bill')], default='none', max_length=8)),
                ('call_at', models.DateTimeField(blank=True, null=True)),
                ('token', models.CharField(default=tables.models.table_token, max_length=32, unique=True)),
                ('floor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tables', to='tables.floor')),
            ],
            options={
                'constraints': [models.UniqueConstraint(condition=models.Q(('active', True)), fields=('floor', 'number'), name='active_table_number_unique')],
            },
        ),
    ]
