"""Segundo factor RFC 6238 y desafíos de un solo uso; ningún secreto sale de su flujo de alta."""

import base64
import hashlib
import hmac
import secrets
import struct
from datetime import timedelta
from urllib.parse import quote

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from accounts.authentication import platform_session, set_cookie
from accounts.services import digest
from billing.qr import image_data
from experience_app.payments.crypto import decrypt, encrypt

from .http import ContractView, payload, require
from .models import PlatformSession, PlatformSettings, PlatformUser, TwoFactorChallenge
from .serialization import user_dict
from .services import audit


def required(user):
    return user.role == "admin" and PlatformSettings.objects.get_or_create(pk=1)[0].require_2fa


def totp(secret, step):
    key = base64.b32decode(secret)
    value = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = value[-1] & 15
    return f"{(struct.unpack('>I', value[offset : offset + 4])[0] & 0x7FFFFFFF) % 1000000:06d}"


def accept_code(user, code, *, pending=False):
    if not isinstance(code, str):
        return False
    secret = decrypt(user.totp_pending if pending else user.totp_secret).get("secret")
    if secret and len(code) == 6 and code.isascii() and code.isdecimal():
        current = int(timezone.now().timestamp()) // 30
        for step in (current, current - 1, current + 1):
            if step > user.totp_last_step and hmac.compare_digest(totp(secret, step), code):
                user.totp_last_step = step
                return True
    if not pending:
        for index, hashed in enumerate(user.recovery_hashes):
            if check_password(code, hashed):
                user.recovery_hashes = user.recovery_hashes[:index] + user.recovery_hashes[index + 1 :]
                return True
    return False


def create_session(user):
    token = secrets.token_hex(32)
    session = PlatformSession.objects.create(
        user=user, token_hash=digest(token), expires=timezone.now() + timedelta(hours=12)
    )
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return user, session, token


def response_session(result):
    user, session, token = result
    return set_cookie(Response({"user": user_dict(user)}), "waiter_platform_sid", token, session.expires)


def challenge(user):
    token = secrets.token_urlsafe(32)
    TwoFactorChallenge.objects.create(
        user=user, token_hash=digest(token), expires=timezone.now() + timedelta(minutes=5)
    )
    return token


class TwoFactorView(ContractView):
    action = None

    def post(self, request):
        if self.action == "verify":
            return self.verify(request)
        session = platform_session(request, allow_setup=True)
        with transaction.atomic():
            user = PlatformUser.objects.select_for_update().get(pk=session.user_id)
            if self.action == "setup":
                payload(request.data, ())
                require(not user.two_factor, "El doble factor ya está activo.", "invalid_data", 400)
                secret = base64.b32encode(secrets.token_bytes(20)).decode()
                user.totp_pending = encrypt({"secret": secret})
                user.totp_last_step = -1
                user.save(update_fields=["totp_pending", "totp_last_step"])
                # El usuario admite solo ASCII; la URI completa cabe en el QR versión 6 existente.
                uri = f"otpauth://totp/Waiter:{quote(user.username)}?secret={secret}&issuer=Waiter"
                return Response({"secret": secret, "otpauth_uri": uri, "qr": image_data(uri)})
            data = payload(request.data, ("code",), ("code",))
            enabling = self.action == "enable"
            require(
                bool(user.totp_pending) if enabling else user.two_factor,
                "Primero prepara el doble factor.",
                "invalid_data",
                400,
            )
            require(accept_code(user, data["code"], pending=enabling), "El código no es válido.", "invalid_code", 400)
            codes = [secrets.token_hex(5) for _ in range(10)] if enabling else []
            user.two_factor = enabling
            user.totp_secret = user.totp_pending if enabling else ""
            user.totp_pending = ""
            user.recovery_hashes = [make_password(code) for code in codes]
            user.save()
            from accounts.models import Session

            from .models import SupportToken

            Session.objects.filter(support_agent=user).delete()
            SupportToken.objects.filter(agent=user).delete()
            user.sessions.exclude(pk=session.pk).delete()
            TwoFactorChallenge.objects.filter(user=user).delete()
            audit(user, None, "two_factor.enabled" if enabling else "two_factor.disabled")
            return Response({"recovery_codes": codes} if enabling else {"ok": True})

    def verify(self, request):
        data = payload(request.data, ("challenge", "code"), ("challenge", "code"))
        require(isinstance(data["challenge"], str), "El desafío no es válido.", "invalid_challenge", 400)
        # Los intentos fallidos deben persistir: el error se genera al salir de la transacción.
        result = None
        with transaction.atomic():
            item = TwoFactorChallenge.objects.select_for_update().filter(token_hash=digest(data["challenge"])).first()
            # Vencido, agotado o inexistente: el POS vuelve a pedir la contraseña en vez de seguir pidiendo códigos.
            dead = not (item and item.expires > timezone.now() and item.attempts < 5)
            if not dead:
                user = PlatformUser.objects.select_for_update().get(pk=item.user_id)
                if user.active and user.activated and user.two_factor and accept_code(user, data["code"]):
                    user.save(update_fields=["totp_last_step", "recovery_hashes"])
                    item.delete()
                    result = create_session(user)
                else:
                    item.attempts += 1
                    item.save(update_fields=["attempts"])
        require(not dead, "El tiempo para escribir el código se acabó. Vuelve a entrar con tu contraseña.", "challenge_expired", 400)
        require(result, "El código no es válido.", "invalid_code", 400)
        return response_session(result)


class ResetTwoFactorView(ContractView):
    def post(self, request, pk):
        actor = platform_session(request).user
        require(actor.role == "admin" and actor.pk != pk)
        with transaction.atomic():
            user = PlatformUser.objects.select_for_update().filter(pk=pk).first()
            require(user, "No encontramos esta persona.", "not_found", 404)
            user.two_factor, user.totp_secret, user.totp_pending = False, "", ""
            user.recovery_hashes, user.totp_last_step = [], -1
            user.save()
            from accounts.services import revoke

            revoke(user)
            TwoFactorChallenge.objects.filter(user=user).delete()
            audit(actor, None, "two_factor.reset", {"user_id": user.pk})
        return Response({"ok": True})
