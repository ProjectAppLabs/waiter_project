from django.urls import path, re_path

from .api import AuthView, OrganizationsView, TeamView, MetricsView, ChargesView, BillingSettingsView, UsageView, ModulesView, PricingSettingsView, CreditsView
from .http import NotFoundView

urlpatterns = [path(f'auth/{action}', AuthView.as_view(action=action, http_method_names=['get', 'head', 'options'] if action == 'me' else ['post', 'options']))
               for action in ('login', 'logout', 'me', 'request_code', 'activate')]
urlpatterns += [
    path('organizations', OrganizationsView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
    path('organizations/<slug:slug>', OrganizationsView.as_view(http_method_names=['get', 'head', 'patch', 'options'])),
    path('team', TeamView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
]
urlpatterns += [path(f'organizations/<slug:slug>/{action}', OrganizationsView.as_view(action=action, http_method_names=['post', 'options']))
                for action in ('suspend', 'reactivate', 'resend_invite')]
urlpatterns += [path(f'team/<int:pk>/{action}', TeamView.as_view(action=action, http_method_names=['post', 'options']))
                for action in ('deactivate', 'resend_invite')]
urlpatterns += [
    path('organizations/<slug:slug>/modules', ModulesView.as_view(http_method_names=['get', 'head', 'patch', 'options'])),
    path('organizations/<slug:slug>/usage', UsageView.as_view(http_method_names=['get', 'head', 'options'])),
    path('metrics', MetricsView.as_view(http_method_names=['get', 'head', 'options'])),
    path('organizations/<slug:slug>/metrics', MetricsView.as_view(http_method_names=['get', 'head', 'options'])),
    path('charges', ChargesView.as_view(http_method_names=['get', 'head', 'options'])),
    path('organizations/<slug:slug>/charges', ChargesView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
    path('charges/<int:pk>/pay', ChargesView.as_view(action='pay', http_method_names=['post', 'options'])),
    path('charges/<int:pk>/void', ChargesView.as_view(action='void', http_method_names=['post', 'options'])),
    path('settings/billing', BillingSettingsView.as_view(http_method_names=['get', 'head', 'patch', 'options'])),
]
urlpatterns += [path('settings/pricing', PricingSettingsView.as_view()),
                path('organizations/<slug:slug>/credits', CreditsView.as_view(http_method_names=['get', 'head', 'post', 'options']))]
from .two_factor import TwoFactorView, ResetTwoFactorView
urlpatterns += [path(f'auth/2fa/{action}', TwoFactorView.as_view(action=action)) for action in ('setup', 'enable', 'disable', 'verify')]
urlpatterns += [path('team/<int:pk>/reset_2fa', ResetTwoFactorView.as_view())]
from .support import SupportView
urlpatterns += [path('organizations/<slug:slug>/support', SupportView.as_view(platform=True)),
                path('organizations/<slug:slug>/support/enter', SupportView.as_view(platform=True, action='enter', http_method_names=['post', 'options']))]
urlpatterns += [re_path(r'^.*$', NotFoundView.as_view())]
