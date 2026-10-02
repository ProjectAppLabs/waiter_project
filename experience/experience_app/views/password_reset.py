import hashlib
import secrets
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.models import DinerAccount, DinerPasswordReset, Diner, CartLine
from experience_app.adapters.core.pos import resolve


@api_view(['POST'])
def request_reset(request):
    data = request.data if isinstance(request.data, dict) else {}
    email = str(data.get('correo', '')).strip().lower()[:120]
    from .account import _diner
    diner = _diner(request)
    return send_reset_link(request, email, diner.session.restaurant_slug, diner.session.venue_slug)


def send_reset_link(request, email, restaurant, venue, *, authenticated=False):
    if not settings.DINER_EMAIL_ENABLED:
        return Response({'detail': 'La verificación por correo todavía no está habilitada. Tu contraseña no se ha cambiado.'}, status=503)
    tenant = resolve(restaurant, venue)
    key = 'diner-reset:' + hashlib.sha256((restaurant + ':' + request.META.get('REMOTE_ADDR', '') + ':' + email).encode()).hexdigest()
    if cache.get(key):
        return Response({'detail': 'Espera unos minutos antes de pedir otro enlace.'}, status=429)
    cache.set(key, True, 300)
    account = DinerAccount.objects.filter(organization_slug=restaurant, email__iexact=email, verified=True).first()
    if account:
        token = secrets.token_urlsafe(32)
        row = DinerPasswordReset.objects.create(account=account, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=timezone.now()+timezone.timedelta(minutes=20))
        link = f'{settings.DINER_PUBLIC_URL}/{tenant.restaurant_slug}/{tenant.venue_slug}/cuenta/restablecer/?{urlencode({"token": token})}'
        try:
            send_mail('Recupera tu cuenta', f'Abre este enlace para crear una nueva contraseña. Vence en 20 minutos y solo puede usarse una vez.\n\n{link}\n\nSi no solicitaste el cambio, ignora este correo.', settings.DEFAULT_FROM_EMAIL, [account.email], fail_silently=False)
        except Exception:
            row.delete()
            if authenticated:
                return Response({'detail': 'No pudimos enviar el enlace. Intenta de nuevo más tarde; tu contraseña no ha cambiado.'}, status=503)
            # Uniform response avoids revealing whether an address exists or delivery failed.
            pass
    if authenticated:
        return Response({'ok': True, 'detail': 'Enviamos un enlace a tu correo. Ábrelo para verificar tu identidad y elegir la nueva contraseña.'})
    return Response({'ok': True, 'detail': 'Si el correo tiene una cuenta, recibirá un enlace para restablecer la contraseña.'})


@api_view(['POST'])
def reset(request):
    from .account import _diner
    diner = _diner(request)
    data = request.data if isinstance(request.data, dict) else {}
    token, password = data.get('token', ''), data.get('nueva', '')
    if not isinstance(token, str) or len(token) > 200 or not isinstance(password, str) or not 10 <= len(password) <= 128 or password.isdigit():
        return Response({'detail': 'Revisa el enlace y usa una contraseña de entre 10 y 128 caracteres.'}, status=400)
    with transaction.atomic():
        row = DinerPasswordReset.objects.select_related('account').filter(account__organization_slug=diner.session.restaurant_slug, token_hash=hashlib.sha256(token.encode()).hexdigest(), used_at__isnull=True, expires_at__gt=timezone.now()).first()
        if not row or password.lower() in [row.account.email.lower(), row.account.name.lower()]:
            return Response({'detail': 'El enlace no es válido o ya venció.'}, status=400)
        # Conditional update makes a token single use even with concurrent submissions.
        if not DinerPasswordReset.objects.filter(pk=row.pk, used_at__isnull=True).update(used_at=timezone.now()):
            return Response({'detail': 'Este enlace ya fue utilizado.'}, status=400)
        row.account.password = make_password(password)
        row.account.save(update_fields=['password'])
        CartLine.objects.filter(diner__account=row.account, account__isnull=True, order__isnull=False).update(account=row.account)
        Diner.objects.filter(account=row.account).update(account=None)
        DinerPasswordReset.objects.filter(account=row.account, used_at__isnull=True).update(used_at=timezone.now())
    return Response({'ok': True})
