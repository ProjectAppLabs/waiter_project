"""Inicio de sesión universal: una entrada para todos y un pase de un solo uso hacia el subdominio o la consola."""
import re
from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from cryptography.fernet import Fernet
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Attendance, LoginPass, Session
from accounts.services import revoke
from notifications.models import Notification
from tenancy.models import Organization, PlatformSession
from tenancy.tests.helpers import PASSWORD, account, organization, platform_user, restaurant
from tenancy.tests.test_seguridad_y_soporte import activar

pytestmark = pytest.mark.django_db
A = '/api/access/v1/'
S = '/api/pos/v1/'
P = '/api/platform/v1/'


def entrar(login, password=PASSWORD, client=None):
    return (client or APIClient()).post(A + 'login', {'login': login, 'password': password}, format='json')


def canjear(org_slug, pase):
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org_slug)
    return client, client.post(S + 'auth/pass', {'pass': pase}, format='json')


def test_el_inicio_comun_entrega_un_pase_y_el_subdominio_lo_cambia_por_la_sesion():
    # Falla si el inicio común abre la sesión en su propia dirección, si el pase no abre el turno en el subdominio o si
    # sirve dos veces.
    org = organization()
    local = restaurant(org)
    person = account(org, role='waiter', username='ana', restaurants=[local])
    response = entrar('ANA@EJEMPLO.CO')
    assert response.status_code == 200, response.data
    assert 'waiter_sid' not in response.cookies and not Session.objects.exists()
    [destino] = response.data['destinations']
    assert destino['kind'] == 'pos' and destino['organization'] == {'slug': org.slug, 'name': org.name}
    assert destino['role'] == 'waiter' and destino['pass']
    assert LoginPass.objects.get().token_hash != destino['pass']
    client, canje = canjear(org.slug, destino['pass'])
    assert canje.status_code == 200, canje.data
    assert canje.data['account']['id'] == person.id and canje.cookies['waiter_sid']['httponly']
    assert client.get(S + 'auth/me').status_code == 200
    assert Session.objects.get().restaurant == local and Attendance.objects.get(account=person).check_out is None
    assert not LoginPass.objects.exists()
    _, otra_vez = canjear(org.slug, destino['pass'])
    assert otra_vez.status_code == 401 and otra_vez.data['error'] == 'invalid_pass'


def test_el_pase_no_sirve_en_otra_organizacion_ni_en_la_consola():
    # Falla si el pase de una organización abre sesión en otra o en la consola, o si el intento ajeno lo gasta.
    org, otra = organization(), organization('frisby')
    account(org)
    pase = entrar('dueno').data['destinations'][0]['pass']
    _, ajeno = canjear(otra.slug, pase)
    assert ajeno.status_code == 401 and ajeno.data['error'] == 'invalid_pass'
    consola = APIClient().post(P + 'auth/pass', {'pass': pase}, format='json')
    assert consola.status_code == 401 and not PlatformSession.objects.exists()
    _, propio = canjear(org.slug, pase)
    assert propio.status_code == 200


def test_el_pase_vence_a_los_dos_minutos():
    # Falla si un pase viejo (copiado de un historial o de una captura) todavía abre sesión.
    org = organization()
    account(org)
    pase = entrar('dueno').data['destinations'][0]['pass']
    LoginPass.objects.update(expires=timezone.now() - timedelta(seconds=1))
    _, canje = canjear(org.slug, pase)
    assert canje.status_code == 401 and canje.data['error'] == 'invalid_pass'
    assert not LoginPass.objects.exists() and not Session.objects.exists()


def test_la_misma_credencial_en_varias_organizaciones_da_un_destino_por_cada_una():
    # Falla si el inicio universal solo encuentra la primera cuenta, muestra una organización cuya contraseña no
    # coincide o una cuenta que aún no puso su contraseña.
    b, a = Organization.objects.create(slug='zona-b', name='Zeta Grill'), Organization.objects.create(slug='zona-a', name='Arepa Bar')
    c, d = organization('zona-c'), organization('zona-d')
    account(b, email='ana@correo.co')
    account(a, role='admin', email='ana@correo.co', restaurants=[restaurant(a)])
    account(c, email='ana@correo.co', password='!otra')
    account(d, email='ana@correo.co', activated=False)
    destinos = entrar('ana@correo.co').data['destinations']
    assert [(x['organization']['slug'], x['role']) for x in destinos] == [('zona-a', 'admin'), ('zona-b', 'owner')]
    assert all(x['pass'] for x in destinos) and LoginPass.objects.count() == 2


def test_projectapp_pasa_por_el_doble_factor_antes_de_recibir_su_pase(settings):
    # Falla si la consola de ProjectApp se salta el doble factor desde el inicio universal, o si su pase no abre la consola.
    settings.PAYMENTS_FERNET_KEY = Fernet.generate_key().decode()
    usuario = platform_user()
    _, _, codigos = activar(usuario)
    [destino] = entrar(usuario.email).data['destinations']
    assert destino['kind'] == 'platform' and destino['two_factor'] and 'pass' not in destino
    assert not LoginPass.objects.exists()
    malo = APIClient().post(A + '2fa', {'challenge': destino['challenge'], 'code': '000000'}, format='json')
    assert malo.status_code == 400 and malo.data['error'] == 'invalid_code'
    bueno = APIClient().post(A + '2fa', {'challenge': destino['challenge'], 'code': codigos[0]}, format='json')
    assert bueno.status_code == 200 and bueno.data['pass']
    client = APIClient()
    consola = client.post(P + 'auth/pass', {'pass': bueno.data['pass']}, format='json')
    assert consola.status_code == 200 and consola.data['user']['id'] == usuario.pk
    assert client.get(P + 'organizations').status_code == 200


def test_projectapp_sin_doble_factor_recibe_el_pase_y_no_entra_al_pos():
    # Falla si el pase de la consola abre una sesión de restaurante.
    org = organization()
    usuario = platform_user(role='operator')
    [destino] = entrar(usuario.username).data['destinations']
    assert destino['kind'] == 'platform' and destino['pass']
    _, pos = canjear(org.slug, destino['pass'])
    assert pos.status_code == 401 and not Session.objects.exists()


def test_suspension_y_fuera_de_turno_se_explican_en_el_inicio_comun():
    # Falla si la persona tiene que cambiar de dirección para enterarse de que no puede entrar, si recibe un pase de
    # todos modos o si el dueño no se entera del intento fuera de turno.
    suspendida = organization('suspendida', status='suspended')
    account(suspendida, email='luis@correo.co')
    org = organization()
    local = restaurant(org)
    owner = account(org)
    hora = timezone.now().astimezone(ZoneInfo(org.timezone)).hour
    account(org, role='waiter', username='luis', email='luis@correo.co', restaurants=[local],
            shift_start=(hora + 6) % 24, shift_end=(hora + 8) % 24)
    destinos = {x['organization']['slug']: x for x in entrar('luis@correo.co').data['destinations']}
    assert destinos['suspendida']['error']['code'] == 'organization_suspended'
    fuera = destinos[org.slug]['error']
    assert fuera['code'] == 'outside_hours' and fuera['window'] and fuera['window'] in fuera['message']
    assert not any('pass' in x for x in destinos.values()) and not LoginPass.objects.exists()
    assert Notification.objects.filter(recipient=owner, kind='access').exists()


def test_una_credencial_mala_responde_igual_exista_o_no_la_cuenta():
    # Falla si el inicio universal revela qué usuarios o correos existen.
    account(organization())
    mala, inexistente = entrar('dueno', 'no-es-la-clave'), entrar('nadie@ejemplo.co')
    assert mala.status_code == inexistente.status_code == 401
    assert mala.data == inexistente.data and mala.data['error'] == 'invalid_credentials'


def test_diez_fallos_bloquean_el_usuario_en_todas_las_entradas():
    # Falla si el inicio universal o los directos del POS y la consola dejan adivinar una contraseña sin límite.
    org = organization()
    account(org)
    account(org, username='otra')
    for _ in range(10):
        assert entrar('dueno', 'adivinando-1234').status_code == 401
    bloqueado = entrar('dueno')
    assert bloqueado.status_code == 429 and bloqueado.data['error'] == 'too_many_attempts'
    directo = APIClient()
    directo.credentials(HTTP_X_WAITER_ORG=org.slug)
    assert directo.post(S + 'auth/login', {'login': 'dueno', 'password': PASSWORD}, format='json').status_code == 429
    assert APIClient().post(P + 'auth/login', {'login': 'dueno', 'password': PASSWORD}, format='json').status_code == 429
    assert entrar('otra').status_code == 200


def test_entrar_bien_borra_los_fallos_del_usuario():
    # Falla si los fallos viejos de alguien que ya entró lo bloquean después por unos pocos errores nuevos.
    account(organization())
    for _ in range(9):
        entrar('dueno', 'adivinando-1234')
    assert entrar('dueno').status_code == 200
    for _ in range(9):
        entrar('dueno', 'adivinando-1234')
    assert entrar('dueno').status_code == 200


def test_el_codigo_de_una_organizacion_no_activa_la_cuenta_de_otra():
    # Falla si, con el mismo usuario en dos organizaciones, el código de una pone la contraseña de la otra, o si el
    # correo no lleva al inicio universal con su organización.
    a, b = organization('zona-a'), organization('zona-b')
    en_a = account(a, username='ana', activated=False)
    en_b = account(b, username='ana', activated=False)
    assert APIClient().post(A + 'request_code', {'login': 'ana'}, format='json').status_code == 200
    correos = {m.to[0]: m.alternatives[0].content for m in mail.outbox}
    assert len(mail.outbox) == 2 and len(correos) == 1
    [correo_b] = [m.alternatives[0].content for m in mail.outbox if 'org=zona-b' in m.alternatives[0].content]
    assert '/login?codigo=ana&amp;org=zona-b' in correo_b
    codigo_b = re.search(r'<strong>(\d{6})</strong>', correo_b).group(1)
    activa = APIClient().post(A + 'activate', {'login': 'ana', 'code': codigo_b, 'password': 'nueva-clave-1'}, format='json')
    assert activa.status_code == 200, activa.data
    en_a.refresh_from_db(); en_b.refresh_from_db()
    assert en_b.activated and not en_a.activated and en_a.invite_code_hash
    [destino] = entrar('ana', 'nueva-clave-1').data['destinations']
    assert destino['organization']['slug'] == 'zona-b'


def test_un_codigo_malo_cuenta_contra_todas_las_cuentas_con_codigo():
    # Falla si probar códigos en el inicio universal no gasta los intentos de cada cuenta.
    a, b = organization('zona-a'), organization('zona-b')
    cuentas = [account(a, username='ana', activated=False), account(b, username='ana', activated=False)]
    APIClient().post(A + 'request_code', {'login': 'ana'}, format='json')
    for _ in range(5):
        r = APIClient().post(A + 'activate', {'login': 'ana', 'code': '000000', 'password': 'nueva-clave-1'}, format='json')
        assert r.status_code == 400 and r.data['error'] == 'invalid_code'
    for cuenta in cuentas:
        cuenta.refresh_from_db()
        assert not cuenta.invite_code_hash


def test_la_invitacion_de_projectapp_lleva_al_inicio_universal(settings):
    # Falla si la gente de ProjectApp recibe un enlace a la consola en vez de al inicio universal.
    settings.POS_URL, settings.PLATFORM_URL = 'https://waiter.example.test', 'https://plataforma.waiter.example.test'
    platform_user(activated=False, username='sofia')
    APIClient().post(A + 'request_code', {'login': 'sofia'}, format='json')
    contenido = mail.outbox[0].alternatives[0].content
    assert 'https://waiter.example.test/login?codigo=sofia"' in contenido and 'plataforma.' not in contenido


def test_desactivar_o_cambiar_la_clave_borra_los_pases_pendientes():
    # Falla si un pase emitido antes de desactivar a la persona todavía abre sesión.
    org = organization()
    person = account(org)
    pase = entrar('dueno').data['destinations'][0]['pass']
    revoke(person)
    assert not LoginPass.objects.exists()
    _, canje = canjear(org.slug, pase)
    assert canje.status_code == 401


def test_el_inicio_comun_rechaza_otro_origen():
    # Falla si otra página puede pedir pases a nombre de quien la visita.
    account(organization())
    client = APIClient(HTTP_ORIGIN='https://ajeno.example.test')
    response = entrar('dueno', client=client)
    assert response.status_code == 403 and response.data['error'] == 'invalid_origin'


def test_borrar_una_cuenta_con_un_ingreso_pendiente():
    # Falla si borrar a una persona (o a alguien de ProjectApp) con un pase sin usar choca con la restricción del pase en
    # MySQL, donde Django borra en cascada poniendo antes la llave en NULL.
    org = organization()
    person = account(org)
    usuario = platform_user(role='operator')
    entrar('dueno'); entrar(usuario.username)
    assert LoginPass.objects.count() == 2
    person.delete(); usuario.delete()
    assert not LoginPass.objects.exists()
