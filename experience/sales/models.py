"""Pedidos, cocina y caja con importes decimales e historial propio."""

from django.db import models
from django.utils import timezone

from tenancy.fields import ExactCharField, only_when


def money(**kwargs):
    return models.DecimalField(max_digits=16, decimal_places=2, default=0, **kwargs)


class PaymentMethod(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=[(s, s) for s in ("cash", "bank", "pay_later")])
    active = models.BooleanField(default=True)
    restaurants = models.ManyToManyField("tenancy.Restaurant", blank=True)


class RestaurantSettings(models.Model):
    restaurant = models.OneToOneField("tenancy.Restaurant", on_delete=models.CASCADE, related_name="settings")
    alert_late_minutes = models.PositiveIntegerField(default=18)
    alert_bill_minutes = models.PositiveIntegerField(default=10)
    roi_hour_cost = models.DecimalField(max_digits=16, decimal_places=2, default=20000)
    roi_minutes_per_order = models.DecimalField(max_digits=12, decimal_places=2, default=11)
    roi_baseline_hours_per_100 = models.DecimalField(max_digits=12, decimal_places=2, default="18.4")
    roi_monthly_cost = models.DecimalField(max_digits=16, decimal_places=2, default=2740000)
    roi_start_date = models.DateField(null=True, blank=True)
    kitchen_prepay_roles = models.JSONField(default=list)


class CashShift(models.Model):
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.PROTECT)
    state = models.CharField(max_length=6, default="open", choices=[("open", "Abierto"), ("closed", "Cerrado")])
    opened_by = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+")
    opened_at = models.DateTimeField(default=timezone.now)
    opening_cash = money()
    opening_notes = models.TextField(blank=True, default="")
    closed_by = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+", null=True)
    closed_at = models.DateTimeField(null=True)
    expected_cash = money()
    counted_cash = money()
    difference = money()
    closing_notes = models.TextField(blank=True, default="")
    zone_staff = models.JSONField(default=dict)
    # Una sola caja abierta por restaurante (ver tenancy.fields.only_when).
    open_restaurant = only_when(models.Q(state="open"), "restaurant_id", models.BigIntegerField())

    class Meta:
        constraints = [models.UniqueConstraint(fields=["open_restaurant"], name="one_open_cash_shift")]


class CashMove(models.Model):
    shift = models.ForeignKey(CashShift, on_delete=models.PROTECT, related_name="moves")
    kind = models.CharField(max_length=3, choices=[("in", "Entrada"), ("out", "Salida")])
    amount = money()
    reason = models.CharField(max_length=200)
    account = models.ForeignKey("accounts.Account", on_delete=models.PROTECT)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="cash_move_positive")]


class Order(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.PROTECT)
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.PROTECT)
    shift = models.ForeignKey(CashShift, on_delete=models.PROTECT, related_name="orders")
    uuid = models.UUIDField()
    service = models.CharField(max_length=8, choices=[(s, s) for s in ("dine_in", "takeout", "delivery")])
    prefix = models.CharField(max_length=2)
    tracking = models.PositiveIntegerField()
    number = models.CharField(max_length=30)
    table = models.ForeignKey("tables.Table", on_delete=models.SET_NULL, null=True, related_name="orders")
    guests = models.PositiveIntegerField(default=1)
    baby_chair = models.BooleanField(default=False)
    customer = models.ForeignKey(
        "loyalty.Customer", on_delete=models.PROTECT, null=True, blank=True, related_name="orders"
    )
    customer_name = models.CharField(max_length=120, blank=True, default="")
    delivery_address = models.CharField(max_length=500, blank=True, default="")
    delivery_phone = models.CharField(max_length=40, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    origin = models.CharField(max_length=6, default="waiter", choices=[(s, s) for s in ("waiter", "diner", "ai")])
    channel = models.CharField(max_length=8, default="pos", choices=[(s, s) for s in ("pos", "menu", "whatsapp")])
    state = models.CharField(max_length=9, default="draft", choices=[(s, s) for s in ("draft", "paid", "cancelled")])
    billing = models.BooleanField(default=False)
    billing_at = models.DateTimeField(null=True)
    channel_request = models.CharField(max_length=64, blank=True, default="")
    created_by = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+", null=True)
    created_at = models.DateTimeField(default=timezone.now)
    paid_at = models.DateTimeField(null=True)
    paid_by = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+", null=True)
    subtotal = money()
    tax = money()
    tip = money()
    total = money()
    paid = money()
    change = money()
    refunded = money()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "uuid"], name="order_org_uuid_unique")]
        indexes = [
            models.Index(fields=["restaurant", "state", "paid_at"]),
            models.Index(fields=["restaurant", "prefix", "created_at"]),
        ]


class Course(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="courses")
    index = models.PositiveIntegerField()
    fired_at = models.DateTimeField(default=timezone.now)
    preparation_at = models.DateTimeField(null=True)
    ready_at = models.DateTimeField(null=True)
    served_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["order", "index"], name="course_order_index_unique")]


class OrderLine(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    uuid = models.UUIDField()
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    name = models.CharField(max_length=200)
    qty = models.DecimalField(max_digits=12, decimal_places=6)
    unit_price = money()
    taxes = models.JSONField(default=list)
    options = models.JSONField(default=list)
    stock_usage = models.JSONField(default=list)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, related_name="children")
    loyalty_card = models.ForeignKey("loyalty.LoyaltyCard", on_delete=models.PROTECT, null=True, blank=True)
    points_cost = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    coupon_code = models.CharField(max_length=32, blank=True, default="")
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    note = models.CharField(max_length=500, blank=True, default="")
    course = models.ForeignKey(Course, on_delete=models.SET_NULL, null=True, related_name="lines")
    ready_at = models.DateTimeField(null=True)
    served_at = models.DateTimeField(null=True)
    cancelled = models.BooleanField(default=False)
    subtotal = money()
    total = money()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "uuid"], name="line_order_uuid_unique"),
            models.CheckConstraint(condition=models.Q(qty__gt=0, qty__lte=999), name="line_qty_range"),
            models.CheckConstraint(
                condition=models.Q(discount_pct__gte=0, discount_pct__lte=100), name="line_discount_range"
            ),
        ]


class Payment(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.PROTECT)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    method = models.ForeignKey(PaymentMethod, on_delete=models.PROTECT, related_name="payments")
    amount = money()
    received = models.DecimalField(max_digits=16, decimal_places=2, null=True)
    reference = models.CharField(max_length=60, blank=True, default="")
    request_key = ExactCharField(max_length=80)
    account = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "request_key"], name="payment_org_key_unique"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_positive"),
        ]


class Refund(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.PROTECT)
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.PROTECT)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="refunds")
    shift = models.ForeignKey(CashShift, on_delete=models.PROTECT, related_name="refunds")
    lines = models.JSONField(default=list)
    tip = money()
    total = money()
    reason = models.CharField(max_length=500)
    restock = models.BooleanField(default=False)
    request_key = ExactCharField(max_length=80)
    account = models.ForeignKey("accounts.Account", on_delete=models.PROTECT)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "request_key"], name="refund_org_key_unique"),
            models.CheckConstraint(condition=models.Q(total__gte=0, tip__gte=0), name="refund_nonnegative"),
        ]
        indexes = [models.Index(fields=["restaurant", "created_at"], name="refund_restaurant_date")]


class RefundPayment(models.Model):
    refund = models.ForeignKey(Refund, on_delete=models.PROTECT, related_name="payments")
    method = models.ForeignKey(PaymentMethod, on_delete=models.PROTECT)
    amount = money()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["refund", "method"], name="refund_method_unique"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="refund_payment_positive"),
        ]
