# Generada por Django 6.1 el 2026-10-02 03:56

import django.db.models.deletion
import reservations.models
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0002_account_notify_prefs'),
        ('catalog', '0002_seed_organizations'),
        ('loyalty', '0001_initial'),
        ('sales', '0004_order_customer_orderline_loyalty_card_and_more'),
        ('tables', '0002_remove_table_active_table_number_unique_and_more'),
        ('tenancy', '0003_organization_banners_configured_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Reservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=30)),
                ('customer_name', models.CharField(max_length=120)),
                ('customer_email', models.EmailField(blank=True, default='', max_length=254)),
                ('customer_phone', models.CharField(blank=True, default='', max_length=40)),
                ('people', models.PositiveIntegerField(default=2)),
                ('baby_chair', models.BooleanField(default=False)),
                ('notes', models.TextField(blank=True, default='')),
                ('date', models.DateField()),
                ('time_start', models.FloatField()),
                ('time_end', models.FloatField()),
                ('prep_minutes', models.PositiveSmallIntegerField(default=30)),
                ('state', models.CharField(choices=[('confirmed', 'confirmed'), ('seated', 'seated'), ('no_show', 'no_show'), ('cancelled', 'cancelled')], default='confirmed', max_length=9)),
                ('deposit_amount', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('deposit_state', models.CharField(choices=[('none', 'none'), ('pending', 'pending'), ('paid', 'paid')], default='none', max_length=7)),
                ('deposit_reference', models.CharField(blank=True, default='', max_length=120)),
                ('deposit_paid_at', models.DateTimeField(blank=True, null=True)),
                ('pay_token', models.CharField(default=reservations.models.pay_token, max_length=32, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('customer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='loyalty.customer')),
                ('main_table', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='main_reservations', to='tables.table')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('preorder', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='reservation', to='sales.order')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
                ('tables', models.ManyToManyField(related_name='reservations', to='tables.table')),
            ],
        ),
        migrations.CreateModel(
            name='ReservationLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.DecimalField(decimal_places=6, max_digits=12)),
                ('note', models.CharField(blank=True, default='', max_length=500)),
                ('price', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.product')),
                ('reservation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='reservations.reservation')),
            ],
        ),
        migrations.CreateModel(
            name='ReservationSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('weekly', models.JSONField(default=reservations.models.weekly)),
                ('overrides', models.JSONField(default=list)),
                ('rules', models.JSONField(default=reservations.models.rules)),
                ('restaurant', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['restaurant', 'date', 'state'], name='reservation_restaur_fde7c3_idx'),
        ),
        migrations.AddConstraint(
            model_name='reservation',
            constraint=models.UniqueConstraint(fields=('organization', 'code'), name='reservation_org_code_unique'),
        ),
        migrations.AddConstraint(
            model_name='reservation',
            constraint=models.CheckConstraint(condition=models.Q(('people__gte', 1)), name='reservation_people_positive'),
        ),
        migrations.AddConstraint(
            model_name='reservation',
            constraint=models.CheckConstraint(condition=models.Q(('deposit_amount__gte', 0), ('deposit_amount__lte', 50000000)), name='reservation_deposit_range'),
        ),
    ]
