"""La siembra cubre también altas internas, igual que ventas."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from tenancy.models import Organization

from .services import seed_organization


@receiver(post_save, sender=Organization)
def organization_created(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        seed_organization(instance)
