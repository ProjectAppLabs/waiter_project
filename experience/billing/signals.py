from datetime import date

from django.db.models.signals import post_save
from django.dispatch import receiver

from tenancy.models import Organization

from .models import BillingSettings, Resolution


@receiver(post_save, sender=Organization)
def seed_organization(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        BillingSettings.objects.get_or_create(organization=instance)
        Resolution.objects.get_or_create(
            organization=instance,
            prefix="SETP",
            defaults={
                "kind": "pos",
                "number_from": 990000000,
                "number_to": 995000000,
                "next_number": 990000000,
                "valid_from": date(2020, 1, 1),
                "valid_to": date(2099, 12, 31),
                "technical_key": "SIMULADO",
            },
        )
