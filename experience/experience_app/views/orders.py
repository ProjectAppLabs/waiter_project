from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.models import Order, TableSession, Diner
from django.http import Http404
from experience_app.services import orders, sessions
from experience_app.views.sessions import diner_for


@api_view(['POST'])
def confirm(request, session_id):
    from django.conf import settings
    from tenancy.http import require
    origin = request.headers.get('Origin')
    require(not origin or origin.rstrip('/') == settings.DINER_PUBLIC_URL, 'El origen de la petición no está permitido.', 'invalid_origin', 403)
    session = get_object_or_404(TableSession, id=session_id, state__in=TableSession.OPEN_STATES)
    # Quien confirma es quien puede llevar el descuento de primera compra (sobre SUS líneas).
    diner = diner_for(request, session)
    takeaway = request.data.get('para_llevar') if isinstance(request.data, dict) else None
    if takeaway is not None and type(takeaway) is not bool:
        return Response({'detail': 'La modalidad del pedido no es válida'}, status=400)
    data = request.data if isinstance(request.data, dict) else {}
    for key in ('notas', 'alergenos'):
        if key in data and (not isinstance(data[key], str) or len(data[key]) > 500):
            return Response({'detail': 'Las notas y alérgenos admiten hasta 500 caracteres cada uno'}, status=400)
    order, created = orders.confirm(session, diner, takeaway=takeaway, prepay=True,
                                    delivery_payment=data.get('metodo_pago'), checkout_note=data['notas'].strip() if 'notas' in data else None,
                                    allergens=data['alergenos'].strip() if 'alergenos' in data else None)
    return Response({'pedido': str(order.id), 'estado': 'pendiente_pago' if order.requires_payment else 'enviado', 'total': float(order.total or 0), 'cuenta': {'ok': False, **sessions.bill_summary(session, diner)}}, status=201 if created else 200)


@api_view(['GET'])
def detail(request, order_id):
    # Solo un comensal de esa mesa (cookie) puede ver el pedido: el uuid no es la autorización.
    order = get_object_or_404(Order, id=order_id)
    order_diner(request, order)
    data = orders.status_view(order)
    from experience_app.views.sessions import COOKIE
    current = Diner.objects.select_related('account').get(key=request.COOKIES.get(COOKIE, ''))
    if current.account_id and current.account.verified:
        from experience_app.services import benefits
        data['recompensas'] = benefits.account_benefits(benefits.tenant_for(order.session), current.account, order.id)
    data['lineas'] = [{'producto_id': line.product_id, 'nombre': line.name, 'cantidad': line.qty, 'precio': float(line.shown_unit_price)} for line in order.lines.all()]
    return Response(data)


@api_view(['GET', 'PUT'])
def feedback(request, order_id):
    from experience_app.models import DinerFeedback
    from django.db.models import Sum, Min
    order = get_object_or_404(Order, id=order_id, state=Order.SENT)
    diner = order_diner(request, order)
    if not order.lines.filter(diner=diner).exists():
        raise Http404()
    if request.method == 'PUT':
        data = request.data
        if not isinstance(data, dict) or set(data) - {'rating', 'comment', 'dishes'}:
            return Response({'detail': 'La opinión no es válida'}, status=400)
        rating, comment, dishes = data.get('rating'), data.get('comment', ''), data.get('dishes', {})
        if type(rating) is not int or not 1 <= rating <= 5 or not isinstance(comment, str) or len(comment) > 250:
            return Response({'detail': 'Elige una valoración de 1 a 5 y escribe hasta 250 caracteres'}, status=400)
        products = {str(p) for p in order.lines.filter(diner=diner).values_list('product_id', flat=True)}
        if not isinstance(dishes, dict) or any(k not in products or type(v) is not int or not 1 <= v <= 5 for k, v in dishes.items()):
            return Response({'detail': 'Solo puedes valorar los platos de tu pedido, de 1 a 5'}, status=400)
        row, _ = DinerFeedback.objects.update_or_create(order=order, diner=diner, defaults={'rating': rating, 'comment': comment.strip(), 'dish_ratings': dishes})
        from experience_app.services import ratings
        ratings.invalidate(order.session.restaurant_slug, order.session.venue_slug)
        from experience_app.services import rewards
        rewards.sync_for_diner(diner)
    else:
        row = DinerFeedback.objects.filter(order=order, diner=diner).first()
    return Response({'feedback': {'rating': row.rating, 'comment': row.comment, 'dishes': row.dish_ratings} if row else None, 'items': list(order.lines.filter(diner=diner).values('product_id').annotate(name=Min('name'), qty=Sum('qty')).order_by('product_id'))})


def order_diner(request, order):
    from experience_app.views.sessions import COOKIE
    current = get_object_or_404(Diner.objects.select_related('account'), key=request.COOKIES.get(COOKIE, ''))
    if current.session_id == order.session_id and order.lines.filter(diner=current).exists():
        return current
    if current.account_id and current.account.verified:
        line = order.lines.filter(account=current.account).select_related('diner').first()
        if line:
            return line.diner
    if current.session_id == order.session_id:
        return current
    raise Http404()
