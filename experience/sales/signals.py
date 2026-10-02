"""La siembra también cubre altas internas y comandos, no solo la API."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from tenancy.models import Organization, Restaurant

from .services import seed_organization, seed_restaurant


@receiver(post_save, sender=Organization)
def organization_created(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        seed_organization(instance)


@receiver(post_save, sender=Restaurant)
def restaurant_created(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        seed_restaurant(instance)
