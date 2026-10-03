"""Conserva los acuerdos existentes y comienza el historial sin refacturar el pasado."""
from zoneinfo import ZoneInfo

from decimal import Decimal

from django.db import migrations
from django.db.models import F
from django.utils import timezone


NOMBRES = {
    'nucleo': 'Núcleo', 'salon': 'Salón', 'cocina': 'Cocina', 'inventario': 'Inventario',
    'facturacion': 'Facturación electrónica', 'menu_comensal': 'Menú del comensal',
    'pagos_en_linea': 'Pagos en línea', 'datafono': 'Datáfono integrado',
    'fidelizacion': 'Fidelización', 'reservas': 'Reservas', 'asistente_menu': 'Asistente en el menú',
    'asistente_whatsapp': 'Asistente de WhatsApp', 'multisucursal': 'Varios locales',
}


def conservar_precios(apps, schema_editor):
    Organization = apps.get_model('tenancy', 'Organization')
    Restaurant = apps.get_model('tenancy', 'Restaurant')
    RecurringPeriod = apps.get_model('tenancy', 'RecurringPeriod')
    PlatformSettings = apps.get_model('tenancy', 'PlatformSettings')
    UsageRecord = apps.get_model('tenancy', 'UsageRecord')
    SubscriptionCharge = apps.get_model('tenancy', 'SubscriptionCharge')
    OrganizationModule = apps.get_model('tenancy', 'OrganizationModule')
    now = timezone.now()
    for org in Organization.objects.all().iterator():
        org.pricing = {'mode': 'personalizado', 'local_monthly': str(org.monthly_price)}
        org.billing_history_starts = now
        org.save(update_fields=['pricing', 'billing_history_starts'])
        period = now.astimezone(ZoneInfo(org.timezone)).strftime('%Y-%m')
        charge = SubscriptionCharge.objects.filter(organization=org, period=period, kind='mensualidad').first()
        prepaid = {}
        if charge:
            for local in Restaurant.objects.filter(organization=org):
                line = charge.lines.filter(concept=f'Mensualidad · {local.name}', unit='local').first()
                if line:
                    prepaid[f'local:{local.pk}'] = {'module': 'nucleo', 'name': local.name, 'amount': str(line.total),
                                                  'price': {'field': 'local_monthly', 'fixed': str(line.total)}}
            charge.advance = prepaid
            charge.save(update_fields=['advance'])
        for local in Restaurant.objects.filter(organization=org, active=True):
            RecurringPeriod.objects.get_or_create(organization=org, component=f'local:{local.pk}', ends=None,
                defaults={'module': 'nucleo', 'name': local.name, 'price': {'field': 'local_monthly', 'fixed': str(org.monthly_price)},
                          'starts': now})
        locals_ = list(Restaurant.objects.filter(organization=org, active=True))
        overrides = {(row.restaurant_id, row.key): row for row in OrganizationModule.objects.filter(organization=org, starts__lte=now)
                     if row.ends is None or row.ends > now}
        for key, name in NOMBRES.items():
            general = overrides.get((None, key))
            active = general.active if general else key not in ('asistente_whatsapp', 'datafono')
            own = [local for local in locals_ if (local.pk, key) in overrides and overrides[(local.pk, key)].price is not None]
            if active and (not locals_ or len(own) < len(locals_)):
                price = {'field': 'modules'}
                if general and general.price is not None:
                    price['fixed'] = str(general.price)
                RecurringPeriod.objects.get_or_create(organization=org, component=f'modulo:{key}', ends=None,
                    defaults={'module': key, 'name': name, 'price': price, 'starts': now})
            for local in own:
                row = overrides[(local.pk, key)]
                if row.active:
                    # W guardaba estos precios sin cobrarlos: su mensualidad empieza con X.
                    RecurringPeriod.objects.get_or_create(organization=org, component=f'modulo:{key}:{local.pk}', ends=None,
                        defaults={'module': key, 'name': f'{name} · {local.name}',
                                  'price': {'field': 'modules', 'fixed': str(row.price)}, 'starts': now})
    for rules in PlatformSettings.objects.all():
        rules.unit_prices = {'facturacion.documento': 0, 'fidelizacion.codigo_verificacion': 0, **rules.unit_prices}
        rules.save(update_fields=['unit_prices'])
    # W cobraba todo el uso. Su precio queda fijado antes de admitir nuevas personalizaciones.
    rules = PlatformSettings.objects.filter(pk=1).first()
    prices = rules.unit_prices if rules else {'asistente_whatsapp.pedido_asistente': 500}
    UsageRecord.objects.update(overage=F('quantity'), unit_price=0, allocation={
        'allowed': True, 'source': 'excedente', 'remaining_included': '0', 'credits': '0'})
    for key, price in prices.items():
        module, unit = key.split('.', 1)
        UsageRecord.objects.filter(module=module, unit=unit).update(unit_price=Decimal(str(price)))


class Migration(migrations.Migration):
    dependencies = [('tenancy', '0010_precios_recargas_e_intervalos')]
    operations = [migrations.RunPython(conservar_precios, migrations.RunPython.noop)]
