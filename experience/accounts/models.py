"""Personas, sesiones y asistencia aisladas por organización."""
from django.db import models
from django.db.models.functions import Lower

from tenancy.models import Identity
from tenancy.fields import only_when


def default_notify_prefs():
    return {f'{kind}_{channel}': True for kind in ('kitchen', 'inventory', 'system') for channel in ('popup', 'sound')}


class Account(Identity):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE, related_name='accounts')
    email = models.EmailField(null=True, blank=True)
    role = models.CharField(max_length=10, choices=[(r, r) for r in ('owner', 'admin', 'cashier', 'waiter')])
    notify_prefs = models.JSONField(default=default_notify_prefs)
    shift_start = models.FloatField(null=True, blank=True)
    shift_end = models.FloatField(null=True, blank=True)
    restaurants = models.ManyToManyField('tenancy.Restaurant', related_name='accounts', blank=True)
    legacy_odoo_employee_id = models.PositiveIntegerField(null=True, blank=True)
    legacy_odoo_user_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['organization', 'username'], name='account_org_username_unique'),
            models.UniqueConstraint(Lower('email'), 'organization', name='account_org_email_unique'),
        ]


class Attendance(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='attendances')
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.SET_NULL, null=True, blank=True)
    check_in = models.DateTimeField()
    check_out = models.DateTimeField(null=True, blank=True)
    # Una sola asistencia abierta por persona (ver tenancy.fields.only_when).
    open_account = only_when(models.Q(check_out__isnull=True), 'account_id', models.BigIntegerField())

    class Meta:
        constraints = [models.UniqueConstraint(fields=['open_account'], name='one_open_attendance')]


class Session(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='sessions')
    token_hash = models.CharField(max_length=64, unique=True)
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.SET_NULL, null=True, blank=True)
    expires = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
