# Generada por Django 6.1 el 2026-10-02 01:07

import django.core.validators
import django.db.models.deletion
import django.db.models.functions.text
import tenancy.validators
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('slug', models.CharField(max_length=40, unique=True, validators=[tenancy.validators.validate_slug])),
                ('name', models.CharField(max_length=120)),
                ('legal_name', models.CharField(blank=True, default='', max_length=200)),
                ('tax_id', models.CharField(blank=True, default='', max_length=40)),
                ('billing_email', models.EmailField(blank=True, default='', max_length=254)),
                ('billing_contact', models.CharField(blank=True, default='', max_length=120)),
                ('plan', models.CharField(default='basico', max_length=40)),
                ('monthly_price', models.DecimalField(decimal_places=2, default=0, max_digits=14, validators=[django.core.validators.MinValueValidator(0)])),
                ('status', models.CharField(choices=[('trial', 'trial'), ('active', 'active'), ('suspended', 'suspended')], default='trial', max_length=12)),
                ('trial_ends', models.DateField(blank=True, null=True)),
                ('max_restaurants', models.PositiveIntegerField(default=1, validators=[django.core.validators.MinValueValidator(1)])),
                ('cash_tolerance', models.DecimalField(decimal_places=2, default=0, max_digits=14, validators=[django.core.validators.MinValueValidator(0)])),
                ('timezone', models.CharField(default='America/Bogota', max_length=64, validators=[tenancy.validators.validate_timezone])),
                ('brand_color', models.CharField(default='#C1873A', max_length=7, validators=[django.core.validators.RegexValidator('^#[0-9a-fA-F]{6}$')])),
                ('brand_font', models.CharField(default='Instrument Serif', max_length=40)),
                ('brand_radius', models.PositiveSmallIntegerField(default=14)),
                ('tagline', models.CharField(blank=True, default='', max_length=80)),
                ('logo_url', models.URLField(blank=True, default='')),
                ('greeting', models.CharField(blank=True, default='', max_length=60)),
                ('waiter_name', models.CharField(blank=True, default='', max_length=40)),
                ('welcome', models.CharField(blank=True, default='', max_length=140)),
                ('suspended_at', models.DateTimeField(blank=True, null=True)),
                ('suspended_reason', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'constraints': [models.CheckConstraint(condition=models.Q(('max_restaurants__gte', 1)), name='organization_restaurants_positive')],
            },
        ),
        migrations.CreateModel(
            name='PlatformUser',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('password', models.CharField(default='!', max_length=128)),
                ('active', models.BooleanField(default=True)),
                ('activated', models.BooleanField(default=False)),
                ('invite_code_hash', models.CharField(blank=True, default='', max_length=64)),
                ('invite_expires', models.DateTimeField(blank=True, null=True)),
                ('invite_attempts', models.PositiveSmallIntegerField(default=0)),
                ('invite_sent_at', models.DateTimeField(blank=True, null=True)),
                ('last_login', models.DateTimeField(blank=True, null=True)),
                ('username', models.CharField(max_length=32, unique=True, validators=[tenancy.validators.validate_username])),
                ('email', models.EmailField(max_length=254)),
                ('role', models.CharField(choices=[('admin', 'Administrador'), ('operator', 'Operador')], default='operator', max_length=10)),
            ],
            options={
                'constraints': [models.UniqueConstraint(django.db.models.functions.text.Lower('email'), name='platform_email_unique')],
            },
        ),
        migrations.CreateModel(
            name='PlatformSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token_hash', models.CharField(max_length=64, unique=True)),
                ('expires', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='tenancy.platformuser')),
            ],
        ),
        migrations.CreateModel(
            name='PlatformAudit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('organization.created', 'organization.created'), ('organization.updated', 'organization.updated'), ('organization.suspended', 'organization.suspended'), ('organization.reactivated', 'organization.reactivated'), ('organization.invite_resent', 'organization.invite_resent'), ('platform_user.invited', 'platform_user.invited'), ('platform_user.deactivated', 'platform_user.deactivated')], max_length=40)),
                ('detail', models.JSONField(default=dict)),
                ('at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.organization')),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.platformuser')),
            ],
        ),
        migrations.CreateModel(
            name='Restaurant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.CharField(max_length=40, validators=[tenancy.validators.validate_restaurant_slug])),
                ('name', models.CharField(max_length=120)),
                ('street', models.CharField(blank=True, default='', max_length=250)),
                ('city', models.CharField(blank=True, default='', max_length=120)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('access_margin_minutes', models.PositiveIntegerField(default=30)),
                ('active', models.BooleanField(default=True)),
                ('legacy_odoo_config_id', models.PositiveIntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='restaurants', to='tenancy.organization')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization', 'slug'), name='restaurant_org_slug_unique')],
            },
        ),
    ]
