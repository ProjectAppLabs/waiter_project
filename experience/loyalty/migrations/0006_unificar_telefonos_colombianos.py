"""Unifica teléfonos anteriores sin perder pedidos, puntos ni identidades de cuenta."""
import re
from django.db import migrations


def normalize(value):
    digits = re.sub(r'[ ()+-]', '', value or '')
    if re.fullmatch(r'(?:3[0-9]{9}|60[1-8][0-9]{7})', digits):
        digits = '57' + digits
    return '+' + digits if re.fullmatch(r'57(?:3[0-9]{9}|60[1-8][0-9]{7})', digits) else None


def forward(apps, schema_editor):
    Customer = apps.get_model('loyalty', 'Customer')
    Card = apps.get_model('loyalty', 'LoyaltyCard')
    Identity = apps.get_model('loyalty', 'CustomerDinerIdentity')
    seen = {}
    for row in Customer.objects.order_by('id').iterator():
        normalized = normalize(row.phone)
        if not normalized:
            continue
        key = row.organization_id, normalized
        target = seen.get(key)
        if target:
            source_card = Card.objects.filter(customer=row).first()
            target_card = Card.objects.filter(customer=target).first()
            if source_card and target_card:
                for model in apps.get_models():
                    for field in model._meta.fields:
                        if field.is_relation and field.related_model == Card:
                            model.objects.filter(**{field.name: source_card}).update(**{field.name: target_card})
                target_card.points += source_card.points
                target_card.save(update_fields=['points'])
                source_card.delete()
            if row.diner_key:
                Identity.objects.get_or_create(organization_id=row.organization_id, key=row.diner_key, defaults={'customer': target})
            for model in apps.get_models():
                for field in model._meta.fields:
                    if field.is_relation and field.related_model == Customer:
                        model.objects.filter(**{field.name: row}).update(**{field.name: target})
            row.delete()
        else:
            Customer.objects.filter(pk=row.pk).update(normalized_phone=normalized)
            seen[key] = row


class Migration(migrations.Migration):
    dependencies = [
        ('reservations', '0003_mysql_token_exacto'),
        ('loyalty', '0005_identidad_del_comensal_por_cookie'),
        ('sales', '0010_domicilios_cobertura_direcciones_y_recibo'),
        ('billing', '0004_notas_credito'),
    ]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
