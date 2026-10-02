from django.urls import path

from .api import NotificationsView

urlpatterns = [
    path('read_all', NotificationsView.as_view(http_method_names=['post', 'options'])),
    path('<int:pk>/read', NotificationsView.as_view(http_method_names=['post', 'options'])),
]
