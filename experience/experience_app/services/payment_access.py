"""Entrada a las credenciales de pago con un código enviado al correo del dueño.

El código tiene 6 dígitos, vence en 10 minutos, admite 5 intentos y sirve una sola vez. Al acertarlo se entrega un acceso
de 15 minutos que sirve para un solo cambio (conectar, activar o desconectar); para otro cambio se pide otro código.
Solo se guardan huellas HMAC del código y del acceso.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape, strip_tags

from experience_app.models import PaymentAccess
from tenancy.http import require

logger = logging.getLogger(__name__)
CODE_TTL, GRANT_TTL, RESEND = timedelta(minutes=10), timedelta(minutes=15), timedelta(seconds=60)
MAX_ATTEMPTS = 5


def _hash(account, kind, value):
    return hmac.new(settings.SECRET_KEY.encode(), f'pagos:{kind}:{account.pk}:{value}'.encode(), hashlib.sha256).hexdigest()


def masked(email):
    user, _, domain = email.partition('@')
    return f'{user[:2]}•••@{domain}'


def _row(account):
    return PaymentAccess.objects.select_for_update().get_or_create(account=account)[0]


def request_code(account):
    require(account.role == 'owner', 'Solo el dueño puede entrar a las credenciales de pago.', 'forbidden', 403)
    require(account.email, 'Tu cuenta no tiene correo. Agrégalo en Equipo para recibir el código.', 'email_required', 400)
    now = timezone.now()
    with transaction.atomic():
        row = _row(account)
        require(not row.code_sent_at or now - row.code_sent_at >= RESEND, 'Ya te enviamos un código. Espera un minuto para pedir otro.', 'too_soon', 429)
        code = f'{secrets.randbelow(1_000_000):06d}'
        row.code_hash, row.code_expires, row.code_attempts, row.code_sent_at = _hash(account, 'codigo', code), now + CODE_TTL, 0, now
        row.save()
        body = (f'<p>Hola {escape(account.name)},</p><p>Tu código para entrar a <strong>Pagos en línea</strong> en Waiter es:</p>'
                f'<p style="font-size:24px;letter-spacing:4px"><strong>{code}</strong></p>'
                '<p>Sirve una sola vez y vence en 10 minutos. Nadie de Waiter te lo va a pedir.</p>'
                '<p>Si no fuiste tú, cambia tu contraseña: alguien con tu usuario intentó entrar a las credenciales de pago.</p>'
                '<p>— Equipo ProjectApp</p>')
        mail = EmailMultiAlternatives('Tu código para entrar a Pagos en línea', strip_tags(body.replace('</p>', '</p>\n')).strip(),
                                      settings.EMAIL_FROM, [account.email])
        mail.attach_alternative(body, 'text/html')
        try:
            sent = mail.send(using='waiter')
        except Exception as error:
            logger.warning('payment_access_mail_failed exception_type=%s', type(error).__name__)
            sent = 0
        # Si el correo no sale, el código no queda vivo (la transacción se revierte) y se puede reintentar.
        require(sent, 'No pudimos enviar el correo. Inténtalo de nuevo en un momento.', 'mail_failed', 503)
    return {'correo': masked(account.email), 'vence': (now + CODE_TTL).isoformat()}


def verify_code(account, code):
    require(account.role == 'owner', 'Solo el dueño puede entrar a las credenciales de pago.', 'forbidden', 403)
    require(isinstance(code, str) and code.strip().isdigit() and len(code.strip()) == 6, 'Escribe los 6 dígitos del código.', 'invalid_data', 400)
    now = timezone.now()
    with transaction.atomic():
        row = _row(account)
        require(row.code_hash and row.code_expires and row.code_expires > now, 'El código venció o ya se usó. Pide uno nuevo.', 'code_expired', 400)
        require(row.code_attempts < MAX_ATTEMPTS, 'Demasiados intentos. Pide un código nuevo.', 'too_many_attempts', 429)
        row.code_attempts += 1
        if not hmac.compare_digest(row.code_hash, _hash(account, 'codigo', code.strip())):
            left = MAX_ATTEMPTS - row.code_attempts
            if not left:
                row.code_hash = ''
            # El intento fallido queda contado: se responde el error sin revertir la transacción.
            row.save()
            return {'ok': False, 'detail': f'El código no es correcto. Te quedan {left} intentos.' if left else 'Demasiados intentos. Pide un código nuevo.'}
        token = secrets.token_urlsafe(32)
        row.code_hash, row.grant_hash, row.grant_expires = '', _hash(account, 'acceso', token), now + GRANT_TTL
        row.save()
    return {'ok': True, 'acceso': token, 'vence': row.grant_expires.isoformat()}


def check(account, token, consume=False):
    """Exige un acceso vigente; `consume` lo gasta (los cambios sirven una sola vez por código)."""
    require(account.role == 'owner', 'Solo el dueño puede entrar a las credenciales de pago.', 'forbidden', 403)
    with transaction.atomic():
        row = PaymentAccess.objects.select_for_update().filter(account=account).first()
        valid = (row and isinstance(token, str) and row.grant_hash and row.grant_expires and row.grant_expires > timezone.now()
                 and hmac.compare_digest(row.grant_hash, _hash(account, 'acceso', token)))
        require(valid, 'Para entrar a Pagos en línea pide un código a tu correo.', 'access_required', 403)
        if consume:
            row.grant_hash, row.grant_expires = '', None
            row.save(update_fields=['grant_hash', 'grant_expires'])
