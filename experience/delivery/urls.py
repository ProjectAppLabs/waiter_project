from django.urls import path
from . import api, links

urlpatterns = [
    path('api/pos/v1/delivery/settings', api.SettingsView.as_view(http_method_names=['get', 'options'])),
    path('api/pos/v1/delivery/settings/<int:restaurant_id>', api.SettingsView.as_view(http_method_names=['put', 'options'])),
    path('api/v1/<slug:rest>/domicilio/cotizar', api.QuoteView.as_view()),
    path('api/v1/<slug:rest>/domicilio/buscar', api.SearchView.as_view()),
    path('api/v1/sesiones/<uuid:session_id>/domicilio', api.SessionView.as_view()),
    path('api/v1/<slug:rest>/domicilio/direcciones', api.AddressesView.as_view(http_method_names=['get', 'options'])),
    path('api/v1/<slug:rest>/domicilio/direcciones/<int:address_id>', api.AddressesView.as_view(http_method_names=['delete', 'options'])),
    path('api/v1/<slug:rest>/datos', api.DataView.as_view()),
    path('api/v1/<slug:rest>/domicilio/enlace', links.LinkView.as_view()),
    path('api/v1/domicilio/ubicar/<str:token>', links.LocateView.as_view()),
]
