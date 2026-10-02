from django.apps import AppConfig


class LoyaltyConfig(AppConfig):
    name = "loyalty"

    def ready(self):
        from . import signals  # noqa: F401
