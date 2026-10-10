from tenancy.audit import audited
import re

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError

from experience_app.models import PaymentGateway
from experience_app.payments import PROVIDERS
from experience_app.payments.crypto import decrypt, encrypt, gateway_context

SECRET_FIELDS = ('private_key', 'events', 'integrity')
LABELS = {'public_key': 'llave pública', 'private_key': 'llave privada', 'events': 'secreto de eventos', 'integrity': 'secreto de integridad'}
PREFIXES = {'public_key': 'pub_{env}_', 'private_key': 'prv_{env}_', 'events': '{env}_events_', 'integrity': '{env}_integrity_'}
ENV_NAMES = {'test': 'pruebas (sandbox)', 'prod': 'producción'}


def hint(key):
    if not key:
        return ''
    prefix = key[:key.index('_', 4) + 1] if key.count('_') >= 2 else ''
    return f'{prefix}…{key[-4:]}'


def parse_keys(text, environment):
    """Las cuatro llaves de un ambiente dentro de lo que el dueño pegó (en cualquier orden, con o sin etiquetas)."""
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValidationError({'detail': 'Pega las llaves de tu panel de Wompi.'})
    found = {}
    for key, prefix in PREFIXES.items():
        pattern = r'(?<![A-Za-z0-9_-])' + re.escape(prefix.format(env=environment)) + r'[A-Za-z0-9_-]{8,160}'
        matches = set(re.findall(pattern, text))
        if len(matches) > 1:
            raise ValidationError({'detail': f'Pegaste dos {LABELS[key]}s distintas. Pega solo las de una cuenta.'})
        if matches:
            found[key] = matches.pop()
    other = 'prod' if environment == 'test' else 'test'
    if not found and any(prefix.format(env=other) in text for prefix in PREFIXES.values()):
        raise ValidationError({'detail': f'Esas llaves son del ambiente de {ENV_NAMES[other]}. Cambia el ambiente o pega las de {ENV_NAMES[environment]}.'})
    missing = [LABELS[k] for k in PREFIXES if k not in found]
    if missing:
        raise ValidationError({'detail': 'Falta: ' + ', '.join(missing) + '. Cópialas de Desarrolladores en tu panel de Wompi.'})
    return found


def view(restaurant, venue):
    configs = []
    for environment in ('test', 'prod'):
        config = PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, provider='wompi', environment=environment).first()
        secrets = decrypt(config.secrets_cipher, gateway_context(config)) if config else {}
        # Las llaves nunca salen del servidor: de la pública solo se muestran el prefijo y los últimos cuatro caracteres.
        configs.append({'environment': environment, 'enabled': bool(config and config.enabled),
            'public_key_hint': hint(config.public_key) if config else '',
            'configured': {key: bool(secrets.get(key)) for key in SECRET_FIELDS},
            'merchant_name': config.merchant_name if config else '', 'checks': config.checks if config else {},
            'verified_at': config.verified_at.isoformat() if config and config.verified_at else None,
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
    secrets = decrypt(config.secrets_cipher, gateway_context(config))
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
    config.secrets_cipher = encrypt(secrets, gateway_context(config))
    config.save()
    return view(restaurant, venue)


def connect(restaurant, venue, environment, text, enable=False):
    """Verifica las llaves con Wompi y, si sirven, las guarda cifradas. Nada se guarda si una comprobación falla.

    Sandbox: un pago de prueba aprobado confirma la llave privada y la firma de integridad; su aviso confirma el secreto
    de eventos. Producción: se confirma el comercio y la llave privada; la integridad y los eventos, con el primer pago.
    """
    import uuid
    from django.utils import timezone
    from experience_app.payments.crypto import PaymentUnavailable
    if environment not in ('test', 'prod'):
        raise ValidationError({'detail': 'Ambiente inválido.'})
    keys = parse_keys(text, environment)
    provider = PROVIDERS['wompi']
    checks = {'comercio': 'pendiente', 'llave_privada': 'pendiente', 'integridad': 'pendiente', 'eventos': 'pendiente'}
    try:
        merchant = provider.merchant(environment, keys['public_key'])
    except PaymentUnavailable:
        merchant = None
    if not merchant:
        return {'ok': False, 'checks': {**checks, 'comercio': 'fallo'}, 'detail': 'Wompi no reconoce la llave pública. Revisa que sea la de tu comercio.'}
    checks['comercio'] = 'ok'
    reference = f'waiter-verificacion-{uuid.uuid4().hex}'
    if environment == 'test':
        checks.update(provider.verify_sandbox(keys['public_key'], keys['private_key'], keys['integrity'], merchant, reference, settings.EMAIL_FROM))
    else:
        checks['llave_privada'] = provider.verify_private(environment, keys['private_key'], reference)
    failed = [name for name, state in checks.items() if state == 'fallo']
    if failed:
        detail = {'llave_privada': 'La llave privada no es válida o no es de la misma cuenta.',
                  'integridad': 'El secreto de integridad no corresponde a la cuenta: Wompi rechazó la firma.'}[failed[0]]
        return {'ok': False, 'checks': checks, 'detail': detail, 'merchant_name': merchant.get('name', '')}
    result = save(restaurant, venue, {**keys, 'environment': environment, 'enabled': bool(enable)})
    PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, provider='wompi', environment=environment).update(
        merchant_name=str(merchant.get('legal_name') or merchant.get('name') or '')[:200], checks=checks,
        verify_reference=reference if environment == 'test' and checks['integridad'] == 'ok' else '', verified_at=timezone.now())
    return {'ok': True, 'checks': checks, 'merchant_name': merchant.get('legal_name') or merchant.get('name', ''), **view(restaurant, venue)}


@transaction.atomic
@audited
def disconnect(restaurant, venue, environment):
    """Borra la conexión de un ambiente: las llaves cifradas se eliminan."""
    if environment not in ('test', 'prod'):
        raise ValidationError({'detail': 'Ambiente inválido.'})
    PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, provider='wompi', environment=environment).delete()
    return view(restaurant, venue)


def event_verified(reference, restaurant, venue, environment, event):
    """El aviso de Wompi del pago de verificación: si su firma cuadra con el secreto de eventos guardado, queda verificado."""
    config = PaymentGateway.objects.filter(restaurant_slug=restaurant, venue_slug=venue, provider='wompi', environment=environment,
                                           verify_reference=reference).first()
    if not config:
        return None
    secrets = decrypt(config.secrets_cipher, gateway_context(config))
    ok = PROVIDERS['wompi'].verified_event(event, secrets.get('events', ''))
    PaymentGateway.objects.filter(pk=config.pk).update(checks={**config.checks, 'eventos': 'ok' if ok else 'fallo'})
    return ok
