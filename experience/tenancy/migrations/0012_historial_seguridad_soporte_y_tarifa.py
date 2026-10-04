# Generada por Django 6.1 el 2026-10-03 23:21

import django.db.models.deletion
import django.utils.timezone
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_historial_seguridad_soporte_y_tarifa'),
        ('tenancy', '0011_conservar_precios_y_abrir_intervalos'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='require_2fa',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='platformuser',
            name='recovery_hashes',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='platformuser',
            name='totp_last_step',
            field=models.BigIntegerField(default=-1),
        ),
        migrations.AddField(
            model_name='platformuser',
            name='totp_pending',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='platformuser',
            name='totp_secret',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='platformuser',
            name='two_factor',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='platformaudit',
            name='action',
            field=models.CharField(choices=[('organization.created', 'organization.created'), ('organization.updated', 'organization.updated'), ('organization.suspended', 'organization.suspended'), ('organization.reactivated', 'organization.reactivated'), ('organization.invite_resent', 'organization.invite_resent'), ('platform_user.invited', 'platform_user.invited'), ('platform_user.deactivated', 'platform_user.deactivated'), ('subscription.created', 'subscription.created'), ('subscription.paid', 'subscription.paid'), ('subscription.void', 'subscription.void'), ('subscription.overdue', 'subscription.overdue'), ('two_factor.enabled', 'two_factor.enabled'), ('two_factor.disabled', 'two_factor.disabled'), ('two_factor.reset', 'two_factor.reset'), ('support.enter', 'support.enter'), ('support.started', 'support.started'), ('support.requested', 'support.requested'), ('subscription.reminder', 'subscription.reminder'), ('billing_settings.updated', 'billing_settings.updated'), ('module_change', 'module_change'), ('pricing.updated', 'pricing.updated'), ('credits.granted', 'credits.granted')], max_length=40),
        ),
        migrations.AlterField(
            model_name='platformsession',
            name='token_hash',
            field=tenancy.fields.ExactCharField(max_length=64, unique=True),
        ),
        migrations.CreateModel(
            name='SupportGrant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(max_length=1000)),
                ('hours', models.PositiveSmallIntegerField(default=24)),
                ('since', models.DateTimeField(null=True)),
                ('until', models.DateTimeField(null=True)),
                ('state', models.CharField(choices=[('pedido', 'pedido'), ('vigente', 'vigente'), ('revocado', 'revocado'), ('vencido', 'vencido')], default='pedido', max_length=10)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('approved_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('requested_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='tenancy.platformuser')),
            ],
        ),
        migrations.CreateModel(
            name='SupportToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token_hash', tenancy.fields.ExactCharField(max_length=64, unique=True)),
                ('expires', models.DateTimeField()),
                ('agent', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.platformuser')),
                ('grant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.supportgrant')),
            ],
        ),
        migrations.CreateModel(
            name='TwoFactorChallenge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token_hash', tenancy.fields.ExactCharField(max_length=64, unique=True)),
                ('expires', models.DateTimeField()),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.platformuser')),
            ],
        ),
        migrations.CreateModel(
            name='OrganizationAudit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('actor_kind', models.CharField(max_length=10)),
                ('actor_id', models.PositiveBigIntegerField(null=True)),
                ('actor_name', models.CharField(max_length=180)),
                ('action', models.CharField(max_length=100)),
                ('entity', models.CharField(max_length=100)),
                ('entity_id', models.CharField(max_length=80)),
                ('summary', models.TextField()),
                ('before', models.JSONField(default=dict)),
                ('after', models.JSONField(default=dict)),
                ('at', models.DateTimeField(default=django.utils.timezone.now)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurant', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.restaurant')),
            ],
            options={
                'indexes': [models.Index(fields=['organization', 'at'], name='historial_organizacion_fecha')],
            },
        ),
    ]
