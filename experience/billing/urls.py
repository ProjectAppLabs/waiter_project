from django.urls import path

from . import api
from .company import BrandView, CompanyView, LogoView

urlpatterns = [
    path("company", CompanyView.as_view()),
    path("brand", BrandView.as_view()),
    path("brand/logo", LogoView.as_view()),
    path("billing/orders", api.BillingOrdersView.as_view()),
    path("billing/orders/<int:pk>/review", api.ReviewView.as_view()),
    path("billing/orders/<int:pk>/document", api.EmitView.as_view()),
    path("documents", api.DocumentsView.as_view()),
    path("documents/<int:pk>", api.DocumentsView.as_view()),
    path("documents/<int:pk>/detail", api.DetailView.as_view()),
    path("documents/<int:pk>/pdf", api.PrintView.as_view()),
    path("documents/<int:pk>/retry", api.RetryView.as_view()),
    path("billing/settings", api.SettingsView.as_view()),
    path("billing/resolutions", api.ResolutionsView.as_view()),
    path("billing/resolutions/<int:pk>", api.ResolutionsView.as_view()),
]
