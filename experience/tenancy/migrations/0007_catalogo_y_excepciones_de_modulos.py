# Catálogo de módulos y excepciones por organización o local.

import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def normalizar_planes(apps, schema_editor):
    apps.get_model('tenancy', 'Organization').objects.all().update(plan='completo')


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0006_organization_suspension_by_billing_and_more'),
    ]

    operations = [
        migrations.RunPython(normalizar_planes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='organization',
            name='plan',
            field=models.CharField(choices=[('completo', 'Completo'), ('inicial', 'Inicial (reservado)')], default='completo', max_length=40),
        ),
        migrations.AlterField(
            model_name='platformaudit',
            name='action',
            field=models.CharField(choices=[('organization.created', 'organization.created'), ('organization.updated', 'organization.updated'), ('organization.suspended', 'organization.suspended'), ('organization.reactivated', 'organization.reactivated'), ('organization.invite_resent', 'organization.invite_resent'), ('platform_user.invited', 'platform_user.invited'), ('platform_user.deactivated', 'platform_user.deactivated'), ('subscription.created', 'subscription.created'), ('subscription.paid', 'subscription.paid'), ('subscription.void', 'subscription.void'), ('subscription.overdue', 'subscription.overdue'), ('subscription.reminder', 'subscription.reminder'), ('billing_settings.updated', 'billing_settings.updated'), ('module_change', 'module_change')], max_length=40),
        ),
        migrations.CreateModel(
            name='OrganizationModule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(choices=[('nucleo', 'Núcleo'), ('salon', 'Salón'), ('cocina', 'Cocina'), ('inventario', 'Inventario'), ('facturacion', 'Facturación electrónica'), ('menu_comensal', 'Menú del comensal'), ('pagos_en_linea', 'Pagos en línea'), ('datafono', 'Datáfono integrado'), ('fidelizacion', 'Fidelización'), ('reservas', 'Reservas'), ('asistente_menu', 'Asistente en el menú'), ('asistente_whatsapp', 'Asistente de WhatsApp'), ('multisucursal', 'Varios locales')], max_length=32)),
                ('active', models.BooleanField(default=True)),
                ('starts', models.DateTimeField(default=django.utils.timezone.now)),
                ('ends', models.DateTimeField(blank=True, null=True)),
                ('limits', models.JSONField(blank=True, default=dict)),
                ('price', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True, validators=[django.core.validators.MinValueValidator(0)])),
                ('notes', models.TextField(blank=True, default='')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization_scope', models.GeneratedField(db_persist=True, expression=models.Case(models.When(models.Q(('restaurant__isnull', True)), then=models.F('organization')), default=None, output_field=models.UUIDField(null=True)), output_field=models.UUIDField(null=True))),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='tenancy.platformuser')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='module_overrides', to='tenancy.organization')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization', 'restaurant', 'key'), name='modulo_local_unico'), models.UniqueConstraint(fields=('organization_scope', 'key'), name='modulo_organizacion_unico')],
            },
        ),
    ]
