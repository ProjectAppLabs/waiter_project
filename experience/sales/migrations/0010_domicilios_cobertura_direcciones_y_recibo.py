# Migración generada por Django para domicilios.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0009_cashmove_request_key'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_details',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_distance_km',
            field=models.DecimalField(decimal_places=3, max_digits=8, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_fee',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=16),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_lat',
            field=models.DecimalField(decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_lng',
            field=models.DecimalField(decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_payment',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
    ]
