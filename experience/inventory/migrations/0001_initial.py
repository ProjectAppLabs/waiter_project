# Generada por Django 6.1 el 2026-10-02 01:48

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        ('catalog', '0002_seed_organizations'),
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PurchaseRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('state', models.CharField(choices=[('draft', 'draft'), ('sent', 'sent'), ('received', 'received'), ('cancelled', 'cancelled')], default='draft', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
                ('supplier', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.supplier')),
            ],
        ),
        migrations.CreateModel(
            name='PurchaseRequestLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('price_unit', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('ingredient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.product')),
                ('request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='inventory.purchaserequest')),
                ('unit', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.unit')),
            ],
        ),
        migrations.CreateModel(
            name='Stock',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('min', models.DecimalField(decimal_places=6, default=5, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('max', models.DecimalField(decimal_places=6, default=20, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('ingredient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.product')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='StockMove',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('receipt', 'receipt'), ('waste', 'waste'), ('count', 'count'), ('sale', 'sale'), ('adjust', 'adjust')], max_length=10)),
                ('qty', models.DecimalField(decimal_places=6, max_digits=18)),
                ('reason', models.CharField(max_length=300)),
                ('request_key', models.CharField(max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('requested_qty', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('stock_after', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('ingredient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.product')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
                ('unit', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.unit')),
            ],
        ),
        migrations.AddConstraint(
            model_name='purchaserequest',
            constraint=models.UniqueConstraint(condition=models.Q(('state', 'draft')), fields=('restaurant', 'supplier'), name='purchase_one_supplier_draft'),
        ),
        migrations.AddConstraint(
            model_name='purchaserequestline',
            constraint=models.UniqueConstraint(fields=('request', 'ingredient'), name='purchase_request_ingredient_unique'),
        ),
        migrations.AddConstraint(
            model_name='stock',
            constraint=models.UniqueConstraint(fields=('restaurant', 'ingredient'), name='stock_restaurant_ingredient_unique'),
        ),
        migrations.AddConstraint(
            model_name='stock',
            constraint=models.CheckConstraint(condition=models.Q(('qty__gte', 0)), name='stock_nonnegative'),
        ),
        migrations.AddConstraint(
            model_name='stockmove',
            constraint=models.UniqueConstraint(fields=('organization', 'request_key'), name='stock_move_org_key_unique'),
        ),
    ]
