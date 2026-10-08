"""El precio final del catálogo y los importes aceptados por ventas comparten contrato."""

from decimal import Decimal

import pytest

from catalog.models import Product, Tax
from sales.tests.helpers import call, line, open_shift, order

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "price,rates,extra,qty,final_price,expected",
    [
        (10000, [], 0, 1, 10000, (10000, 0, 10000)),
        (10000, [(19, False)], 0, 1, 11900, (10000, 1900, 11900)),
        (10800, [(8, True)], 0, 1, 10800, (10000, 800, 10800)),
        (12700, [(19, True), (8, True)], 0, 1, 12700, (10000, 2700, 12700)),
        (10800, [(19, False), (8, True)], 0, 1, 12852, (10000, 2852, 12852)),
        (10000, [(19, False)], 2000, 2, 11900, (23361.34, 4438.66, 27800)),
        (10000, [(19, False)], 0, 1.5, 11900, (15000, 2850, 17850)),
        (1.005, [], 0, 3, 1.005, (3.03, 0, 3.03)),
    ],
)
def test_final_catalog_price_and_accepted_line(setup, price, rates, extra, qty, final_price, expected):
    # Falla si catálogo añade dos veces un impuesto o ventas cambia el orden de redondeo de unidades, líneas y bases.
    s = setup
    product = Product.objects.create(organization=s["org"], name="Plato de contrato", kind="dish", price=Decimal(str(price)))
    product.categories.add(s["category"])
    for index, (amount, included) in enumerate(rates):
        product.taxes.add(Tax.objects.create(
            organization=s["org"], name=f"Tasa de contrato {index}", amount=amount, included=included,
        ))
    catalog = call(s["client"], "get", f"catalog?restaurant_id={s['r1'].pk}")
    dish = next(row for row in catalog["products"] if row["id"] == product.pk)
    assert dish["final_price"] == final_price
    open_shift(s)
    options = [{"group": "Tamaño", "name": "Grande", "price_extra": extra}] if extra else []
    result = order(s, lines=[line(s, product_id=product.pk, qty=qty, options=options)])
    assert (result["subtotal"], result["tax"], result["total"]) == expected
    assert result["lines"][0]["total"] == expected[2]
