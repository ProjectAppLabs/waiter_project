from tenancy.audit import audited
import re

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError

from experience_app.models import PaymentGateway
from experience_app.payments import PROVIDERS
from experience_app.payments.crypto import decrypt, encrypt

SECRET_FIELDS = ('private_key', 'events', 'integrity')


def view(restaurant, venue):
    configs = []
    for environment in ('test', 'prod'):
        config = PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, provider='wompi', environment=environment).first()
        secrets = decrypt(config.secrets_cipher) if config else {}
        configs.append({'environment': environment, 'enabled': bool(config and config.enabled),
            'public_key': config.public_key if config else '',
            'configured': {key: bool(secrets.get(key)) for key in SECRET_FIELDS},
            'payment_method_id': config.payment_method_id if config else None,
            'webhook_path': f'/api/v1/pagos/webhooks/wompi/{restaurant}/{venue}/{environment}/',
            'webhook_url': f'{settings.PAYMENTS_PUBLIC_URL}/api/v1/pagos/webhooks/wompi/{restaurant}/{venue}/{environment}/' if settings.PAYMENTS_PUBLIC_URL else None})
    return {'provider': 'wompi', 'configurations': configs, 'live_available': settings.PAYMENTS_LIVE_ENABLED,
        'methods': PROVIDERS['wompi'].METHODS}


@transaction.atomic
@audited
def save(restaurant, venue, data):
    allowed = {'environment', 'enabled', 'public_key', 'payment_method_id', *SECRET_FIELDS}
    if not isinstance(data, dict) or set(data) - allowed or data.get('environment') not in ('test', 'prod'):
        raise ValidationError({'detail': 'Configuración de pasarela inválida.'})
    from experience_app.adapters.core import pos
    from experience_app.adapters.core.pos import Client
    from experience_app.adapters.core.pos import resolve
    client = Client(resolve(restaurant, venue))
    method = pos.online_method(client)
    if data.get('payment_method_id') not in (None, method.pk):
        raise ValidationError({'detail': 'Selecciona el método Pago en línea de esta organización.'})
    data = {**data, 'payment_method_id': method.pk}
    environment = data['environment']
    config, _ = PaymentGateway.objects.select_for_update().get_or_create(restaurant_slug=restaurant, venue_slug=venue,
        provider='wompi', environment=environment)
    secrets = decrypt(config.secrets_cipher)
    for key, prefix in [('public_key', f'pub_{environment}_'), ('private_key', f'prv_{environment}_'),
                        ('events', f'{environment}_events_'), ('integrity', f'{environment}_integrity_')]:
        value = data.get(key, '')
        if not isinstance(value, str):
            raise ValidationError({'detail': 'Las credenciales deben ser texto.'})
        value = value.strip()
        if not value:
            continue  # Blank means keep, never echo a previously saved secret.
        if not re.fullmatch(re.escape(prefix) + r'[A-Za-z0-9_-]{8,160}', value):
            raise ValidationError({'detail': f'El campo {key} no corresponde al ambiente seleccionado.'})
        if key == 'public_key':
            if config.public_key and config.public_key != value and not all(data.get(k) for k in SECRET_FIELDS):
                raise ValidationError({'detail': 'Al cambiar de cuenta, ingresa también los tres secretos.'})
            config.public_key = value
        else:
            secrets[key] = value
    if 'enabled' in data:
        if type(data['enabled']) is not bool:
            raise ValidationError({'detail': 'Estado de activación inválido.'})
        config.enabled = data['enabled']
    if 'payment_method_id' in data:
        value = data['payment_method_id']
        if value is not None and (type(value) is not int or value <= 0):
            raise ValidationError({'detail': 'Medio contable del POS inválido.'})
        config.payment_method_id = value
    if config.enabled:
        if not config.public_key or not all(secrets.get(key) for key in SECRET_FIELDS):
            raise ValidationError({'detail': 'Completa la llave pública y los tres secretos antes de activar.'})
        if environment == 'prod' and (not settings.PAYMENTS_LIVE_ENABLED or not config.payment_method_id or not settings.PAYMENTS_PUBLIC_URL.startswith('https://')):
            raise ValidationError({'detail': 'Producción requiere habilitación del servidor, HTTPS público y un medio de pago del POS.'})
        PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, enabled=True).exclude(pk=config.pk).update(enabled=False)
    config.secrets_cipher = encrypt(secrets)
    config.save()
    return view(restaurant, venue)
