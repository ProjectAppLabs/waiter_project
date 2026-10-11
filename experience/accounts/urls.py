from django.urls import include, path, re_path

from notifications.api import NotificationsView
from tenancy.http import NotFoundView
from .api import AuthView, HoursView, OrganizationView, RestaurantsView, TeamView

urlpatterns = [path(f'auth/{action}', AuthView.as_view(action=action, http_method_names=['get', 'head', 'options'] if action == 'me' else ['post', 'options']))
               for action in ('login', 'logout', 'me', 'request_code', 'activate', 'change_password')]
urlpatterns += [
    path('org', OrganizationView.as_view()),
    path('restaurants', RestaurantsView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
    path('restaurants/<int:pk>', RestaurantsView.as_view(http_method_names=['patch', 'options'])),
    path('restaurants/<int:pk>/hours', HoursView.as_view(http_method_names=['get', 'head', 'put', 'delete', 'options'])),
    path('team', TeamView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
    path('team/<int:pk>', TeamView.as_view(http_method_names=['patch', 'options'])),
    path('notifications', NotificationsView.as_view(http_method_names=['get', 'head', 'options'])),
    path('notifications/', include('notifications.urls')),
]
urlpatterns += [path(f'team/<int:pk>/{action}', TeamView.as_view(action=action, http_method_names=['post', 'options']))
                for action in ('deactivate', 'resend_invite')]
urlpatterns += [re_path(r'^.*$', NotFoundView.as_view())]
