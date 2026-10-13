"""Inicio de sesión universal: una sola entrada (waiter.projectapp.co/login) para todas las personas.

Meseros, cajeros, encargados y dueños de cualquier organización, y la gente de ProjectApp, escriben aquí su usuario o
correo y su contraseña. La credencial se busca en todas las organizaciones y en ProjectApp; por cada cuenta que
coincide se entrega un pase de un solo uso (2 minutos) que el subdominio de la organización (`<org>.waiter…`) o la
consola cambian por la sesión de esa dirección. Las cookies de sesión siguen siendo de cada dirección: lo único que
viaja entre ellas es el pase, en la URL, y se borra al usarse.
"""
import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.urls import path, re_path
from django.utils import timezone
from rest_framework.response import Response

from tenancy.http import ContractView, NotFoundView, Problem, payload, require
from tenancy.models import PlatformUser

from .authentication import SUSPENDED_MESSAGE
from .models import Account, LoginPass
from .services import activate, digest, find_identities, invitation, outside_hours, pos_entry

PASS_MINUTES = 2
INVALID = ('El usuario o la contraseña no son correctos.', 'invalid_credentials', 401)

# Intentos fallidos en 15 minutos. La pareja usuario+IP frena a quien adivina una contraseña; el usuario solo, al que
# reparte el intento entre muchas IP; la IP sola, al que prueba muchos usuarios. Los dos últimos son holgados para que
# nadie pueda dejar por fuera al dueño a punta de fallos.
WINDOW = 15 * 60
LIMITS = (('id_ip', 10), ('id', 30), ('ip', 50))


def client_ip(request):
    # En producción Caddy pone la IP del cliente en X-Forwarded-For (descarta la que traiga el navegador) y el POS la
    # reenvía tal cual; sin proxy vale la de la conexión.
    forwarded = request.headers.get('X-Forwarded-For', '')
    return forwarded.split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')


def throttle_keys(request, login):
    who = digest(login.strip().lower()) if isinstance(login, str) else ''
    ip = digest(client_ip(request))
    return {'id_ip': f'acceso:id_ip:{who}:{ip}', 'id': f'acceso:id:{who}', 'ip': f'acceso:ip:{ip}'}


def throttled(request, data, attempt):
    """Corre `attempt` si la credencial no acumula demasiados fallos; un fallo de credencial suma en los tres contadores.
    Lo usan el inicio universal y los inicios directos del POS y de la consola, para que no sean una puerta sin límite."""
    keys = throttle_keys(request, data.get('login') if isinstance(data, dict) else None)
    counts = cache.get_many(list(keys.values()))
    for kind, limit in LIMITS:
        require(counts.get(keys[kind], 0) < limit, 'Demasiados intentos fallidos. Espera unos minutos y vuelve a intentar.',
                'too_many_attempts', 429)
    try:
        result = attempt()
    except Problem as error:
        if error.body['error'] == 'invalid_credentials':
            for key in keys.values():
                if not cache.add(key, 1, WINDOW):
                    try:
                        cache.incr(key)
                    except ValueError:  # venció entre el add y el incr
                        cache.set(key, 1, WINDOW)
        raise
    cache.delete_many([keys['id_ip'], keys['id']])
    return result


def issue_pass(**owner):
    now = timezone.now()
    LoginPass.objects.filter(expires__lte=now).delete()
    token = secrets.token_urlsafe(32)
    LoginPass.objects.create(token_hash=digest(token), expires=now + timedelta(minutes=PASS_MINUTES), **owner)
    return token


def redeem_pass(token, **owner):
    """Gasta el pase aunque luego no se pueda abrir la sesión (p. ej. fuera de turno): sirve una sola vez."""
    require(isinstance(token, str) and token, 'El ingreso no es válido.', 'invalid_pass', 401)
    with transaction.atomic():
        item = LoginPass.objects.select_for_update().filter(token_hash=digest(token), **owner).first()
        if item:
            item.delete()
    require(item and item.expires > timezone.now(), 'El ingreso venció o ya se usó. Vuelve a iniciar sesión.',
            'invalid_pass', 401)
    return item


def pos_destination(account):
    org = account.organization
    item = {'kind': 'pos', 'organization': {'slug': org.slug, 'name': org.name}, 'role': account.role, 'name': account.name}
    # Lo que impediría entrar se dice aquí, en el inicio común, en vez de después de cambiar de dirección.
    if org.status == 'suspended':
        return {**item, 'error': {'code': 'organization_suspended', 'message': SUSPENDED_MESSAGE}}
    restaurant, window = pos_entry(account)
    if not window['allowed']:
        from notifications.services import notify_outside_hours
        notify_outside_hours(account, restaurant, window)
        return {**item, 'error': {'code': 'outside_hours', 'message': outside_hours(window).body['message'], 'window': window['label']}}
    return {**item, 'pass': issue_pass(account=account)}


def platform_destination(user):
    item = {'kind': 'platform', 'role': user.role, 'name': user.name}
    if user.two_factor:
        from tenancy.two_factor import challenge
        return {**item, 'two_factor': True, 'challenge': challenge(user)}
    return {**item, 'pass': issue_pass(platform_user=user)}


def login_everywhere(data):
    data = payload(data, ('login', 'password'), ('login', 'password'))
    password = data['password']
    require(isinstance(password, str), *INVALID)
    identities = [user for user in find_identities([Account.objects.select_related('organization'), PlatformUser.objects.all()], data['login'])
                  if user.activated]
    if not identities:
        make_password(password)  # el mismo tiempo de respuesta exista o no la cuenta
    found = [user for user in identities if check_password(password, user.password)]
    require(found, *INVALID)
    destinations = []
    with transaction.atomic():
        for user in found:
            destinations.append(platform_destination(user) if isinstance(user, PlatformUser) else pos_destination(user))
    # Primero las organizaciones (por nombre) y al final la consola de ProjectApp.
    destinations.sort(key=lambda d: (d['kind'] == 'platform', d.get('organization', {}).get('name', '').lower()))
    return destinations


class UniversalAuthView(ContractView):
    action = None

    def post(self, request):
        if self.action == 'login':
            destinations = throttled(request, request.data, lambda: login_everywhere(request.data))
            return Response({'destinations': destinations})
        if self.action == '2fa':
            from tenancy.two_factor import verify_challenge
            return Response({'pass': verify_challenge(request.data, lambda user: issue_pass(platform_user=user))})
        if self.action == 'request_code':
            # Responde igual exista o no la cuenta. Si el correo está en varias organizaciones, a cada una le llega su código.
            data = payload(request.data, ('login',), ('login',))
            for user in find_identities([Account.objects.select_related('organization'), PlatformUser.objects.all()], data['login']):
                invitation(user, reset=True)
            return Response({'ok': True})
        if self.action == 'activate':
            activate([Account.objects.all(), PlatformUser.objects.all()], request.data)
            return Response({'ok': True})
        raise Problem('not_found', 'La ruta no existe.', 404)


urlpatterns = [path(action, UniversalAuthView.as_view(action=action, http_method_names=['post', 'options']))
               for action in ('login', '2fa', 'request_code', 'activate')]
urlpatterns += [re_path(r'^.*$', NotFoundView.as_view())]
