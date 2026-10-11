"""Adaptador del menú: tarjetas y solicitudes explícitas modifican el carrito, nunca cocina ni pagos."""
from tenancy.http import Problem
from experience_app.adapters.core.pos import Client
from django.db import transaction
from rest_framework.exceptions import ValidationError

from experience_app.adapters.core.pos import resolve
from experience_app.models import AgentCartSelection, AgentConversation, TableSession
from experience_app.services import catalog, sessions
from experience_app.utils.errors import ConfirmationBusy


def selected(diner):
    return list(AgentCartSelection.objects.filter(diner=diner).values('message_id', 'product_id', 'qty'))


def prepare(session, diner, data):
    lookup = {'diner': diner, 'message_id': data['mensaje'], 'product_id': data['producto']}
    previous = AgentCartSelection.objects.filter(**lookup).first()
    if previous:
        return _same(previous, data)
    chat = AgentConversation.objects.filter(restaurant=session.restaurant_slug, venue=session.venue_slug,
                                            channel='menu', participant=str(diner.id)).first()
    turn = next((t for t in chat.history if t['id'] == str(data['mensaje'])), None) if chat else None
    if not turn or data['producto'] not in {line['producto'] for line in turn['lineas']}:
        raise ValidationError({'detail': 'Este plato no está entre las recomendaciones de ahora.'})
    tenant = resolve(session.restaurant_slug, session.venue_slug, session.table_token)
    catalog.invalidate(session.restaurant_slug, session.venue_slug)
    product = catalog.find_product(tenant, data['producto'])
    rows = Client(tenant).call_kw('product.product', 'read', [[product.id], [
        'active', 'available_in_pos', 'sale_ok', 'attribute_line_ids', 'type', 'is_storable', 'qty_available']])
    if not rows or not all(rows[0].get(k) for k in ('active', 'available_in_pos', 'sale_ok')):
        raise ValidationError({'detail': 'Este plato ya no está disponible.'})
    row = rows[0]
    if row.get('attribute_line_ids') or row.get('type') == 'combo':
        raise ValidationError({'detail': 'Este plato tiene opciones para escoger. Abra su ficha para elegirlas.'})
    if product.sold_out or (row.get('is_storable') and row.get('qty_available', 0) < data['cantidad']):
        raise ValidationError({'detail': 'No hay disponibilidad para esa cantidad. Elige otro plato o menos unidades.'})
    return product


def add(session, diner, data):
    return add_many(session, diner, [data])[0]


def add_many(session, diner, items):
    prepared = [(data, prepare(session, diner, data)) for data in items]
    with transaction.atomic():
        # La confirmación del pedido bloquea la misma fila; las consultas anteriores quedan fuera de esta transacción.
        current = TableSession.objects.select_for_update().get(pk=session.pk)
        if current.confirming or current.state not in TableSession.OPEN_STATES:
            raise ConfirmationBusy()
        selections = []
        for data, product in prepared:
            lookup = {'diner': diner, 'message_id': data['mensaje'], 'product_id': data['producto']}
            selection, created = AgentCartSelection.objects.get_or_create(**lookup, defaults={
                'qty': data['cantidad'], 'note': data['nota']})
            if not created:
                selections.append(_same(selection, data))
                continue
            selection.line = sessions.add_line(current, diner, product, data['cantidad'], data['nota'])
            selection.save(update_fields=['line'])
            from assistant.profiles import record_pick
            record_pick(diner, data['producto'])
            selections.append(selection)
        return selections


def _same(selection, data):
    if selection.qty != data['cantidad'] or selection.note != data['nota']:
        raise ValidationError({'detail': 'Ya añadiste esta selección. Modifica su cantidad o nota desde Mi pedido.'})
    return selection


def apply_requested(session, diner, chat, turn):
    from rest_framework.exceptions import APIException

    from django.db import DatabaseError
    from experience_app.services.agent_chat import explicit_add
    from experience_app.views.sessions import cart_of

    from assistant.tones import phrases, tone_of
    from tenancy.models import Organization
    tone = tone_of(Organization.objects.filter(slug=session.restaurant_slug).first())
    if not explicit_add(turn['mensaje']):
        return {**turn, 'respuesta': phrases(tone, 'use_buttons')[0]}
    updated = dict(turn)
    if not turn.get('resultado_carrito'):
        try:
            add_many(session, diner, [{'mensaje': turn['id'], 'producto': line['producto'],
                'cantidad': line['cantidad'], 'nota': line.get('nota', '')} for line in turn['lineas']])
            # El núcleo ya redactó el «listo» con su sugerencia de acompañamiento y el cupo que queda.
            updated.update(resultado_carrito='agregado')
        except (APIException, DatabaseError, Problem):
            import re
            aviso = re.search(r'(?:Le|Te) quedan [0-9]+ mensajes con el asistente por hoy\.', turn.get('respuesta', ''))
            updated.update(resultado_carrito='no_agregado', respuesta='No pude añadir la selección completa. Revisa disponibilidad y opciones en las fichas de los platos; no añadí nuevos platos de esta solicitud.' + (' ' + aviso[0] if aviso else ''))
        # Actualiza solo este turno y conserva los mensajes nuevos creados en otra pestaña.
        with transaction.atomic():
            current = AgentConversation.objects.select_for_update().get(pk=chat.pk)
            current.history = [updated if t['id'] == turn['id'] else t for t in current.history]
            current.save(update_fields=['history', 'updated_at'])
    return {**updated, 'selecciones': selected(diner), 'carrito': cart_of(session, diner)}
