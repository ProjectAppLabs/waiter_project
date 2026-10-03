"""Guardas comerciales de las entradas del menú, sin bloquear conciliaciones pendientes."""
from functools import wraps

from django.http import JsonResponse

from tenancy.http import Problem
from tenancy.models import Organization, Restaurant
from tenancy.modules import require_module


def require_location(org_slug, venue_slug, module):
    org = Organization.objects.filter(slug=org_slug).first()
    if org:
        local = Restaurant.objects.filter(organization=org, slug=venue_slug).first()
        require_module(org, module, local)


def module_view(view, module):
    @wraps(view)
    def guarded(request, *args, **kwargs):
        from experience_app.models import Diner, Order, TableSession
        org, venue = kwargs.get('restaurant'), kwargs.get('venue')
        session = None
        if kwargs.get('session_id'):
            session = TableSession.objects.filter(pk=kwargs['session_id']).first()
        elif kwargs.get('order_id'):
            order = Order.objects.select_related('session').filter(pk=kwargs['order_id']).first()
            session = order.session if order else None
        elif not org:
            diner = Diner.objects.select_related('session').filter(key=request.COOKIES.get('waiter_diner', '')).first()
            session = diner.session if diner else None
        if session:
            org, venue = session.restaurant_slug, session.venue_slug
        if org:
            try:
                require_location(org, venue, module)
            except Problem as exc:
                return JsonResponse(exc.body, status=exc.status)
        return view(request, *args, **kwargs)
    return guarded
