from django.apps import AppConfig


class TenancyConfig(AppConfig):
    name = "tenancy"

    def ready(self):
        from .audit import connect

        connect()
