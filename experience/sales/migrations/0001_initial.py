# Migración generada por Django para el contrato T2.

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        ('catalog', '0002_seed_organizations'),
        ('tables', '0001_initial'),
        ('tenancy', '0002_organization_role_policy'),
    ]

    operations = [
        migrations.CreateModel(
            name='CashShift',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('state', models.CharField(choices=[('open', 'Abierto'), ('closed', 'Cerrado')], default='open', max_length=6)),
                ('opened_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('opening_cash', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('opening_notes', models.TextField(blank=True, default='')),
                ('closed_at', models.DateTimeField(null=True)),
                ('expected_cash', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('counted_cash', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('difference', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('closing_notes', models.TextField(blank=True, default='')),
                ('zone_staff', models.JSONField(default=dict)),
                ('closed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='accounts.account')),
                ('opened_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to='accounts.account')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='CashMove',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('in', 'Entrada'), ('out', 'Salida')], max_length=3)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('reason', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('shift', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='moves', to='sales.cashshift')),
            ],
        ),
        migrations.CreateModel(
            name='Order',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid', models.UUIDField()),
                ('service', models.CharField(choices=[('dine_in', 'dine_in'), ('takeout', 'takeout'), ('delivery', 'delivery')], max_length=8)),
                ('prefix', models.CharField(max_length=2)),
                ('tracking', models.PositiveIntegerField()),
                ('number', models.CharField(max_length=30)),
                ('guests', models.PositiveIntegerField(default=1)),
                ('baby_chair', models.BooleanField(default=False)),
                ('customer_name', models.CharField(blank=True, default='', max_length=120)),
                ('delivery_address', models.CharField(blank=True, default='', max_length=500)),
                ('delivery_phone', models.CharField(blank=True, default='', max_length=40)),
                ('note', models.CharField(blank=True, default='', max_length=500)),
                ('origin', models.CharField(choices=[('waiter', 'waiter'), ('diner', 'diner'), ('ai', 'ai')], default='waiter', max_length=6)),
                ('channel', models.CharField(choices=[('pos', 'pos'), ('menu', 'menu'), ('whatsapp', 'whatsapp')], default='pos', max_length=8)),
                ('state', models.CharField(choices=[('draft', 'draft'), ('paid', 'paid'), ('cancelled', 'cancelled')], default='draft', max_length=9)),
                ('billing', models.BooleanField(default=False)),
                ('billing_at', models.DateTimeField(null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('paid_at', models.DateTimeField(null=True)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('tax', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('tip', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('paid', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('change', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to='accounts.account')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.organization')),
                ('paid_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='accounts.account')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
                ('shift', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='sales.cashshift')),
                ('table', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='orders', to='tables.table')),
            ],
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('index', models.PositiveIntegerField()),
                ('fired_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('preparation_at', models.DateTimeField(null=True)),
                ('ready_at', models.DateTimeField(null=True)),
                ('served_at', models.DateTimeField(null=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='sales.order')),
            ],
        ),
        migrations.CreateModel(
            name='OrderLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid', models.UUIDField()),
                ('name', models.CharField(max_length=200)),
                ('qty', models.DecimalField(decimal_places=6, max_digits=12)),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('taxes', models.JSONField(default=list)),
                ('options', models.JSONField(default=list)),
                ('discount_pct', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('note', models.CharField(blank=True, default='', max_length=500)),
                ('ready_at', models.DateTimeField(null=True)),
                ('served_at', models.DateTimeField(null=True)),
                ('cancelled', models.BooleanField(default=False)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('course', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lines', to='sales.course')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='sales.order')),
                ('parent', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='children', to='sales.orderline')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.product')),
            ],
        ),
        migrations.CreateModel(
            name='PaymentMethod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('type', models.CharField(choices=[('cash', 'cash'), ('bank', 'bank'), ('pay_later', 'pay_later')], max_length=10)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurants', models.ManyToManyField(blank=True, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('received', models.DecimalField(decimal_places=2, max_digits=16, null=True)),
                ('reference', models.CharField(blank=True, default='', max_length=60)),
                ('request_key', models.CharField(max_length=80)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payments', to='sales.order')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.organization')),
                ('method', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payments', to='sales.paymentmethod')),
            ],
        ),
        migrations.CreateModel(
            name='RestaurantSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('alert_late_minutes', models.PositiveIntegerField(default=18)),
                ('alert_bill_minutes', models.PositiveIntegerField(default=10)),
                ('roi_hour_cost', models.DecimalField(decimal_places=2, default=20000, max_digits=16)),
                ('roi_minutes_per_order', models.DecimalField(decimal_places=2, default=11, max_digits=12)),
                ('roi_baseline_hours_per_100', models.DecimalField(decimal_places=2, default='18.4', max_digits=12)),
                ('roi_monthly_cost', models.DecimalField(decimal_places=2, default=2740000, max_digits=16)),
                ('roi_start_date', models.DateField(blank=True, null=True)),
                ('kitchen_prepay_roles', models.JSONField(default=list)),
                ('restaurant', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='settings', to='tenancy.restaurant')),
            ],
        ),
        migrations.AddConstraint(
            model_name='cashshift',
            constraint=models.UniqueConstraint(condition=models.Q(('state', 'open')), fields=('restaurant',), name='one_open_cash_shift'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['restaurant', 'state', 'paid_at'], name='sales_order_restaur_9d6915_idx'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['restaurant', 'prefix', 'created_at'], name='sales_order_restaur_3efc34_idx'),
        ),
        migrations.AddConstraint(
            model_name='order',
            constraint=models.UniqueConstraint(fields=('organization', 'uuid'), name='order_org_uuid_unique'),
        ),
        migrations.AddConstraint(
            model_name='course',
            constraint=models.UniqueConstraint(fields=('order', 'index'), name='course_order_index_unique'),
        ),
        migrations.AddConstraint(
            model_name='orderline',
            constraint=models.UniqueConstraint(fields=('order', 'uuid'), name='line_order_uuid_unique'),
        ),
        migrations.AddConstraint(
            model_name='orderline',
            constraint=models.CheckConstraint(condition=models.Q(('qty__gt', 0), ('qty__lte', 999)), name='line_qty_range'),
        ),
        migrations.AddConstraint(
            model_name='payment',
            constraint=models.UniqueConstraint(fields=('organization', 'request_key'), name='payment_org_key_unique'),
        ),
        migrations.AddConstraint(
            model_name='payment',
            constraint=models.CheckConstraint(condition=models.Q(('amount__gt', 0)), name='payment_positive'),
        ),
    ]
