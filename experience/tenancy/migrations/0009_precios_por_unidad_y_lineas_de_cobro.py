# Medición y cobro del sistema propio, compatible con MySQL.

import django.core.validators
import django.db.models.deletion
import tenancy.pricing
from django.db import migrations, models


def conservar_cobros_anteriores(apps, schema_editor):
    Charge = apps.get_model('tenancy', 'SubscriptionCharge')
    Line = apps.get_model('tenancy', 'SubscriptionChargeLine')
    for charge in Charge.objects.filter(amount__gt=0).iterator():
        Line.objects.create(charge=charge, concept='Suscripción anterior', module='nucleo', unit='periodo',
                            quantity=1, unit_price=charge.amount, total=charge.amount)


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0008_registro_idempotente_de_consumo'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='unit_prices',
            field=models.JSONField(default=tenancy.pricing.default_unit_prices),
        ),
        migrations.CreateModel(
            name='SubscriptionChargeLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('concept', models.CharField(max_length=250)),
                ('module', models.CharField(choices=[('nucleo', 'Núcleo'), ('salon', 'Salón'), ('cocina', 'Cocina'), ('inventario', 'Inventario'), ('facturacion', 'Facturación electrónica'), ('menu_comensal', 'Menú del comensal'), ('pagos_en_linea', 'Pagos en línea'), ('datafono', 'Datáfono integrado'), ('fidelizacion', 'Fidelización'), ('reservas', 'Reservas'), ('asistente_menu', 'Asistente en el menú'), ('asistente_whatsapp', 'Asistente de WhatsApp'), ('multisucursal', 'Varios locales')], max_length=32)),
                ('unit', models.CharField(max_length=40)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=20, validators=[django.core.validators.MinValueValidator(0)])),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=14, validators=[django.core.validators.MinValueValidator(0)])),
                ('total', models.DecimalField(decimal_places=2, max_digits=14, validators=[django.core.validators.MinValueValidator(0)])),
                ('charge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='tenancy.subscriptioncharge')),
            ],
            options={
                'ordering': ['id'],
                'constraints': [models.CheckConstraint(condition=models.Q(('quantity__gt', 0), ('total__gt', 0), ('unit_price__gt', 0)), name='linea_cobro_valores_positivos')],
            },
        ),
        migrations.RunPython(conservar_cobros_anteriores, migrations.RunPython.noop),
    ]
