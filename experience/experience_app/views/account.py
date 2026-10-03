"""Cuenta del comensal (Plan H, Contrato 3). La identidad es la cookie del comensal (misma que el carrito).

POST /api/v1/cuenta/registro/   {nombre, correo, celular, aceptaDatos, novedades} → {id, codigoDemo: true}
POST /api/v1/cuenta/verificar/  {id, codigo}  → demo: cualquier código de seis dígitos; liga la cuenta a la cookie
GET  /api/v1/cuenta/            perfil + historial (pedidos de las sesiones donde participó esta cuenta)
POST /api/v1/cuenta/salir/      desliga la cuenta de esta cookie
"""
import uuid

from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.models import Diner, DinerAccount
from experience_app.services import account as accounts, discount
from experience_app.views.sessions import COOKIE

NO_ACCOUNT = {'detail': 'No hay una cuenta en este dispositivo'}


def _diner(request) -> Diner:
    # 404 y no 401: sin cookie no hay comensal, y la cuenta cuelga del comensal (no hay otro login).
    diner = get_object_or_404(Diner.objects.select_related('account', 'session'), key=request.COOKIES.get(COOKIE, ''))
    if diner.account_id and diner.account.organization_slug != diner.session.restaurant_slug:
        from django.http import Http404
        raise Http404('La cuenta pertenece a otra organización.')
    return diner


@api_view(['POST'])
@transaction.atomic
def register(request):
    diner = _diner(request)
    try:
        account = accounts.register(request.data if isinstance(request.data, dict) else {}, diner)
    except accounts.DemoUnavailable:
        return Response({'detail': 'El registro demo no está disponible'}, status=503)
    except accounts.InvalidRegistration as exc:
        return Response({'detail': str(exc)}, status=400)
    from tenancy.usage import record_location_usage
    record_location_usage(diner.session.restaurant_slug, diner.session.venue_slug, 'fidelizacion', 'codigo_verificacion',
                          key=f'codigo:{account.pk}:{account.created_at.isoformat()}')
    # codigoDemo: no se envió ningún código; el comensal puede escribir cualquiera de seis dígitos (ver services/account.py).
    return Response({'id': str(account.id), 'codigoDemo': True}, status=201)


@api_view(['POST'])
def verify(request):
    diner = _diner(request)
    if not isinstance(request.data, dict):
        return Response({'detail': 'El cuerpo debe ser un objeto'}, status=400)
    raw_id = str(request.data.get('id') or '')
    try:
        account_id = uuid.UUID(raw_id)
    except ValueError:
        return Response({'detail': 'La cuenta indicada no existe'}, status=404)
    account = get_object_or_404(DinerAccount, id=account_id, organization_slug=diner.session.restaurant_slug)
    try:
        accounts.verify(account, diner, request.data.get('codigo'))
    except accounts.DemoUnavailable:
        return Response({'detail': 'La verificación demo no está disponible'}, status=503)
    except accounts.InvalidCode:
        return Response({'detail': 'Código inválido, vencido o solicitado desde otro dispositivo'}, status=400)
    return Response({'cuenta': accounts.profile_view(account)})


@api_view(['GET', 'PATCH'])
def profile(request):
    diner = _diner(request)
    if diner.account is None or not diner.account.verified:
        return Response(NO_ACCOUNT, status=404)
    if request.method == 'PATCH':
        data = request.data
        if not isinstance(data, dict) or not data or set(data) - {'nombre', 'celular', 'novedades', 'alergenos'}:
            return Response({'detail': 'Solo puedes editar nombre, celular, alérgenos y novedades'}, status=400)
        changes = {}
        if 'nombre' in data:
            if not isinstance(data['nombre'], str) or not 2 <= len(data['nombre'].strip()) <= 60:
                return Response({'detail': 'El nombre debe tener entre 2 y 60 caracteres'}, status=400)
            changes['name'] = data['nombre'].strip()
        if 'celular' in data:
            phone = data['celular']
            if not isinstance(phone, str) or len(phone) > 20 or any(c not in '+0123456789 ()-' for c in phone):
                return Response({'detail': 'El celular no es válido'}, status=400)
            changes['phone'] = phone.strip()
        if 'alergenos' in data:
            if not isinstance(data['alergenos'], str) or len(data['alergenos']) > 500:
                return Response({'detail': 'Describe tus alérgenos en hasta 500 caracteres'}, status=400)
            changes['allergens'] = data['alergenos'].strip()
        if 'novedades' in data:
            if type(data['novedades']) is not bool:
                return Response({'detail': 'La preferencia de novedades debe ser verdadera o falsa'}, status=400)
            changes['marketing'] = data['novedades']
        for field, value in changes.items():
            setattr(diner.account, field, value)
        diner.account.save(update_fields=list(changes))
        if changes.get('marketing'):
            from experience_app.services import rewards
            rewards.sync_for_diner(diner)
    # `pedidos` es la clave que consume el comensal (Contrato 3 / diner AccountSummary).
    profile = accounts.profile_view(diner.account)
    profile['descuentoDisponible'] = discount.applicable(diner)
    return Response({'cuenta': profile, 'pedidos': accounts.history(diner.account)})


@api_view(['POST'])
def logout(request):
    accounts.logout(_diner(request))
    return Response({'ok': True})


@api_view(['GET', 'PUT', 'DELETE'])
def favorites(request, restaurant, venue, product_id=None):
    from experience_app.adapters.core.pos import resolve
    from experience_app.services import catalog
    from experience_app.models import DinerFavorite

    diner = _diner(request)
    if not diner.account_id or not diner.account.verified:
        return Response(NO_ACCOUNT, status=401)
    if restaurant != diner.session.restaurant_slug or diner.account.organization_slug != restaurant:
        return Response(NO_ACCOUNT, status=403)
    tenant = resolve(restaurant, venue)
    rows = DinerFavorite.objects.filter(account=diner.account, restaurant_slug=restaurant, venue_slug='')
    if request.method == 'PUT':
        if product_id is None:
            return Response({'detail': 'Elige un plato'}, status=400)
        catalog.find_product(tenant, product_id)
        rows.get_or_create(product_id=product_id, defaults={'account': diner.account, 'restaurant_slug': restaurant, 'venue_slug': ''})
    elif request.method == 'DELETE':
        if product_id is None:
            return Response({'detail': 'Elige un plato'}, status=400)
        rows.filter(product_id=product_id).delete()
    return Response({'favoritos': list(rows.order_by('created_at').values_list('product_id', flat=True))})


@api_view(['POST'])
def password_login(request):
    import hashlib
    from django.contrib.auth.hashers import check_password, make_password
    from django.core.cache import cache
    diner = _diner(request)
    data = request.data if isinstance(request.data, dict) else {}
    email = str(data.get('correo', '')).strip().lower()[:120]
    password = data.get('clave', '')
    if not isinstance(password, str) or len(password) > 128:
        return Response({'detail': 'Correo o contraseña incorrectos'}, status=400)
    key = 'diner-login:' + hashlib.sha256((diner.session.restaurant_slug + ':' + request.META.get('REMOTE_ADDR', '') + ':' + email).encode()).hexdigest()
    attempts = cache.get(key, 0)
    if attempts >= 5:
        return Response({'detail': 'Espera 15 minutos antes de volver a intentarlo'}, status=429)
    account = DinerAccount.objects.filter(organization_slug=diner.session.restaurant_slug, email__iexact=email, verified=True).first()
    valid = check_password(password, account.password) if account and account.password else False
    if not valid:
        if not account or not account.password:
            make_password(password)
        cache.set(key, attempts + 1, 900)
        return Response({'detail': 'Correo o contraseña incorrectos'}, status=400)
    cache.delete(key)
    diner.account = account
    diner.save(update_fields=['account'])
    return Response({'cuenta': accounts.profile_view(account), 'pedidos': accounts.history(account)})


@api_view(['POST'])
def change_password(request):
    from .password_reset import send_reset_link
    diner = _diner(request)
    if not diner.account_id or not diner.account.verified:
        return Response(NO_ACCOUNT, status=401)
    data = request.data if isinstance(request.data, dict) else {}
    if 'nueva' in data or 'actual' in data:
        return Response({'detail': 'Verifica tu identidad con el enlace enviado a tu correo antes de cambiar la contraseña.'}, status=403)
    # La organización y el destinatario salen de la sesión del comensal.
    return send_reset_link(request, diner.account.email, diner.session.restaurant_slug,
                           diner.session.venue_slug, authenticated=True)
