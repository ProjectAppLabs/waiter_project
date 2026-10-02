# Generada por Django 6.1 el 2026-10-02 04:55

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_account_notify_prefs'),
        ('sales', '0004_order_customer_orderline_loyalty_card_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='channel_request',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='orderline',
            name='coupon_code',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
        migrations.AlterField(
            model_name='order',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='accounts.account'),
        ),
        migrations.AlterField(
            model_name='payment',
            name='account',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, to='accounts.account'),
        ),
    ]
