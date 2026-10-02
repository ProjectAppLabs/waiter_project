"""Pasarelas del menú bajo la API autenticada del POS."""
from django.urls import path
from experience_app.views.menu_admin import MenuAdminView

urlpatterns = [path(f'admin/{section}', MenuAdminView.as_view(section=section)) for section in
               ('menu_settings', 'menu_decorations', 'mcp_keys', 'payment_gateways')]
