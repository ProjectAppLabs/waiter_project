# Generado por Django 6.1 el 2026-10-02 04:24

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0003_organization_banners_configured_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='address',
            field=models.CharField(blank=True, default='', max_length=250),
        ),
        migrations.AddField(
            model_name='organization',
            name='brand_logo',
            field=models.BinaryField(blank=True, default=bytes),
        ),
        migrations.AddField(
            model_name='organization',
            name='brand_version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='organization',
            name='city',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='organization',
            name='email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.AddField(
            model_name='organization',
            name='fiscal_regime',
            field=models.CharField(blank=True, choices=[('responsable_iva', 'responsable_iva'), ('no_responsable', 'no_responsable'), ('inc', 'inc')], default='', max_length=20),
        ),
        migrations.AddField(
            model_name='organization',
            name='fiscal_responsibilities',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='organization',
            name='phone',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='organization',
            name='tax_id_dv',
            field=models.CharField(blank=True, default='', max_length=1),
        ),
    ]
