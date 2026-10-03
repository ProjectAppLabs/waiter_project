"""Solicitudes simultáneas sobre los mismos saldos y la numeración de notas crédito."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections

from accounts.models import Account
from billing.models import SalesDocument
from billing.tests.helpers import configured, emit
from sales.models import Order, Refund
from sales.refunds import create_refund
from tenancy.http import Problem

from .test_devoluciones import datos, venta

pytestmark = pytest.mark.django_db(transaction=True)


def simultaneas(s, solicitudes):
    barrier = Barrier(len(solicitudes))

    def ejecutar(solicitud):
        close_old_connections()
        try:
            person = Account.objects.select_related("organization").get(pk=s["person"].pk)
            barrier.wait(timeout=10)
            try:
                refund, _ = create_refund(person, *solicitud)
                return refund.pk
            except Problem as exc:
                return exc.body["error"]
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=len(solicitudes)) as pool:
        return list(pool.map(ejecutar, solicitudes))


def test_reintentos_simultaneos_crean_una_devolucion(setup):
    # Falla si dos solicitudes con la misma clave duplican el dinero o la nota crédito.
    s = configured(setup)
    o = venta(s, cantidad=1, propina=0)
    emit(s, o)
    data = datos(s, o)
    result = simultaneas(s, [(o["id"], data), (o["id"], data)])
    assert result[0] == result[1]
    assert Refund.objects.count() == SalesDocument.objects.filter(kind="credit_note").count() == 1
    assert Order.objects.get(pk=o["id"]).refunded == 10800


def test_claves_distintas_compiten_por_el_saldo(setup):
    # Falla si dos claves diferentes devuelven a la vez la misma cantidad disponible.
    s = configured(setup)
    o = venta(s, cantidad=1, propina=0)
    result = simultaneas(s, [(o["id"], datos(s, o)), (o["id"], datos(s, o))])
    assert result.count("not_refundable") == 1 and Refund.objects.count() == 1


def test_consecutivos_simultaneos_son_propios_de_la_organizacion(setup):
    # Falla si dos pedidos reciben el mismo número de nota crédito.
    s = configured(setup)
    orders = [venta(s, cantidad=1, propina=0) for _ in range(2)]
    for order in orders:
        emit(s, order)
    simultaneas(s, [(o["id"], datos(s, o)) for o in orders])
    assert set(SalesDocument.objects.filter(kind="credit_note").values_list("number", flat=True)) == {"NC-1", "NC-2"}
