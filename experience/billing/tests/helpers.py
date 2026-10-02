from uuid import uuid4

from sales.tests.helpers import call, open_shift, order, pay, payment


def configured(s):
    call(
        s["client"],
        "patch",
        "company",
        {
            "legal_name": "Restaurante SAS",
            "tax_id": "900123456",
            "tax_id_dv": "8",
            "fiscal_regime": "inc",
            "address": "Calle 1",
            "city": "Bogotá",
        },
    )
    open_shift(s)
    return s


def paid(s, tip=0):
    o = order(s)
    if tip:
        o = call(s["client"], "put", f"orders/{o['id']}/tip", {"amount": tip})["order"]
    payment(s, o, received=o["total"] + 1000)
    return pay(s, o)


def emit(s, o, **kwargs):
    return call(s["client"], "post", f"billing/orders/{o['id']}/document", {"request_key": uuid4().hex, **kwargs}, 201)[
        "document"
    ]
