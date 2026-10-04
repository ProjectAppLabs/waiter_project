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
    session = Session.objects.select_related('account__organization', 'support_grant', 'support_agent').filter(
        token_hash=digest(request.COOKIES.get('waiter_sid', '')), account__organization=organization,
        account__active=True, account__activated=True).first()
    if session and session.support_grant_id:
        grant = session.support_grant
        if grant.state != 'vigente' or not grant.since or grant.since > timezone.now() or not grant.until or grant.until <= timezone.now() or not session.support_agent.active:
            session.delete()
            session = None
    if session and session.expires <= timezone.now():
        if not session.support_grant_id:
            session.account.attendances.filter(check_out__isnull=True).update(check_out=session.expires)
        session.delete()
        session = None
    if not session:
        raise Problem('unauthenticated', 'Inicia sesión para continuar.', 401)
    session.account._module_restaurant = session.restaurant
    session.account._support_session = session if session.support_grant_id else None
    from tenancy.audit import set_actor
    set_actor(session.support_agent if session.support_grant_id else session.account, support=bool(session.support_grant_id))
    return session


def platform_session(request, *, allow_setup=False):
    session = PlatformSession.objects.select_related('user').filter(
        token_hash=digest(request.COOKIES.get('waiter_platform_sid', '')), expires__gt=timezone.now(),
        user__active=True, user__activated=True).first()
    if not session:
        raise Problem('unauthenticated', 'Inicia sesión para continuar.', 401)
    from tenancy.two_factor import required
    from tenancy.http import require
    require(allow_setup or session.user.two_factor or not required(session.user),
            'Activa el doble factor para continuar.', 'two_factor_required')
    from tenancy.audit import set_actor
    set_actor(session.user)
    return session


def set_cookie(response, name, token, expires):
    response.set_cookie(name, token, expires=expires, httponly=True, samesite='Lax', secure=settings.IS_PRODUCTION, path='/')
    return response
