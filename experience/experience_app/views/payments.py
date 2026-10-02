"""Pago simulado de desarrollo.

El camino de Odoo conserva la demostración sin cobro. El sistema propio registra el pago de la cuenta completa,
lo concilia con ventas y dispara cocina, inventario y puntos. Solo está disponible con la demo habilitada.
"""
import logging
import uuid

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.models import CartLine, Order, TableSession
from experience_app.services.sessions import bill_summary
from experience_app.views.sessions import diner_for

log = logging.getLogger(__name__)
METHODS = ('tarjeta', 'pse', 'nequi', 'efectivo')


@api_view(['POST'])
def simulated(request, session_id):
    session = get_object_or_404(TableSession, id=session_id, state__in=TableSession.OPEN_STATES)
    diner = diner_for(request, session)
    if not isinstance(request.data, dict):
        return Response({'detail': 'El cuerpo debe ser un objeto'}, status=400)
    method = str(request.data.get('metodo') or '').strip().lower()
    if method not in METHODS:
        return Response({'detail': f"Método de pago inválido; usa {', '.join(METHODS)}"}, status=400)
    if settings.IS_PRODUCTION or not settings.DINER_DEMO_ENABLED:
        return Response({'detail': 'El pago demo no está disponible'}, status=503)
    from experience_app.adapters.backend import backend_for, client_for
    from experience_app.adapters.registry.client import resolve
    internal = hasattr(backend_for(session.restaurant_slug), 'Client')
    tenant = resolve(session.restaurant_slug, session.venue_slug, session.table_token) if internal else None
    order = session.orders.filter(state__in=(Order.SENT, Order.CHECKOUT) if internal else (Order.SENT,)).first()
    if order is None or session.lines.filter(status=CartLine.OPEN).exists():
        return Response({'detail': 'Confirma el pedido antes de pagar'}, status=409)
    scope = request.data.get('reparto', 'all')
    if scope not in ('all', 'mine', 'parts'):
        return Response({'detail': 'Reparto inválido'}, status=400)
    summary = bill_summary(session, diner)
    amount = float(order.total or 0) if scope == 'all' else summary['mio'] if scope == 'mine' else summary['porParte']
    if amount <= 0:
        return Response({'detail': 'No hay un monto confirmado para pagar'}, status=409)
    if internal and scope != 'all':
        return Response({'error': 'payment_scope', 'message': 'El pago del menú cubre la cuenta completa.'}, status=400)
    reference = f'DEMO-{uuid.uuid4().hex[:8].upper()}'
    if internal:
        reference = 'DEMO-' + str(order.id)
        backend_for(tenant.restaurant_slug).gateway_paid(client_for(tenant), order.odoo_order_id, round(amount * 100), reference)
        from experience_app.services.orders import status_view
        status_view(order)
    # El registro identifica la simulación; la rama interna ya dejó además su pago idempotente en ventas.
    log.info('pago simulado %s: sesión %s, comensal %s, %s por %.2f (sin cobro real)', reference, session.id, diner.id, method, amount)
    return Response({'estado': 'aprobado', 'referencia': reference, 'demo': True, 'metodo': method, 'monto': amount, 'reparto': scope})
