from django.urls import path

from . import api

urlpatterns = [
    path('inventory', api.InventoryView.as_view()),
    path('inventory/requests', api.RequestsView.as_view()),
    path('inventory/requests/<int:pk>/mark', api.MarkView.as_view()),
    path('inventory/<int:pk>', api.InventoryView.as_view()),
    path('inventory/<int:pk>/moves', api.MovesView.as_view()),
    path('inventory/<int:pk>/settings', api.SettingsView.as_view()),
]
