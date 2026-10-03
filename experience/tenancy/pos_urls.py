"""Estado de suscripción visible exclusivamente para el dueño del POS."""
from django.urls import path
from .api import SubscriptionView, ConsumptionView, RechargesView

urlpatterns = [path('consumption', ConsumptionView.as_view(http_method_names=['get', 'head', 'options'])), path('subscription', SubscriptionView.as_view(http_method_names=['get', 'head', 'options']))]

urlpatterns += [path('recharges', RechargesView.as_view())]
