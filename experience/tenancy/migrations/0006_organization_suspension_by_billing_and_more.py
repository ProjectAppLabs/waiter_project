# Generada por Django 6.1 el 2026-10-02: cobro de suscripciones de ProjectApp.

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0005_legacysource_legacymap'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='suspension_by_billing',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='platformaudit',
            name='action',
            field=models.CharField(choices=[('organization.created', 'organization.created'), ('organization.updated', 'organization.updated'), ('organization.suspended', 'organization.suspended'), ('organization.reactivated', 'organization.reactivated'), ('organization.invite_resent', 'organization.invite_resent'), ('platform_user.invited', 'platform_user.invited'), ('platform_user.deactivated', 'platform_user.deactivated'), ('subscription.created', 'subscription.created'), ('subscription.paid', 'subscription.paid'), ('subscription.void', 'subscription.void'), ('subscription.overdue', 'subscription.overdue'), ('subscription.reminder', 'subscription.reminder'), ('billing_settings.updated', 'billing_settings.updated')], max_length=40),
        ),
        migrations.CreateModel(
            name='PlatformSettings',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ('billing_day', models.PositiveSmallIntegerField(default=5, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(31)])),
                ('grace_days', models.PositiveSmallIntegerField(default=10)),
                ('suspend_after_days', models.PositiveSmallIntegerField(default=15)),
                ('reminder_days', models.PositiveSmallIntegerField(default=3)),
            ],
            options={
                'constraints': [models.CheckConstraint(condition=models.Q(('id', 1)), name='platform_settings_singleton'), models.CheckConstraint(condition=models.Q(('billing_day__gte', 1), ('billing_day__lte', 31)), name='billing_day_valid')],
            },
        ),
        migrations.CreateModel(
            name='SubscriptionCharge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period', models.CharField(max_length=7, validators=[django.core.validators.RegexValidator('^[0-9]{4}-(0[1-9]|1[0-2])$')])),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14, validators=[django.core.validators.MinValueValidator(0)])),
                ('due_date', models.DateField()),
                ('state', models.CharField(choices=[('pending', 'pending'), ('paid', 'paid'), ('overdue', 'overdue'), ('void', 'void')], default='pending', max_length=8)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('method', models.CharField(blank=True, choices=[('transferencia', 'transferencia'), ('nequi', 'nequi'), ('efectivo', 'efectivo'), ('otro', 'otro')], default='', max_length=13)),
                ('reference', models.CharField(blank=True, default='', max_length=200)),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reminder_sent_at', models.DateTimeField(blank=True, null=True)),
                ('due_notice_sent_at', models.DateTimeField(blank=True, null=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='subscription_charges', to='tenancy.organization')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.platformuser')),
            ],
            options={
                'indexes': [models.Index(fields=['state', 'due_date'], name='tenancy_sub_state_2a8935_idx')],
                'constraints': [models.UniqueConstraint(fields=('organization', 'period'), name='subscription_org_period_unique'), models.CheckConstraint(condition=models.Q(('amount__gte', 0)), name='subscription_amount_nonnegative')],
            },
        ),
    ]
