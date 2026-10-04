"""Contrato Y3–Y4 por las entradas HTTP reales."""

from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from cryptography.fernet import Fernet
from django.contrib.auth.hashers import check_password
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Attendance, Session
from catalog.models import Product
from tenancy.models import (
    OrganizationAudit,
    PlatformAudit,
    PlatformSession,
    PlatformSettings,
    SupportGrant,
    TwoFactorChallenge,
)
from tenancy.two_factor import totp

from .helpers import PASSWORD, account, organization, platform_user, pos_client, restaurant

pytestmark = pytest.mark.django_db
P = "/api/platform/v1/"
S = "/api/pos/v1/"


@pytest.fixture
def cifrado(settings):
    settings.PAYMENTS_FERNET_KEY = Fernet.generate_key().decode()


def iniciar(usuario):
    cliente = APIClient()
    respuesta = cliente.post(P + "auth/login", {"login": usuario.username, "password": PASSWORD}, format="json")
    assert respuesta.status_code == 200
    return cliente, respuesta.data


def activar(usuario):
    cliente, _ = iniciar(usuario)
    alta = cliente.post(P + "auth/2fa/setup", {}, format="json")
    assert alta.status_code == 200, alta.data
    secreto = alta.data["secret"]
    codigo = totp(secreto, int(timezone.now().timestamp()) // 30)
    respuesta = cliente.post(P + "auth/2fa/enable", {"code": codigo}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    return cliente, secreto, respuesta.data["recovery_codes"]


def test_administrador_debe_activar_y_operador_puede_elegir(cifrado):
    # Falla si el administrador sin 2FA usa la consola o se impide el alta y el cierre de su sesión.
    usuario = platform_user()
    cliente, _ = iniciar(usuario)
    assert cliente.get(P + "organizations").data["error"] == "two_factor_required"
    assert PlatformSettings.objects.get().require_2fa is True
    estado = cliente.get(P + "auth/me").data
    assert estado["two_factor_required"] and not estado["two_factor"]
    assert cliente.post(P + "auth/2fa/setup", {}, format="json").status_code == 200
    assert cliente.post(P + "auth/logout").status_code == 200
    operador, _ = iniciar(platform_user("operator", "operador"))
    assert operador.get(P + "organizations").status_code == 200


def test_totp_respaldo_de_un_uso_y_contrasena_sin_sesion(cifrado):
    # Falla si basta la contraseña, se expone el secreto sin cifrar o se reutiliza un código de respaldo.
    usuario = platform_user()
    cliente, secreto, codigos = activar(usuario)
    assert len(codigos) == len(set(codigos)) == 10
    usuario.refresh_from_db()
    assert secreto not in usuario.totp_secret and secreto not in usuario.totp_pending
    assert all(c not in usuario.recovery_hashes for c in codigos)
    assert check_password(codigos[0], usuario.recovery_hashes[0])
    cliente.post(P + "auth/logout")
    entrada, respuesta = iniciar(usuario)
    assert respuesta["two_factor"] is True and not entrada.cookies.get("waiter_platform_sid").value
    assert not PlatformSession.objects.exists()
    assert entrada.get(P + "organizations").status_code == 401
    verificado = entrada.post(
        P + "auth/2fa/verify", {"challenge": respuesta["challenge"], "code": codigos[0]}, format="json"
    )
    assert verificado.data["user"]["id"] == usuario.pk
    assert entrada.get(P + "organizations").status_code == 200
    otro, reto = iniciar(usuario)
    assert (
        otro.post(
            P + "auth/2fa/verify", {"challenge": reto["challenge"], "code": codigos[0]}, format="json"
        ).status_code
        == 400
    )
    assert (
        entrada.post(
            P + "auth/2fa/verify", {"challenge": respuesta["challenge"], "code": codigos[1]}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.parametrize("caso", ["vencido", "cinco_intentos"])
def test_desafio_vencido_o_agotado_no_crea_sesion(cifrado, caso):
    # Falla si un desafío vencido o agotado acepta después un código correcto.
    usuario = platform_user()
    _, _, codigos = activar(usuario)
    cliente, respuesta = iniciar(usuario)
    if caso == "vencido":
        TwoFactorChallenge.objects.update(expires=timezone.now() - timedelta(seconds=1))
    else:
        for _ in range(5):
            assert (
                cliente.post(
                    P + "auth/2fa/verify", {"challenge": respuesta["challenge"], "code": "errado"}, format="json"
                ).status_code
                == 400
            )
        assert TwoFactorChallenge.objects.get().attempts == 5
    final = cliente.post(P + "auth/2fa/verify", {"challenge": respuesta["challenge"], "code": codigos[0]}, format="json")
    # También falla si el código de error no deja al POS distinguir el desafío muerto de un código mal escrito.
    assert final.status_code == 400 and final.json()["error"] == "challenge_expired"


def test_totp_rfc6238_ventana_y_repeticion(cifrado):
    # Falla si el cálculo no sigue RFC 6238 o permite reutilizar el intervalo del código.
    import base64

    from experience_app.payments.crypto import encrypt
    from tenancy.two_factor import accept_code

    secreto = base64.b32encode(b"12345678901234567890").decode()
    assert totp(secreto, 59 // 30) == "287082"
    usuario = platform_user(totp_secret=encrypt({"secret": secreto}), two_factor=True)
    paso = int(timezone.now().timestamp()) // 30
    assert not accept_code(usuario, totp(secreto, paso - 2))
    assert accept_code(usuario, totp(secreto, paso - 1))
    assert not accept_code(usuario, totp(secreto, paso - 1))
    assert accept_code(usuario, totp(secreto, paso + 1))


def test_restablecimiento_invalida_sesiones_y_deja_auditoria(cifrado):
    # Falla si el operador restablece 2FA o quedan sesiones y desafíos anteriores después del restablecimiento.
    administrador = platform_user()
    cliente, _, _ = activar(administrador)
    operador = platform_user("operator", "operador")
    consola, _, _ = activar(operador)
    iniciar(operador)
    assert consola.post(P + f"team/{administrador.pk}/reset_2fa").status_code == 403
    assert cliente.post(P + f"team/{operador.pk}/reset_2fa").status_code == 200
    operador.refresh_from_db()
    assert not operador.two_factor and not operador.totp_secret and not operador.recovery_hashes
    assert not operador.sessions.exists() and not TwoFactorChallenge.objects.filter(user=operador).exists()
    assert PlatformAudit.objects.filter(action="two_factor.reset", actor=administrador).exists()


@pytest.fixture
def soporte():
    org = organization()
    local = restaurant(org)
    dueno = account(org)
    cliente = pos_client(dueno)
    agente = platform_user("operator")
    plataforma, _ = iniciar(agente)
    ruta = P + f"organizations/{org.slug}/support"
    return org, local, dueno, cliente, agente, plataforma, ruta


def conceder(soporte):
    org, _, _, cliente, _, plataforma, ruta = soporte
    respuesta = cliente.post(S + "support", {"reason": "Revisar el catálogo"}, format="json")
    assert respuesta.status_code == 201, respuesta.data
    acceso = respuesta.data["grant"]
    entrada = plataforma.post(ruta + "/enter", {}, format="json")
    assert entrada.status_code == 200, entrada.data
    token = parse_qs(urlsplit(entrada.data["url"]).query)["token"][0]
    sesion = APIClient()
    sesion.credentials(HTTP_X_WAITER_ORG=org.slug)
    return acceso, token, sesion


def test_pedido_aprobacion_aviso_correo_y_limites(soporte, django_capture_on_commit_callbacks):
    # Falla si la plataforma entra sin permiso, si no se avisa al dueño o se concede una vigencia superior a 72 horas.
    from django.core import mail

    from notifications.models import Notification

    _, _, dueno, cliente, _, plataforma, ruta = soporte
    assert plataforma.post(ruta + "/enter").status_code == 403
    assert plataforma.post(ruta, {"reason": "Revisión", "hours": 73}, format="json").status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        respuesta = plataforma.post(ruta, {"reason": "Revisión", "hours": 2}, format="json")
    assert respuesta.status_code == 201, respuesta.data
    acceso = respuesta.data["grant"]
    assert acceso["state"] == "pedido" and Notification.objects.filter(recipient=dueno, res_model="support").exists()
    assert "Revisión" in mail.outbox[-1].body
    assert plataforma.post(ruta + "/enter").status_code == 403
    assert cliente.post(S + f"support/{acceso['id']}/approve").data["grant"]["state"] == "vigente"
    assert plataforma.post(ruta + "/enter").status_code == 200


def test_canje_unico_limites_historial_y_salida_independiente(soporte):
    # Falla si el token sirve dos veces, soporte cambia credenciales o sus cambios no llevan identidad de soporte.
    org, _, dueno, cliente, agente, _, _ = soporte
    acceso, token, sesion = conceder(soporte)
    respuesta = sesion.post(S + "auth/support", {"token": token}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.data["attendance_id"] is None
    assert respuesta.cookies["waiter_sid"]["httponly"]
    assert respuesta.data["support"] == {"until": acceso["until"], "agent": agente.name}
    assert sesion.get(S + "auth/me").data["support"] == respuesta.data["support"]
    assert sesion.post(S + "auth/support", {"token": token}, format="json").status_code == 403
    assert (
        sesion.post(
            S + "auth/change_password", {"current": PASSWORD, "next": "otra-clave-segura"}, format="json"
        ).status_code
        == 403
    )
    assert sesion.post(S + f"team/{dueno.pk}/resend_invite").status_code == 403
    assert sesion.post(S + "support", {"reason": "Más tiempo"}, format="json").status_code == 403
    plato = Product.objects.create(organization=org, name="Café", kind="dish", price=100)
    assert sesion.patch(S + f"products/{plato.pk}", {"price": 200}, format="json").status_code == 200
    registro = OrganizationAudit.objects.filter(entity="catalog.product").latest("id")
    assert registro.actor_kind == "platform" and registro.actor_id == agente.pk
    assert registro.actor_name == f"ProjectApp · {agente.name} (soporte)"
    assert registro.before["price"] == 100 and registro.after["price"] == 200
    assert sesion.post(S + "auth/logout").status_code == 200
    assert cliente.get(S + "auth/me").status_code == 200
    assert Attendance.objects.filter(account=dueno, check_out__isnull=True).count() == 1


@pytest.mark.parametrize("caso", ["revocado", "vencido", "token_vencido", "otra_organizacion"])
def test_acceso_y_sesion_no_sobreviven_al_permiso(soporte, caso):
    # Falla si el canje o la sesión sobreviven a la revocación, al vencimiento o al cambio de organización.
    from tenancy.models import SupportToken

    _, _, _, cliente, _, plataforma, ruta = soporte
    acceso, token, sesion = conceder(soporte)
    if caso in ("revocado", "vencido"):
        assert sesion.post(S + "auth/support", {"token": token}, format="json").status_code == 200
        nuevo = parse_qs(urlsplit(plataforma.post(ruta + "/enter").data["url"]).query)["token"][0]
        if caso == "revocado":
            assert cliente.post(S + f"support/{acceso['id']}/revoke").status_code == 200
        else:
            SupportGrant.objects.filter(pk=acceso["id"]).update(until=timezone.now() - timedelta(seconds=1))
        assert sesion.get(S + "auth/me").status_code == 401
        assert sesion.post(S + "auth/support", {"token": nuevo}, format="json").status_code == 403
        assert plataforma.post(ruta + "/enter").status_code == 403
    else:
        if caso == "token_vencido":
            SupportToken.objects.update(expires=timezone.now() - timedelta(seconds=1))
        else:
            sesion.credentials(HTTP_X_WAITER_ORG=organization("otra-organizacion").slug)
        assert sesion.post(S + "auth/support", {"token": token}, format="json").status_code == 403
    assert not Session.objects.filter(support_grant_id=acceso["id"]).exists()


def test_inicio_unico_pasa_del_restaurante_al_desafio_projectapp(cifrado):
    # Falla si el intento inicial del POS impide continuar al desafío de ProjectApp o crea una sesión prematura.
    usuario = platform_user()
    _, _, codigos = activar(usuario)
    org = organization()
    cliente = APIClient()
    cliente.credentials(HTTP_X_WAITER_ORG=org.slug)
    assert (
        cliente.post(S + "auth/login", {"login": usuario.username, "password": PASSWORD}, format="json").data["error"]
        == "invalid_credentials"
    )
    reto = cliente.post(P + "auth/login", {"login": usuario.username, "password": PASSWORD}, format="json").data
    assert reto["two_factor"] and not cliente.cookies.get("waiter_platform_sid").value
    resultado = cliente.post(P + "auth/2fa/verify", {"challenge": reto["challenge"], "code": codigos[0]}, format="json")
    assert resultado.status_code == 200 and resultado.data["user"]["id"] == usuario.pk
    assert not Session.objects.exists()


def test_codigo_totp_crea_sesion_y_desactivar_exige_otro_codigo(cifrado):
    # Falla si un TOTP vigente no autentica, se reutiliza para desactivar o se omite la obligación después de desactivar.
    usuario = platform_user()
    _, secreto, codigos = activar(usuario)
    cliente, reto = iniciar(usuario)
    codigo = totp(secreto, int(timezone.now().timestamp()) // 30 + 1)
    assert (
        cliente.post(P + "auth/2fa/verify", {"challenge": reto["challenge"], "code": codigo}, format="json").status_code
        == 200
    )
    assert cliente.post(P + "auth/2fa/disable", {"code": codigo}, format="json").status_code == 400
    assert cliente.post(P + "auth/2fa/disable", {"code": codigos[0]}, format="json").status_code == 200
    assert cliente.get(P + "organizations").data["error"] == "two_factor_required"
    assert cliente.get(P + "auth/me").data["two_factor"] is False


def test_soporte_no_ve_secretos_y_cambios_pasarela_quedan_registrados(soporte, cifrado):
    # Falla si soporte obtiene secretos de pasarela o el historial conserva credenciales en claro o cifradas.
    import json

    from experience_app.models import PaymentGateway

    _, local, _, cliente, _, _, _ = soporte
    ruta = S + "admin/payment_gateways"
    configuracion = {
        "environment": "test",
        "public_key": "pub_test_12345678",
        "private_key": "prv_test_12345678",
        "events": "test_events_12345678",
        "integrity": "test_integrity_12345678",
    }
    respuesta = cliente.post(
        ruta, {"action": "set", "restaurant_id": local.pk, "configuration": configuracion}, format="json"
    )
    assert respuesta.status_code == 200, respuesta.data
    _, token, sesion = conceder(soporte)
    assert sesion.post(S + "auth/support", {"token": token}, format="json").status_code == 200
    respuesta = sesion.post(ruta, {"action": "get", "restaurant_id": local.pk}, format="json")
    assert respuesta.status_code == 200
    historial = list(OrganizationAudit.objects.filter(entity="experience_app.paymentgateway").values("before", "after"))
    assert historial
    contenido = json.dumps(historial) + respuesta.content.decode()
    for nombre in ("private_key", "events", "integrity"):
        assert configuracion[nombre] not in contenido
    assert PaymentGateway.objects.get().secrets_cipher not in contenido


def test_flujo_de_eventos_cierra_al_revocar_soporte(soporte):
    # Falla si la conexión de eventos ya abierta sigue entregando datos después de revocar soporte.
    from realtime.api import stream

    org, local, _, cliente, _, _, _ = soporte
    acceso, token, sesion = conceder(soporte)
    assert sesion.post(S + "auth/support", {"token": token}, format="json").status_code == 200
    activa = Session.objects.get(support_grant_id=acceso["id"])
    flujo = stream(org.pk, local.pk, 0, iterations=1, support_session_id=activa.pk)
    cliente.post(S + f"support/{acceso['id']}/revoke")
    assert "session_expired" in "".join(flujo)
