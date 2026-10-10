from django.urls import path
from .api import AssistantView

urlpatterns = [
    path('assistant', AssistantView.as_view(action='status', http_method_names=['get', 'head', 'options'])),
    path('assistant/status', AssistantView.as_view(action='status', http_method_names=['get', 'head', 'options'])),
    path('assistant/tags', AssistantView.as_view(action='tags', http_method_names=['get', 'head', 'options'])),
    path('assistant/tags/propose', AssistantView.as_view(action='propose', http_method_names=['post', 'head', 'options'])),
    path('assistant/tags/<int:product_id>', AssistantView.as_view(action='tag', http_method_names=['patch', 'head', 'options'])),
    path('assistant/participants', AssistantView.as_view(action='participants', http_method_names=['get', 'head', 'options'])),
    path('assistant/participants/<int:participant_id>/lift', AssistantView.as_view(action='lift', http_method_names=['post', 'head', 'options'])),
]
