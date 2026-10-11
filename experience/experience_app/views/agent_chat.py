from tenancy.http import Problem
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.core.pos import resolve
from experience_app.models import TableSession
from experience_app.services import agent_cart, agent_chat, catalog
from experience_app.services.waiter_agent import AgentUnavailable
from experience_app.views.channel_orders import StrictSerializer
from experience_app.views.sessions import diner_for


class MessageSerializer(StrictSerializer):
    id = serializers.UUIDField()
    mensaje = serializers.CharField(max_length=4000, allow_blank=False)


@api_view(['GET', 'POST', 'DELETE'])
def messages(request, session_id):
    session = get_object_or_404(TableSession, id=session_id, state__in=TableSession.OPEN_STATES)
    diner = diner_for(request, session)
    # Las escrituras del navegador vienen del menú configurado y requieren la cookie de su comensal.
    origin = request.headers.get('Origin')
    if request.method != 'GET' and origin and origin.rstrip('/') != settings.DINER_PUBLIC_URL:
        return Response({'detail': 'Origen no permitido.'}, status=403)
    chat = agent_chat.conversation(session.restaurant_slug, session.venue_slug, 'menu', str(diner.id))
    if request.method == 'DELETE':
        agent_chat.restart(chat)
        return Response({'disponible': agent_chat.available(), 'mensajes': []})
    if request.method == 'GET':
        return Response({'disponible': agent_chat.available(), 'mensajes': chat.history, 'selecciones': agent_cart.selected(diner)})
    body = MessageSerializer(data=request.data)
    body.is_valid(raise_exception=True)

    def products():
        from assistant.selection import catalog_for
        from tenancy.models import Restaurant
        local = get_object_or_404(Restaurant.objects.select_related('organization'), organization__slug=session.restaurant_slug, slug=session.venue_slug)
        return catalog_for(local)

    try:
        turn = agent_chat.send(chat, body.validated_data['id'], body.validated_data['mensaje'], products)
    except AgentUnavailable as exc:
        return Response({'detail': str(exc)}, status=503)
    if turn['accion'] == 'agregar':
        turn = agent_cart.apply_requested(session, diner, chat, turn)
    return Response(turn)


class SelectionSerializer(StrictSerializer):
    mensaje = serializers.UUIDField()
    producto = serializers.IntegerField(min_value=1)
    cantidad = serializers.IntegerField(min_value=1, max_value=50)
    nota = serializers.CharField(max_length=200, allow_blank=True, default='')


@api_view(['POST'])
def add_to_cart(request, session_id):
    from django.db import DatabaseError
    from experience_app.services import agent_cart
    from experience_app.views.sessions import cart_of

    session = get_object_or_404(TableSession, id=session_id, state__in=TableSession.OPEN_STATES)
    diner = diner_for(request, session)
    origin = request.headers.get('Origin')
    if origin and origin.rstrip('/') != settings.DINER_PUBLIC_URL:
        return Response({'detail': 'Origen no permitido.'}, status=403)
    body = SelectionSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    try:
        agent_cart.add(session, diner, body.validated_data)
    except (DatabaseError, Problem):
        return Response({'detail': 'No pudimos verificar el plato. Inténtalo de nuevo.'}, status=503)
    response = {'carrito': cart_of(session, diner), 'selecciones': agent_cart.selected(diner)}
    from assistant.service import suggestion
    extra = suggestion(session, diner, body.validated_data['producto'])
    if extra:
        response['sugerencia'] = extra
    return Response(response)
