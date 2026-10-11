"""Entrada pública de Meta: validar, persistir y devolver sin esperar al procesamiento."""
import hashlib
import json

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import WhatsAppWebhookEvent
from .processing import launch_event
from .webhook import verify_signature, verify_subscription


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def webhook(request):
    if request.method == 'GET':
        status, body = verify_subscription(request.GET, settings.WA_VERIFY_TOKEN)
        return HttpResponse(body, status=status, content_type='text/plain')
    raw = request.body
    if not verify_signature(raw, request.headers.get('X-Hub-Signature-256'), settings.META_APP_SECRET):
        return JsonResponse({'error': 'invalid_signature', 'message': 'La firma de WhatsApp no es válida o falta configurar el secreto.'}, status=403)
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError
        canonical = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()
    except (ValueError, UnicodeError):
        # Una firma válida siempre se acusa; el procesador conserva el error de un cuerpo ilegible.
        canonical = raw
    with transaction.atomic():
        event, created = WhatsAppWebhookEvent.objects.get_or_create(event_id=hashlib.sha256(canonical).hexdigest(), defaults={'raw_body': raw})
        if created:
            transaction.on_commit(lambda: launch_event(event.pk))
    return JsonResponse({'ok': True})
