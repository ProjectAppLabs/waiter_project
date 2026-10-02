# Generada por Django 6.1 el 2026-10-02 03:56

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loyalty', '0001_initial'),
        ('sales', '0003_cashmove_cash_move_positive_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='customer',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='loyalty.customer'),
        ),
        migrations.AddField(
            model_name='orderline',
            name='loyalty_card',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='loyalty.loyaltycard'),
        ),
        migrations.AddField(
            model_name='orderline',
            name='points_cost',
            field=models.DecimalField(decimal_places=6, default=0, max_digits=18),
        ),
    ]
