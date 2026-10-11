"""Webhook de WhatsApp para Waiter con Django.

En urls.py:
    from examples.django_views import whatsapp_webhook
    urlpatterns += [path("webhooks/whatsapp", whatsapp_webhook)]

Para producción procesa los eventos en una cola (Celery, RQ, Django-Q) y responde 200 de inmediato.
"""
import json
import logging
import os

from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt

from whatsapp import IncomingMessage, StatusUpdate, parse_events, verify_signature, verify_subscription

log = logging.getLogger("waiter.whatsapp")


@csrf_exempt
def whatsapp_webhook(request):
    if request.method == "GET":
        status, body = verify_subscription(request.GET, os.environ["WA_VERIFY_TOKEN"])
        return HttpResponse(body, status=status, content_type="text/plain")

    if request.method == "POST":
        if not verify_signature(
            request.body, request.headers.get("X-Hub-Signature-256"), os.environ["META_APP_SECRET"]
        ):
            return HttpResponse(status=401)
        payload = json.loads(request.body)
        for event in parse_events(payload):  # idealmente: encolar en vez de procesar aquí
            if isinstance(event, IncomingMessage):
                log.info("Mensaje de %s: %s", event.from_number, event.text)
            elif isinstance(event, StatusUpdate):
                log.info("Estado %s -> %s", event.message_id, event.status)
        return HttpResponse(status=200)

    return HttpResponseForbidden()
