from django.urls import path

from .api import ClosingsView, OrderActionView, OrdersView, PaymentMethodsView, ShiftsView
from .reports import InsightsView, SalesView
from .settings_api import CashSettingsView, RolesView, SettingsView

urlpatterns = [
    path("orders", OrdersView.as_view(http_method_names=["get", "post", "head", "options"])),
    path("orders/<int:pk>", OrdersView.as_view(http_method_names=["get", "patch", "head", "options"])),
    path("shifts", ShiftsView.as_view(http_method_names=["get", "post", "head", "options"])),
    path("shifts/open", ShiftsView.as_view(mode="open", http_method_names=["get", "head", "options"])),
    path("shifts/closings", ClosingsView.as_view()),
    path("payment-methods", PaymentMethodsView.as_view(http_method_names=["get", "post", "head", "options"])),
    path("payment-methods/<int:pk>", PaymentMethodsView.as_view(http_method_names=["patch", "delete", "options"])),
    path("settings", SettingsView.as_view()),
    path("settings/cash", CashSettingsView.as_view()),
    path("settings/roles", RolesView.as_view()),
    path("sales/summary", SalesView.as_view()),
    path("sales/orders", SalesView.as_view(mode="orders")),
    path("sales/insights", InsightsView.as_view()),
]
urlpatterns += [
    path(
        f"orders/<int:pk>/{action}",
        OrderActionView.as_view(
            action=action,
            http_method_names=(
                ["post", "delete", "options"]
                if action == "lines"
                else ["put", "options"]
                if action == "tip"
                else ["post", "options"]
            ),
        ),
    )
    for action in ("lines", "fire", "payments", "tip", "pay", "cancel")
]
urlpatterns += [
    path(
        f"shifts/<int:pk>/{mode}",
        ShiftsView.as_view(
            mode=mode, http_method_names=["get", "head", "options"] if mode == "closing" else ["post", "options"]
        ),
    )
    for mode in ("closing", "moves", "close")
]
