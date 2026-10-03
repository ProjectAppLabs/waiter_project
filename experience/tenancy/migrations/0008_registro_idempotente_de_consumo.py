# Medición y cobro del sistema propio, compatible con MySQL.

import django.core.validators
import django.db.models.deletion
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0007_catalogo_y_excepciones_de_modulos'),
    ]

    operations = [
        migrations.CreateModel(
            name='UsageRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('module', models.CharField(choices=[('nucleo', 'Núcleo'), ('salon', 'Salón'), ('cocina', 'Cocina'), ('inventario', 'Inventario'), ('facturacion', 'Facturación electrónica'), ('menu_comensal', 'Menú del comensal'), ('pagos_en_linea', 'Pagos en línea'), ('datafono', 'Datáfono integrado'), ('fidelizacion', 'Fidelización'), ('reservas', 'Reservas'), ('asistente_menu', 'Asistente en el menú'), ('asistente_whatsapp', 'Asistente de WhatsApp'), ('multisucursal', 'Varios locales')], max_length=32)),
                ('unit', models.CharField(max_length=40)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=20, validators=[django.core.validators.MinValueValidator(0)])),
                ('period', models.CharField(max_length=7)),
                ('key', tenancy.fields.ExactCharField(max_length=200)),
                ('detail', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='usage_records', to='tenancy.organization')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
            ],
            options={
                'indexes': [models.Index(fields=['organization', 'period'], name='uso_organizacion_periodo')],
                'constraints': [models.UniqueConstraint(fields=('organization', 'key'), name='uso_clave_organizacion_unica'), models.CheckConstraint(condition=models.Q(('quantity__gte', 0)), name='uso_cantidad_no_negativa')],
            },
        ),
    ]
