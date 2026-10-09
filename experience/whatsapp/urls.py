from django.urls import path
from .api import WhatsAppView

urlpatterns = [
    path('whatsapp', WhatsAppView.as_view(http_method_names=['get', 'head', 'options'])),
    path('whatsapp/connect', WhatsAppView.as_view(action='connect', http_method_names=['post', 'options'])),
    path('whatsapp/disconnect', WhatsAppView.as_view(action='disconnect', http_method_names=['post', 'options'])),
    path('whatsapp/test', WhatsAppView.as_view(action='test', http_method_names=['post', 'options'])),
    path('whatsapp/conversations/<int:pk>', WhatsAppView.as_view(http_method_names=['get', 'head', 'options'])),
    path('whatsapp/conversations/<int:pk>/reply', WhatsAppView.as_view(action='reply', http_method_names=['post', 'options'])),
]
