"""Documentos de venta y numeración; no constituyen un libro contable."""

from django.db import models

from sales.models import money
from tenancy.fields import ExactCharField, only_when


class Resolution(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.CASCADE)
    kind = models.CharField(max_length=7, choices=[("invoice", "Factura"), ("pos", "POS")])
    prefix = models.CharField(max_length=20)
    number_from = models.PositiveBigIntegerField()
    number_to = models.PositiveBigIntegerField()
    next_number = models.PositiveBigIntegerField()
    valid_from = models.DateField()
    valid_to = models.DateField()
    technical_key = models.CharField(max_length=200, blank=True, default="")
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "prefix"], name="resolution_org_prefix_unique"),
            models.CheckConstraint(
                condition=models.Q(
                    number_from__gte=1,
                    number_to__gte=models.F("number_from"),
                    next_number__gte=models.F("number_from"),
                    next_number__lte=models.F("number_to") + 1,
                    valid_to__gte=models.F("valid_from"),
                ),
                name="resolution_valid_range",
            ),
        ]


class BillingSettings(models.Model):
    organization = models.OneToOneField("tenancy.Organization", on_delete=models.CASCADE)
    tip_label = models.CharField(max_length=100, default="Propina voluntaria")
    send_email = models.BooleanField(default=False)
    default_kind = models.CharField(max_length=7, default="pos", choices=[("invoice", "Factura"), ("pos", "POS")])


class SalesDocument(models.Model):
    organization = models.ForeignKey("tenancy.Organization", on_delete=models.PROTECT)
    restaurant = models.ForeignKey("tenancy.Restaurant", on_delete=models.PROTECT)
    order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, related_name="documents")
    kind = models.CharField(max_length=11, choices=[(v, v) for v in ("invoice", "pos", "credit_note")])
    original = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT)
    resolution = models.ForeignKey(Resolution, on_delete=models.PROTECT, null=True, blank=True)
    number = models.CharField(max_length=50)
    buyer = models.ForeignKey("loyalty.Customer", on_delete=models.PROTECT)
    buyer_data = models.JSONField(default=dict)
    company_data = models.JSONField(default=dict)
    resolution_data = models.JSONField(default=dict)
    tip_label = models.CharField(max_length=100, default="Propina voluntaria")
    issued_at = models.DateTimeField()
    subtotal = money()
    tax_total = money()
    tip = money()
    total = money()
    taxes = models.JSONField(default=list)
    lines = models.JSONField(default=list)
    state = models.CharField(
        max_length=11, default="pending", choices=[(v, v) for v in ("pending", "issued", "rejected", "contingency")]
    )
    provider_id = models.CharField(max_length=120, blank=True, default="")
    cufe = models.CharField(max_length=96, blank=True, default="")
    qr = models.TextField(blank=True, default="")
    xml = models.FileField(upload_to="billing/xml/", blank=True)
    errors = models.JSONField(default=list)
    attempts = models.PositiveIntegerField(default=0)
    request_key = ExactCharField(max_length=80)
    created_by = models.ForeignKey("accounts.Account", on_delete=models.PROTECT)
    refund = models.OneToOneField(
        "sales.Refund", on_delete=models.PROTECT, null=True, blank=True, related_name="credit_note"
    )
    original_order = only_when(models.Q(kind__in=["invoice", "pos"]), "order_id", models.BigIntegerField())

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="document_org_number_unique"),
            models.UniqueConstraint(fields=["organization", "request_key"], name="document_org_key_unique"),
            models.UniqueConstraint(fields=["original_order"], name="document_one_original"),
            models.CheckConstraint(
                condition=models.Q(kind="credit_note", resolution__isnull=True, original__isnull=False)
                | models.Q(kind__in=["invoice", "pos"], resolution__isnull=False, original__isnull=True),
                name="document_resolution_kind",
            ),
        ]
