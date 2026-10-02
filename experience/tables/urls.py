from django.urls import path

from .api import CallsView, FloorsView, ImageView, PlanView, ShiftZonesView, ZoneStaffView

urlpatterns = [
    path("floors", FloorsView.as_view(http_method_names=["get", "post", "head", "options"])),
    path("floors/<int:pk>", FloorsView.as_view(http_method_names=["patch", "delete", "options"])),
    path("floors/<int:pk>/plan", PlanView.as_view()),
    path("floors/<int:pk>/zone-staff", ZoneStaffView.as_view()),
    path("floors/<int:pk>/background", ImageView.as_view()),
    path("floors/<int:pk>/images/<str:image_id>", ImageView.as_view()),
    path("shifts/<int:pk>/zones", ShiftZonesView.as_view()),
    path("tables/calls", CallsView.as_view(http_method_names=["get", "head", "options"])),
    path("tables/<int:pk>/call", CallsView.as_view(http_method_names=["put", "options"])),
]
