import os

from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path


def health_check(request):
    # 'project' y 'environment' dejan verificar QUIÉN respondió (convención del fleet).
    return JsonResponse({
        'status': 'ok',
        'project': settings.BASE_DIR.name,
        'environment': getattr(settings, 'DJANGO_ENV', os.getenv('DJANGO_ENV', 'development')),
    })


from whatsapp.views import webhook as whatsapp_webhook


from assistant.api import ProfileView

urlpatterns = [
    path('', include('delivery.urls')),
    path('api/pos/v1/', include('assistant.urls')),
    path('api/v1/<slug:rest>/<slug:sede>/assistant/profile', ProfileView.as_view()),
    path('webhooks/whatsapp', whatsapp_webhook),
    path('api/pos/v1/', include('whatsapp.urls')),
    path('api/platform/v1/', include('tenancy.urls')),
    path('api/pos/v1/', include('tenancy.pos_urls')),
    path('api/pos/v1/', include('catalog.urls')),
    path('api/pos/v1/', include('inventory.urls')),
    path('api/pos/v1/', include('sales.urls')),
    path('api/pos/v1/', include('tables.urls')),
    path('api/pos/v1/', include('kitchen.urls')),
    path('api/pos/v1/', include('realtime.urls')),
    path('api/pos/v1/', include('loyalty.urls')),
    path('api/pos/v1/', include('reservations.urls')),
    path('api/pos/v1/', include('reports.urls')),
    path('api/pos/v1/', include('billing.urls')),
    path('api/pos/v1/', include('experience_app.urls.pos')),
    path('api/pos/v1/', include('accounts.urls')),
    path('api/health/', health_check, name='health-check'),
    path('', include('experience_app.urls')),
]
