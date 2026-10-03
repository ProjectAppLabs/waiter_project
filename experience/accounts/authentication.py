"""Autenticación explícita por cookies independientes del comensal."""
from django.conf import settings
from django.utils import timezone

from tenancy.http import Problem
from tenancy.models import Organization, PlatformSession
from .models import Session
from .services import digest

SUSPENDED_MESSAGE = 'La cuenta de tu organización está suspendida. Escribe a ProjectApp.'


def resolve_organization(request, allow_suspended=False):
    # Las etiquetas <img> no mandan cabeceras: las fotos del catálogo traen la organización en la URL.
    organization = Organization.objects.filter(slug=request.headers.get('X-Waiter-Org') or request.GET.get('org', '')).first()
    if not organization:
        raise Problem('unknown_organization', 'No encontramos esta organización.', 404)
    if organization.status == 'suspended' and not allow_suspended:
        raise Problem('organization_suspended', SUSPENDED_MESSAGE, 403)
    return organization


def pos_session(request):
    organization = resolve_organization(request)
    session = Session.objects.select_related('account__organization').filter(
        token_hash=digest(request.COOKIES.get('waiter_sid', '')), account__organization=organization,
        account__active=True, account__activated=True).first()
    if session and session.expires <= timezone.now():
        session.account.attendances.filter(check_out__isnull=True).update(check_out=session.expires)
        session.delete()
        session = None
    if not session:
        raise Problem('unauthenticated', 'Inicia sesión para continuar.', 401)
    session.account._module_restaurant = session.restaurant
    return session


def platform_session(request):
    session = PlatformSession.objects.select_related('user').filter(
        token_hash=digest(request.COOKIES.get('waiter_platform_sid', '')), expires__gt=timezone.now(),
        user__active=True, user__activated=True).first()
    if not session:
        raise Problem('unauthenticated', 'Inicia sesión para continuar.', 401)
    return session


def set_cookie(response, name, token, expires):
    response.set_cookie(name, token, expires=expires, httponly=True, samesite='Lax', secure=settings.IS_PRODUCTION, path='/')
    return response
