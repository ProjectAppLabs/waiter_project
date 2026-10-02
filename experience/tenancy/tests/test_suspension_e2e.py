"""Suspensión y reactivación desde ProjectApp por todas las entradas del restaurante."""
import base64
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import Attendance, Session
from catalog.images import set_image
from experience_app.mcp import keys
from experience_app.tests.test_core import core as core
from realtime.models import SalesEvent
from sales.models import CashShift
from tenancy.models import PlatformAudit
from .helpers import platform_client, platform_user

pytestmark = pytest.mark.django_db


def close_keeping_connection(response):
    """Cierra la respuesta sin cerrar la conexión de la prueba.

    `response.close()` dispara request_finished y Django cierra la conexión (el cliente de pruebas vuelve a conectar esa
    señal al terminar cada petición). Sobre PostgreSQL eso corta la transacción de la prueba; sobre SQLite pasaba sin
    efecto, por eso no se veía.
    """
    from django.core.signals import request_finished
    from django.db import close_old_connections
    request_finished.disconnect(close_old_connections)
    try:
        response.close()
    finally:
        request_finished.connect(close_old_connections)



# Falla si suspender deja entrar por login, cookie, SSE abierto, fotos, menú, MCP o WhatsApp, o impide reactivar.
def test_suspension_and_reactivation_all_entrypoints(core, settings):
    org, venue, owner, table, product = core
    settings.SALES_SSE_TEST_ITERATIONS = 3
    settings.EXPERIENCE_INTERNAL_KEY = 'clave-de-prueba'
    output = BytesIO()
    Image.new('RGB', (8, 8), 'red').save(output, format='PNG')
    set_image(product, base64.b64encode(output.getvalue()).decode())
    CashShift.objects.create(restaurant=venue, opened_by=owner)
    operator = platform_client(platform_user())
    pos = APIClient()
    pos.credentials(HTTP_X_WAITER_ORG=org.slug)
    credentials = {'login': owner.username, 'password': 'Clave-2026'}
    assert pos.post('/api/pos/v1/auth/login', credentials, format='json').status_code == 200
    session_cookie = pos.cookies['waiter_sid'].value
    after = SalesEvent.objects.order_by('-pk').values_list('pk', flat=True).first() or 0
    stream = pos.get(f'/api/pos/v1/events?restaurant_id={venue.pk}&after={after}', HTTP_ACCEPT='text/event-stream')
    SalesEvent.objects.create(organization=org, restaurant=venue, kind='orders')
    iterator = iter(stream.streaming_content)
    assert b'event: ' in next(iterator)
    _, raw = keys.create(org.slug, venue.slug, 'Prueba de suspensión')
    public = APIClient()
    menu = f'/api/v1/{org.slug}/{venue.slug}/t/{table.token}/'
    photo = f'/api/pos/v1/photos/{product.pk}?org={org.slug}'
    whatsapp = f'/internal/v1/{org.slug}/{venue.slug}/whatsapp/pedidos/'
    quote_body = {'idempotencia': str(uuid4()), 'cliente': {'nombre': 'Ana', 'telefono': '+573001234567'},
                  'lineas': [{'producto': product.pk, 'cantidad': 1, 'nota': ''}]}
    rpc = {'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}

    def public_probes():
        return [public.get(menu), public.get(f'/api/v1/{org.slug}/'), public.get(photo),
                public.post('/mcp/', rpc, format='json', HTTP_AUTHORIZATION='Bearer ' + raw),
                public.post(whatsapp, quote_body, format='json', HTTP_X_INTERNAL_KEY=settings.EXPERIENCE_INTERNAL_KEY)]

    for response in public_probes():
        assert response.status_code in (200, 201), getattr(response, 'data', None)
        close_keeping_connection(response)
    result = operator.post(f'/api/platform/v1/organizations/{org.slug}/suspend', {'reason': 'Revisión'}, format='json')
    assert result.status_code == 200
    assert not Session.objects.filter(account__organization=org).exists()
    assert not Attendance.objects.filter(account__organization=org, check_out__isnull=True).exists()
    assert b'organization_suspended' in next(iterator)
    with pytest.raises(StopIteration):
        next(iterator)
    for response in [pos.post('/api/pos/v1/auth/login', credentials, format='json'),
                     pos.get('/api/pos/v1/auth/me'), pos.get(f'/api/pos/v1/events?restaurant_id={venue.pk}')]:
        assert response.status_code == 403 and response.data['error'] == 'organization_suspended'
    for response in public_probes():
        assert response.status_code in (403, 404), getattr(response, 'data', None)
        error = response.json()
        assert (error.get('error') == 'organization_suspended' or error.get('message') == 'Este restaurante no está disponible'), error
    result = operator.post(f'/api/platform/v1/organizations/{org.slug}/reactivate', {}, format='json')
    assert result.status_code == 200
    pos.cookies['waiter_sid'] = session_cookie
    assert pos.get('/api/pos/v1/auth/me').status_code == 401
    assert pos.post('/api/pos/v1/auth/login', credentials, format='json').status_code == 200
    assert pos.get('/api/pos/v1/auth/me').status_code == 200
    resumed = pos.get(f'/api/pos/v1/events?restaurant_id={venue.pk}')
    assert resumed.status_code == 200 and resumed.streaming
    close_keeping_connection(resumed)
    for response in public_probes():
        assert response.status_code in (200, 201), getattr(response, 'data', None)
        close_keeping_connection(response)
    assert PlatformAudit.objects.filter(organization=org, action='organization.suspended').count() == 1
    assert PlatformAudit.objects.filter(organization=org, action='organization.reactivated').count() == 1
    close_keeping_connection(stream)


# Falla si un SSE que ya entregó eventos sigue entregándolos después de suspender la organización.
def test_live_sse_stops_after_suspension(core):
    from realtime.api import stream
    from tenancy.services import set_suspension
    org, venue, owner, table, product = core
    first = SalesEvent.objects.create(organization=org, restaurant=venue, kind='orders')
    generator = stream(org.pk, venue.pk, first.pk - 1, iterations=3)
    assert 'event: orders' in next(generator)
    set_suspension(None, org, True, 'mora')
    SalesEvent.objects.create(organization=org, restaurant=venue, kind='kitchen')
    assert 'organization_suspended' in next(generator)
    with pytest.raises(StopIteration):
        next(generator)
