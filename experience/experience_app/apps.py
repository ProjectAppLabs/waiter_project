from django.apps import AppConfig
from django.db.models.signals import post_migrate


def seed_templates_after_migrate(sender, using='default', **kwargs):
    """Tras `migrate`, la base tiene el catálogo del repo (upsert idempotente; ver plantillas/seed.py)."""
    from experience_app.plantillas.seed import seed
    seed(using=using)


class Experience_appConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'experience_app'

    def ready(self):
        from experience_app.adapters.core.signals import connect
        connect()
        post_migrate.connect(seed_templates_after_migrate, sender=self, dispatch_uid='experience_app.seed_templates')
