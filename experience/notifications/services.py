"""Destinatarios y visibilidad de avisos sin cruces entre organizaciones."""
from django.db.models import Q

from accounts.models import Account
from accounts.services import restaurants_for
from .models import Notification


def notify_outside_hours(account, restaurant, window):
    recipients = Account.objects.filter(organization=account.organization, active=True).filter(
        Q(role='owner') | Q(role='admin', restaurants=restaurant)).distinct()
    Notification.objects.bulk_create([Notification(
        organization=account.organization, restaurant=restaurant, recipient=recipient, kind='access',
        title='Intento de acceso fuera de turno',
        body=f'{account.name} intentó entrar a las {window["local_time"]}, fuera de su turno ({window["label"]})',
        res_model='accounts.Account', res_id=account.id,
    ) for recipient in recipients])


def visible_notifications(account):
    return Notification.objects.filter(organization=account.organization).filter(
        Q(recipient=account) | Q(recipient__isnull=True, restaurant__in=restaurants_for(account))).order_by('-created_at', '-id')
