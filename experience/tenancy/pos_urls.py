"""Estado de suscripción visible exclusivamente para el dueño del POS."""
from django.urls import path
from .api import SubscriptionView

urlpatterns = [path('subscription', SubscriptionView.as_view(http_method_names=['get', 'head', 'options']))]
