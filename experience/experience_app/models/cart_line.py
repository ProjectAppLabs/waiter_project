from decimal import Decimal

from django.db import models


class CartLine(models.Model):
    """Línea del carrito compartido de la mesa, atribuida a un comensal.

    "Pagar lo mío" es un filtro por comensal; "dividir" es una división del total;
    "carrito compartido" es la vista sin filtrar. Todo sale de la misma tabla.
    """

    OPEN, CONFIRMED = 'open', 'confirmed'

    account = models.ForeignKey('experience_app.DinerAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='purchased_lines')
    session = models.ForeignKey('experience_app.TableSession', on_delete=models.CASCADE, related_name='lines')
    diner = models.ForeignKey('experience_app.Diner', on_delete=models.CASCADE, related_name='lines')
    product_id = models.PositiveIntegerField()
    name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)  # precio de lista: es el que se envía al sistema propio
    final_unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)  # con impuestos: el que se muestra
    qty = models.PositiveIntegerField(default=1)
    takeaway = models.BooleanField(default=False)
    note = models.CharField(max_length=200, blank=True)
    checkout_note = models.CharField(max_length=500, blank=True)
    allergens = models.CharField(max_length=500, blank=True)
    tax_ids = models.JSONField(default=list)
    # Descuento de primera compra (Plan H) en %, fijado al confirmar: se aplica en ventas y se
    # conserva para que un reenvío del pedido (mismo uuid) no lo pierda.
    discount = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    coupon_code = models.CharField(max_length=32, blank=True)
    loyalty_card_id = models.PositiveIntegerField(null=True, blank=True)
    benefits_reserved = models.BooleanField(default=False)
    status = models.CharField(max_length=10, default=OPEN)
    order = models.ForeignKey('experience_app.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='lines')
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def shown_unit_price(self):
        return self.final_unit_price if self.final_unit_price is not None else self.unit_price

    @property
    def subtotal(self):
        """Lo que el comensal paga por la línea (impuestos incluidos), no la base gravable. Antes del descuento."""
        return self.shown_unit_price * self.qty

    @property
    def discount_amount(self):
        """Lo que resta el descuento sobre la línea: el sistema propio lo aplica al precio base, así que sobre el final es la misma proporción."""
        return (self.subtotal * self.discount / 100).quantize(Decimal('0.01')) if self.discount else Decimal(0)

    @property
    def net_subtotal(self):
        return self.subtotal - self.discount_amount
