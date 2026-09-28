from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import resolve
from experience_app.models import TableSession, Diner
from experience_app.services import benefits, rewards as action_rewards
from experience_app.views.sessions import COOKIE, diner_for, cart_of


@api_view(['GET'])
def location(request, restaurant, venue):
    tenant = resolve(restaurant, venue, None)
    client = OdooClient(tenant.odoo)
    config = client.call_kw('pos.config', 'read', [[tenant.odoo.pos_config_id], ['company_id']])[0]
    rows = client.call_kw('res.company', 'read', [[config['company_id'][0]], ['street', 'city', 'waiter_latitude', 'waiter_longitude']])
    row = rows[0]
    return Response({'direccion': ', '.join(str(row[k]) for k in ('street', 'city') if row[k]),
                     'latitud': float(row['waiter_latitude']) if row['waiter_latitude'] else None,
                     'longitud': float(row['waiter_longitude']) if row['waiter_longitude'] else None})


@api_view(['GET'])
def rewards(request, restaurant, venue):
    diner = get_object_or_404(Diner.objects.select_related('account'), key=request.COOKIES.get(COOKIE, ''))
    if not diner.account_id or not diner.account.verified:
        return Response({'detail': 'Entra a tu cuenta para consultar tus puntos.'}, status=401)
    tenant = resolve(restaurant, venue, None)
    action_rewards.sync(tenant, diner.account)
    return Response({**action_rewards.view(tenant, diner.account), **benefits.account_benefits(tenant, diner.account)})


@api_view(['PUT', 'DELETE'])
def coupon(request, session_id):
    session = get_object_or_404(TableSession, id=session_id, state__in=TableSession.OPEN_STATES)
    diner = diner_for(request, session)
    if session.lines.filter(diner=diner, status='open', order__isnull=False).exists() or not TableSession.objects.filter(id=session.id, confirming=False).update(confirming=True):
        return Response({'detail': 'El pedido se está confirmando. Espera y vuelve a intentar.'}, status=423)
    try:
        code = request.data.get('codigo') if isinstance(request.data, dict) else None
        if request.method == 'PUT':
            if not isinstance(code, str) or not 3 <= len(code.strip()) <= 32:
                return Response({'detail': 'Introduce un código de 3 a 32 caracteres.'}, status=400)
            if not session.lines.filter(diner=diner, status='open', order=None).exists():
                return Response({'detail': 'Agrega tus platos antes de aplicar el cupón.'}, status=400)
            try:
                result = benefits.quote(session, diner, code)
            except OdooError as exc:
                return Response({'detail': str(exc)}, status=400)
            diner.coupon_code = result['codigo']
        else:
            diner.coupon_code = ''
        diner.save(update_fields=['coupon_code'])
    finally:
        TableSession.objects.filter(id=session.id).update(confirming=False)
    return Response(cart_of(session, diner))
