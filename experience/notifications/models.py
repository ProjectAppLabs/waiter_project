"""Avisos propios y generales de cada restaurante."""
from django.db import models


class Notification(models.Model):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE)
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE, null=True, blank=True)
    recipient = models.ForeignKey('accounts.Account', on_delete=models.CASCADE, null=True, blank=True)
    kind = models.CharField(max_length=12, choices=[(k, k) for k in ('kitchen', 'inventory', 'system', 'access', 'cash')])
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default='')
    res_model = models.CharField(max_length=80, blank=True, default='')
    res_id = models.PositiveBigIntegerField(null=True, blank=True)
    action = models.CharField(max_length=80, blank=True, default='')
    action_done = models.BooleanField(default=False)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
