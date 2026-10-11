"""Plan D · Cobro del domicilio: envío por modo, gratis desde un valor y recargo en los platos."""
from decimal import ROUND_HALF_UP, Decimal

PESO = Decimal(1)


def marked(amount, percent):
    """El valor con el recargo de domicilio, redondeado al peso (el mismo cálculo del carrito y del pedido)."""
    amount, percent = Decimal(str(amount)), Decimal(str(percent or 0))
    if not percent:
        return amount
    return (amount * (1 + percent / 100)).quantize(PESO, rounding=ROUND_HALF_UP)


def base_fee(row, km):
    """El envío antes de «gratis desde»: por tramos de distancia, fijo o gratis. None si ningún tramo cubre la distancia."""
    if row.fee_mode == 'free':
        return Decimal(0)
    if row.fee_mode == 'flat':
        return row.flat_fee
    return next((Decimal(str(t['fee'])) for t in row.tiers if km <= Decimal(str(t['up_to_km']))), None)


def fee_for(quote, food):
    """El envío que se cobra para un valor de platos (ya con recargo): cero si alcanza el «gratis desde»."""
    free_from = Decimal(str(quote.get('gratis_desde') or 0))
    fee = Decimal(str(quote['envio']))
    return Decimal(0) if free_from and Decimal(str(food)) >= free_from else fee
