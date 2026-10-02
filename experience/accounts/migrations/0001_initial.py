# Generada por Django 6.1 el 2026-10-02 01:07

import django.db.models.deletion
import django.db.models.functions.text
import tenancy.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('username', models.CharField(max_length=32, validators=[tenancy.validators.validate_username])),
                ('password', models.CharField(default='!', max_length=128)),
                ('active', models.BooleanField(default=True)),
                ('activated', models.BooleanField(default=False)),
                ('invite_code_hash', models.CharField(blank=True, default='', max_length=64)),
                ('invite_expires', models.DateTimeField(blank=True, null=True)),
                ('invite_attempts', models.PositiveSmallIntegerField(default=0)),
                ('invite_sent_at', models.DateTimeField(blank=True, null=True)),
                ('last_login', models.DateTimeField(blank=True, null=True)),
                ('email', models.EmailField(blank=True, max_length=254, null=True)),
                ('role', models.CharField(choices=[('owner', 'owner'), ('admin', 'admin'), ('cashier', 'cashier'), ('waiter', 'waiter')], max_length=10)),
                ('shift_start', models.FloatField(blank=True, null=True)),
                ('shift_end', models.FloatField(blank=True, null=True)),
                ('legacy_odoo_employee_id', models.PositiveIntegerField(blank=True, null=True)),
                ('legacy_odoo_user_id', models.PositiveIntegerField(blank=True, null=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='accounts', to='tenancy.organization')),
                ('restaurants', models.ManyToManyField(blank=True, related_name='accounts', to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='Attendance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('check_in', models.DateTimeField()),
                ('check_out', models.DateTimeField(blank=True, null=True)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendances', to='accounts.account')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='Session',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token_hash', models.CharField(max_length=64, unique=True)),
                ('expires', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='accounts.account')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.restaurant')),
            ],
        ),
        migrations.AddConstraint(
            model_name='account',
            constraint=models.UniqueConstraint(fields=('organization', 'username'), name='account_org_username_unique'),
        ),
        migrations.AddConstraint(
            model_name='account',
            constraint=models.UniqueConstraint(django.db.models.functions.text.Lower('email'), models.F('organization'), name='account_org_email_unique'),
        ),
        migrations.AddConstraint(
            model_name='attendance',
            constraint=models.UniqueConstraint(condition=models.Q(('check_out__isnull', True)), fields=('account',), name='one_open_attendance'),
        ),
    ]
