# Migración generada por Django para domicilios.

import delivery.models
import django.db.models.deletion
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('experience_app', '0031_mysql_tokens_y_unicos_sin_condicion'),
        ('loyalty', '0003_mysql_claves_exactas'),
        ('tenancy', '0013_tono_del_asistente'),
        ('whatsapp', '0001_cuentas_conversaciones_mensajes_y_eventos'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConversationDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('location', models.JSONField(default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('conversation', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to='whatsapp.whatsappconversation')),
            ],
        ),
        migrations.CreateModel(
            name='DeliveryLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nonce', tenancy.fields.ExactCharField(max_length=64, unique=True)),
                ('expires_at', models.DateTimeField()),
                ('used_at', models.DateTimeField(null=True)),
                ('result', models.JSONField(default=dict)),
                ('conversation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='whatsapp.whatsappconversation')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='DeliverySettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=False)),
                ('radius_km', models.DecimalField(decimal_places=2, default=5, max_digits=5)),
                ('tiers', models.JSONField(default=delivery.models.tiers_default)),
                ('min_order', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('methods', models.JSONField(default=delivery.models.methods_default)),
                ('notes', models.CharField(blank=True, default='', max_length=200)),
                ('restaurant', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='delivery_settings', to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='SessionDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('latitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('longitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('address', models.CharField(max_length=300)),
                ('details', models.CharField(blank=True, max_length=200)),
                ('phone', models.CharField(max_length=13)),
                ('name', models.CharField(max_length=120)),
                ('fee', models.DecimalField(decimal_places=2, max_digits=16)),
                ('distance_km', models.DecimalField(decimal_places=3, max_digits=8)),
                ('payment', models.CharField(blank=True, default='', max_length=20)),
                ('customer', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='loyalty.customer')),
                ('diner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='experience_app.diner')),
                ('session', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='delivery', to='experience_app.tablesession')),
            ],
        ),
        migrations.CreateModel(
            name='SearchUsage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('day', models.DateField()),
                ('searches', models.PositiveSmallIntegerField(default=0)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='experience_app.tablesession')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('session', 'day'), name='delivery_search_session_day')],
            },
        ),
    ]
