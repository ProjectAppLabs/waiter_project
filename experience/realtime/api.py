"""SSE síncrono: runserver reserva un hilo por conexión, hasta cinco minutos."""

import time

from django.conf import settings
from django.db import close_old_connections, connection
from django.http import StreamingHttpResponse
from rest_framework.renderers import BaseRenderer, JSONRenderer

from catalog.api import PosView
from catalog.services import restaurant_for, valid
from tenancy.models import Organization

from .models import SalesEvent


def stream(organization_id, restaurant_id, after, iterations=None, support_session_id=None):
    started = time.monotonic()
    heartbeat = started
    iteration = 0
    while time.monotonic() - started < 300 and (iterations is None or iteration < iterations):
        # Suelta la conexión entre sondeos (el flujo dura minutos), salvo dentro de una transacción: cerrarla ahí rompe
        # a quien la abrió (en las pruebas, la transacción de cada prueba sobre PostgreSQL).
        if iterations is None and not connection.in_atomic_block:
            close_old_connections()
        if support_session_id is not None:
            from accounts.models import Session
            from django.utils import timezone
            if not Session.objects.filter(pk=support_session_id, expires__gt=timezone.now(),
                    support_grant__state='vigente', support_grant__since__lte=timezone.now(),
                    support_grant__until__gt=timezone.now(), support_agent__active=True).exists():
                yield 'event: session_expired\ndata: {"error":"unauthenticated","message":"El acceso de soporte terminó."}\n\n'
                return
        # También se detienen las conexiones abiertas antes de la suspensión.
        if Organization.objects.filter(pk=organization_id, status='suspended').exists():
            yield 'event: organization_suspended\ndata: {"error":"organization_suspended","message":"Este restaurante no está disponible"}\n\n'
            return
        events = list(
            SalesEvent.objects.filter(
                organization_id=organization_id, restaurant_id=restaurant_id, id__gt=after
            ).order_by("id")[:500]
        )
        for item in events:
            yield f"id: {item.pk}\nevent: {item.kind}\ndata: {{}}\n\n"
            after = item.pk
        now = time.monotonic()
        if now - heartbeat >= 15:
            yield ": ping\n\n"
            heartbeat = now
        iteration += 1
        if iterations is None:
            time.sleep(1)


class EventStreamRenderer(BaseRenderer):
    """`EventSource` pide `Accept: text/event-stream`; sin este renderer DRF respondía 406 antes de llegar a la vista."""

    media_type = "text/event-stream"
    format = "sse"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Solo los errores pasan por aquí (el flujo sale como StreamingHttpResponse): van como JSON.
        return JSONRenderer().render(data, "application/json", renderer_context)


class EventsView(PosView):
    renderer_classes = (EventStreamRenderer, JSONRenderer)

    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        after = request.query_params.get("after", "0")
        valid(after.isdecimal() and len(after) <= 19)
        response = StreamingHttpResponse(
            stream(self.org.pk, restaurant.pk, int(after), getattr(settings, "SALES_SSE_TEST_ITERATIONS", None),
                   getattr(getattr(self.account, "_support_session", None), "pk", None)),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        response["Vary"] = "Cookie, X-Waiter-Org"
        return response
