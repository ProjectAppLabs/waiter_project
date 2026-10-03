# Esquema comercial del plan X, compatible con columnas generadas de MySQL.

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0009_precios_por_unidad_y_lineas_de_cobro'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization', name='billing_history_starts',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='CreditMovement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('module', models.CharField(max_length=32)),
                ('unit', models.CharField(max_length=40)),
                ('kind', models.CharField(choices=[('recarga', 'recarga'), ('cortesia', 'cortesia'), ('consumo', 'consumo')], max_length=10)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=20)),
                ('remaining', models.DecimalField(decimal_places=6, default=0, max_digits=20)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('reference', models.CharField(blank=True, default='', max_length=250)),
                ('at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='PricingRevision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('starts', models.DateTimeField(default=django.utils.timezone.now, null=True)),
                ('pricing', models.JSONField()),
            ],
        ),
        migrations.CreateModel(
            name='RecurringPeriod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('component', models.CharField(max_length=100)),
                ('module', models.CharField(max_length=32)),
                ('name', models.CharField(max_length=250)),
                ('price', models.JSONField()),
                ('starts', models.DateTimeField()),
                ('ends', models.DateTimeField(blank=True, null=True)),
                ('open_component', models.GeneratedField(db_persist=True, expression=models.Case(models.When(models.Q(('ends__isnull', True)), then=models.F('component')), default=None, output_field=models.CharField(max_length=100, null=True)), output_field=models.CharField(max_length=100, null=True))),
            ],
        ),
        migrations.RemoveConstraint(
            model_name='subscriptioncharge',
            name='subscription_org_period_unique',
        ),
        migrations.RemoveConstraint(
            model_name='subscriptionchargeline',
            name='linea_cobro_valores_positivos',
        ),
        migrations.AddField(
            model_name='organization',
            name='account_credit',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='organization',
            name='pricing',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='pricing',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='subscriptioncharge',
            name='advance',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='subscriptioncharge',
            name='kind',
            field=models.CharField(choices=[('mensualidad', 'Mensualidad'), ('recarga', 'Recarga')], default='mensualidad', max_length=12),
        ),
        migrations.AddField(
            model_name='subscriptioncharge',
            name='recharge',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='usagerecord',
            name='allocation',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='usagerecord',
            name='included_used',
            field=models.DecimalField(decimal_places=6, default=0, max_digits=20),
        ),
        migrations.AddField(
            model_name='usagerecord',
            name='overage',
            field=models.DecimalField(decimal_places=6, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name='usagerecord',
            name='quota_scope',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='usagerecord',
            name='unit_price',
            field=models.DecimalField(decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AlterField(
            model_name='platformaudit',
            name='action',
            field=models.CharField(choices=[('organization.created', 'organization.created'), ('organization.updated', 'organization.updated'), ('organization.suspended', 'organization.suspended'), ('organization.reactivated', 'organization.reactivated'), ('organization.invite_resent', 'organization.invite_resent'), ('platform_user.invited', 'platform_user.invited'), ('platform_user.deactivated', 'platform_user.deactivated'), ('subscription.created', 'subscription.created'), ('subscription.paid', 'subscription.paid'), ('subscription.void', 'subscription.void'), ('subscription.overdue', 'subscription.overdue'), ('subscription.reminder', 'subscription.reminder'), ('billing_settings.updated', 'billing_settings.updated'), ('module_change', 'module_change'), ('pricing.updated', 'pricing.updated'), ('credits.granted', 'credits.granted')], max_length=40),
        ),
        migrations.AlterField(
            model_name='subscriptionchargeline',
            name='total',
            field=models.DecimalField(decimal_places=2, max_digits=14),
        ),
        migrations.AddField(
            model_name='subscriptioncharge',
            name='monthly_period',
            field=models.GeneratedField(db_persist=True, expression=models.Case(models.When(models.Q(('kind', 'mensualidad')), then=models.F('period')), default=None, output_field=models.CharField(max_length=7, null=True)), output_field=models.CharField(max_length=7, null=True)),
        ),
        migrations.AddConstraint(
            model_name='subscriptioncharge',
            constraint=models.UniqueConstraint(fields=('organization', 'monthly_period'), name='subscription_org_period_unique'),
        ),
        migrations.AddConstraint(
            model_name='subscriptionchargeline',
            constraint=models.CheckConstraint(condition=models.Q(('quantity__gt', 0), ('unit_price__gte', 0)), name='linea_cobro_valores_positivos'),
        ),
        migrations.AddField(
            model_name='creditmovement',
            name='actor',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.platformuser'),
        ),
        migrations.AddField(
            model_name='creditmovement',
            name='charge',
            field=models.OneToOneField(null=True, on_delete=django.db.models.deletion.PROTECT, to='tenancy.subscriptioncharge'),
        ),
        migrations.AddField(
            model_name='creditmovement',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='credit_movements', to='tenancy.organization'),
        ),
        migrations.AddField(
            model_name='creditmovement',
            name='source',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='tenancy.creditmovement'),
        ),
        migrations.AddField(
            model_name='creditmovement',
            name='usage',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='tenancy.usagerecord'),
        ),
        migrations.AddField(
            model_name='recurringperiod',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='recurring_periods', to='tenancy.organization'),
        ),
        migrations.AddConstraint(
            model_name='creditmovement',
            constraint=models.CheckConstraint(condition=models.Q(('remaining__gte', 0)), name='saldo_recarga_no_negativo'),
        ),
        migrations.AddConstraint(
            model_name='recurringperiod',
            constraint=models.UniqueConstraint(fields=('organization', 'open_component'), name='intervalo_abierto_unico'),
        ),
    ]
