# Migración generada por Django para domicilios.

import django.db.models.deletion
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loyalty', '0003_mysql_claves_exactas'),
        ('tenancy', '0013_tono_del_asistente'),
    ]

    operations = [
        migrations.CreateModel(
            name='CustomerAddress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(default='Casa', max_length=60)),
                ('text', models.CharField(max_length=300)),
                ('details', models.CharField(blank=True, default='', max_length=200)),
                ('latitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('longitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('last_used_at', models.DateTimeField(null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='CustomerDinerIdentity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.UUIDField()),
            ],
        ),
        migrations.AddField(
            model_name='customer',
            name='data_consent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='customer',
            name='data_consent_channel',
            field=models.CharField(blank=True, default='', max_length=8),
        ),
        migrations.AddField(
            model_name='customer',
            name='data_consent_revoked_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='customer',
            name='data_consent_version',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='customer',
            name='normalized_phone',
            field=tenancy.fields.ExactCharField(blank=True, max_length=13, null=True),
        ),
        migrations.AddConstraint(
            model_name='customer',
            constraint=models.UniqueConstraint(fields=('organization', 'normalized_phone'), name='customer_org_phone_unique'),
        ),
        migrations.AddField(
            model_name='customeraddress',
            name='customer',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='addresses', to='loyalty.customer'),
        ),
        migrations.AddField(
            model_name='customerdineridentity',
            name='customer',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='loyalty.customer'),
        ),
        migrations.AddField(
            model_name='customerdineridentity',
            name='organization',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization'),
        ),
        migrations.AddConstraint(
            model_name='customerdineridentity',
            constraint=models.UniqueConstraint(fields=('organization', 'key'), name='customer_diner_identity_unique'),
        ),
    ]
