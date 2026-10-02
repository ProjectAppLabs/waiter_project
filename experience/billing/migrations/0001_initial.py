# Generado por Django 6.1 el 2026-10-02 04:24

import django.db.models.deletion
import django.db.models.expressions
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0002_account_notify_prefs'),
        ('loyalty', '0002_seed_organizations'),
        ('sales', '0004_order_customer_orderline_loyalty_card_and_more'),
        ('tenancy', '0004_organization_address_organization_brand_logo_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='BillingSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tip_label', models.CharField(default='Propina voluntaria', max_length=100)),
                ('send_email', models.BooleanField(default=False)),
                ('default_kind', models.CharField(choices=[('invoice', 'Factura'), ('pos', 'POS')], default='pos', max_length=7)),
                ('organization', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='Resolution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('invoice', 'Factura'), ('pos', 'POS')], max_length=7)),
                ('prefix', models.CharField(max_length=20)),
                ('number_from', models.PositiveBigIntegerField()),
                ('number_to', models.PositiveBigIntegerField()),
                ('next_number', models.PositiveBigIntegerField()),
                ('valid_from', models.DateField()),
                ('valid_to', models.DateField()),
                ('technical_key', models.CharField(blank=True, default='', max_length=200)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='SalesDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('invoice', 'invoice'), ('pos', 'pos'), ('credit_note', 'credit_note')], max_length=11)),
                ('number', models.CharField(max_length=50)),
                ('buyer_data', models.JSONField(default=dict)),
                ('company_data', models.JSONField(default=dict)),
                ('resolution_data', models.JSONField(default=dict)),
                ('tip_label', models.CharField(default='Propina voluntaria', max_length=100)),
                ('issued_at', models.DateTimeField()),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('tax_total', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('tip', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('taxes', models.JSONField(default=list)),
                ('lines', models.JSONField(default=list)),
                ('state', models.CharField(choices=[('pending', 'pending'), ('issued', 'issued'), ('rejected', 'rejected'), ('contingency', 'contingency')], default='pending', max_length=11)),
                ('provider_id', models.CharField(blank=True, default='', max_length=120)),
                ('cufe', models.CharField(blank=True, default='', max_length=96)),
                ('qr', models.TextField(blank=True, default='')),
                ('xml', models.FileField(blank=True, upload_to='billing/xml/')),
                ('errors', models.JSONField(default=list)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('request_key', models.CharField(max_length=80)),
                ('buyer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='loyalty.customer')),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='document', to='sales.order')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.organization')),
                ('original', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='billing.salesdocument')),
                ('resolution', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='billing.resolution')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
            ],
        ),
        migrations.AddConstraint(
            model_name='resolution',
            constraint=models.UniqueConstraint(fields=('organization', 'prefix'), name='resolution_org_prefix_unique'),
        ),
        migrations.AddConstraint(
            model_name='resolution',
            constraint=models.CheckConstraint(condition=models.Q(('next_number__gte', models.F('number_from')), ('next_number__lte', django.db.models.expressions.CombinedExpression(models.F('number_to'), '+', models.Value(1))), ('number_from__gte', 1), ('number_to__gte', models.F('number_from')), ('valid_to__gte', models.F('valid_from'))), name='resolution_valid_range'),
        ),
        migrations.AddConstraint(
            model_name='salesdocument',
            constraint=models.UniqueConstraint(fields=('organization', 'number'), name='document_org_number_unique'),
        ),
        migrations.AddConstraint(
            model_name='salesdocument',
            constraint=models.UniqueConstraint(fields=('organization', 'request_key'), name='document_org_key_unique'),
        ),
    ]
