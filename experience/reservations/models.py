"""Reservas de mesa y anticipos separados de las ventas y de la caja."""

import secrets

from django.db import models

from catalog.models import Owned, choices
from sales.models import money
from tenancy.fields import ExactCharField


def pay_token():
    return secrets.token_urlsafe(24)


def weekly():
    return {str(day): [[10, 22]] for day in range(7)}


def rules():
    return {"minNotice": 0, "maxDays": 0}


class ReservationSchedule(models.Model):
    restaurant = models.OneToOneField("tenancy.Restaurant", on_delete=models.CASCADE)
    weekly = models.JSONField(default=weekly)
    overrides = models.JSONField(default=list)
    rules = models.JSONField(default=rules)


class Reservation(Owned):
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.PROTECT)
    code = models.CharField(max_length=30)
    customer = models.ForeignKey("loyalty.Customer", on_delete=models.PROTECT, null=True, blank=True)
    customer_name = models.CharField(max_length=120)
    customer_email = models.EmailField(blank=True, default="")
    customer_phone = models.CharField(max_length=40, blank=True, default="")
    people = models.PositiveIntegerField(default=2)
    baby_chair = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")
    date = models.DateField()
    time_start = models.FloatField()
    time_end = models.FloatField()
    prep_minutes = models.PositiveSmallIntegerField(default=30)
    tables = models.ManyToManyField("tables.Table", related_name="reservations")
    main_table = models.ForeignKey("tables.Table", on_delete=models.PROTECT, related_name="main_reservations")
    state = models.CharField(
        max_length=9, choices=choices("confirmed", "seated", "no_show", "cancelled"), default="confirmed"
    )
    preorder = models.OneToOneField(
        "sales.Order", on_delete=models.PROTECT, null=True, blank=True, related_name="reservation"
    )
    deposit_amount = money()
    deposit_state = models.CharField(max_length=7, choices=choices("none", "pending", "paid"), default="none")
    deposit_reference = models.CharField(max_length=120, blank=True, default="")
    deposit_paid_at = models.DateTimeField(null=True, blank=True)
    pay_token = ExactCharField(max_length=32, default=pay_token, unique=True)
    created_by = models.ForeignKey("accounts.Account", on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def hold_start(self):
        return max(0, self.time_start - self.prep_minutes / 60)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="reservation_org_code_unique"),
            models.CheckConstraint(
                condition=models.Q(time_start__gte=0, time_end__lte=24, time_end__gt=models.F("time_start")),
                name="reservation_time_range",
            ),
            models.CheckConstraint(
                condition=models.Q(prep_minutes__in=[0, 15, 30, 60, 120]), name="reservation_prep_choices"
            ),
            models.CheckConstraint(condition=models.Q(people__gte=1), name="reservation_people_positive"),
            models.CheckConstraint(
                condition=models.Q(deposit_amount__gte=0, deposit_amount__lte=50000000),
                name="reservation_deposit_range",
            ),
        ]
        indexes = [models.Index(fields=["restaurant", "date", "state"])]


class ReservationLine(models.Model):
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    qty = models.DecimalField(max_digits=12, decimal_places=6)
    note = models.CharField(max_length=500, blank=True, default="")
    price = money()
