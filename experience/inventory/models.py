"""Existencias, movimientos auditables y solicitudes por restaurante."""
from django.db import models

from catalog.models import choices, decimal
from tenancy.fields import ExactCharField, only_when


class Stock(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    ingredient = models.ForeignKey('catalog.Product', on_delete=models.PROTECT)
    qty = decimal()
    min = decimal(5)
    max = decimal(20)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'ingredient'], name='stock_restaurant_ingredient_unique'),
                       models.CheckConstraint(condition=models.Q(qty__gte=0), name='stock_nonnegative')]

    def save(self, *args, **kwargs):
        if self.max <= self.min:
            self.max = self.min + 15
        super().save(*args, **kwargs)


class StockMove(models.Model):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE)
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    ingredient = models.ForeignKey('catalog.Product', on_delete=models.PROTECT)
    kind = models.CharField(max_length=10, choices=choices('receipt', 'waste', 'count', 'sale', 'adjust'))
    qty = models.DecimalField(max_digits=18, decimal_places=6)
    reason = models.CharField(max_length=300)
    request_key = ExactCharField(max_length=80)
    account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Conserva la unidad del movimiento aunque luego se edite la unidad del ingrediente.
    unit = models.ForeignKey('catalog.Unit', on_delete=models.PROTECT, null=True, blank=True)
    requested_qty = decimal()
    stock_after = decimal()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'request_key'], name='stock_move_org_key_unique')]


class PurchaseRequest(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    supplier = models.ForeignKey('catalog.Supplier', on_delete=models.PROTECT)
    state = models.CharField(max_length=10, choices=choices('draft', 'sent', 'received', 'cancelled'), default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT)
    # Un solo borrador por proveedor y restaurante (ver tenancy.fields.only_when).
    draft_supplier = only_when(models.Q(state='draft'), 'supplier_id', models.BigIntegerField())

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'draft_supplier'], name='purchase_one_supplier_draft')]


class PurchaseRequestLine(models.Model):
    request = models.ForeignKey(PurchaseRequest, on_delete=models.CASCADE, related_name='lines')
    ingredient = models.ForeignKey('catalog.Product', on_delete=models.PROTECT)
    qty = decimal()
    unit = models.ForeignKey('catalog.Unit', on_delete=models.PROTECT)
    price_unit = decimal()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['request', 'ingredient'], name='purchase_request_ingredient_unique')]
