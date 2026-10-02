"""Plano y mesas del restaurante; los pedidos conservan su historial."""

import secrets

from django.db import models
from django.core.validators import RegexValidator


def table_token():
    return secrets.token_hex(16)


def empty_plan():
    return {"walls": [], "zones": [], "decor": [], "images": [], "background_size": None}


class Floor(models.Model):
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.CASCADE, related_name="floors")
    name = models.CharField(max_length=100)
    sequence = models.IntegerField(default=0)
    active = models.BooleanField(default=True)
    plan = models.JSONField(default=empty_plan)
    background = models.FileField(upload_to="floors", blank=True)
    revision = models.PositiveIntegerField(default=0)
    zone_staff = models.JSONField(default=dict)


class Table(models.Model):
    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name="tables")
    number = models.PositiveIntegerField()
    seats = models.PositiveIntegerField(default=4)
    x = models.PositiveIntegerField(default=20)
    y = models.PositiveIntegerField(default=20)
    width = models.PositiveIntegerField(default=80)
    height = models.PositiveIntegerField(default=80)
    shape = models.CharField(max_length=6, default="square", choices=[("square", "Cuadrada"), ("round", "Redonda")])
    color = models.CharField(max_length=7, blank=True, default="")
    zone_id = models.CharField(max_length=80, blank=True, default="")
    active = models.BooleanField(default=True)
    call = models.CharField(
        max_length=8, default="none", choices=[(s, s) for s in ("none", "ordering", "assist", "bill")]
    )
    call_at = models.DateTimeField(null=True, blank=True)
    token = models.CharField(max_length=64, unique=True, default=table_token,
        validators=[RegexValidator(r"\A[A-Za-z0-9]{6,64}\Z", "Usa entre 6 y 64 caracteres alfanuméricos.")])

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["floor", "number"], name="table_floor_number_unique"),
            models.CheckConstraint(condition=models.Q(number__gte=1, number__lte=9999), name="table_number_range"),
            models.CheckConstraint(condition=models.Q(seats__gte=1, seats__lte=100), name="table_seats_range"),
            models.CheckConstraint(condition=models.Q(width__gte=20, height__gte=20), name="table_size_minimum"),
        ]
