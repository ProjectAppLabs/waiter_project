# Generada con Django 6.1 el 2026-10-03.

import django.db.models.deletion
import django.utils.timezone
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_mysql_asistencia_abierta'),
        ('sales', '0007_mysql_caja_abierta_y_claves'),
        ('tenancy', '0006_organization_suspension_by_billing_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='refunded',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=16),
        ),
        migrations.AddField(
            model_name='orderline',
            name='stock_usage',
            field=models.JSONField(default=list),
        ),
        migrations.CreateModel(
            name='Refund',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lines', models.JSONField(default=list)),
                ('tip', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('reason', models.CharField(max_length=500)),
                ('restock', models.BooleanField(default=False)),
                ('request_key', tenancy.fields.ExactCharField(max_length=80)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='accounts.account')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='refunds', to='sales.order')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.organization')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
                ('shift', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='refunds', to='sales.cashshift')),
            ],
        ),
        migrations.CreateModel(
            name='RefundPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('method', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='sales.paymentmethod')),
                ('refund', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payments', to='sales.refund')),
            ],
        ),
        migrations.AddIndex(
            model_name='refund',
            index=models.Index(fields=['restaurant', 'created_at'], name='refund_restaurant_date'),
        ),
        migrations.AddConstraint(
            model_name='refund',
            constraint=models.UniqueConstraint(fields=('organization', 'request_key'), name='refund_org_key_unique'),
        ),
        migrations.AddConstraint(
            model_name='refund',
            constraint=models.CheckConstraint(condition=models.Q(('tip__gte', 0), ('total__gte', 0)), name='refund_nonnegative'),
        ),
        migrations.AddConstraint(
            model_name='refundpayment',
            constraint=models.UniqueConstraint(fields=('refund', 'method'), name='refund_method_unique'),
        ),
        migrations.AddConstraint(
            model_name='refundpayment',
            constraint=models.CheckConstraint(condition=models.Q(('amount__gt', 0)), name='refund_payment_positive'),
        ),
    ]
