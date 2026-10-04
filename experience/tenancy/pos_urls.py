"""Estado de suscripción visible exclusivamente para el dueño del POS."""
from django.urls import path
from .api import SubscriptionView, ConsumptionView, RechargesView

urlpatterns = [path('consumption', ConsumptionView.as_view(http_method_names=['get', 'head', 'options'])), path('subscription', SubscriptionView.as_view(http_method_names=['get', 'head', 'options']))]

urlpatterns += [path('recharges', RechargesView.as_view())]

from .audit_api import AuditView
from .support import SupportView, SupportLoginView
urlpatterns += [path('audit', AuditView.as_view()), path('audit/actions', AuditView.as_view(actions=True)),
                path('support', SupportView.as_view()), path('auth/support', SupportLoginView.as_view())]
urlpatterns += [path(f'support/<int:pk>/{action}', SupportView.as_view(action=action, http_method_names=['post', 'options'])) for action in ('approve', 'revoke')]
