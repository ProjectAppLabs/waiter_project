from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from django.db import close_old_connections

from accounts.models import Account
from billing.models import Resolution, SalesDocument
from billing.services import emit
from billing.tests.helpers import configured, paid
from tenancy.http import Problem

pytestmark = pytest.mark.django_db(transaction=True)


def concurrent(s, ids):
    barrier = Barrier(len(ids))

    def work(pk):
        close_old_connections()
        try:
            person = Account.objects.select_related("organization").get(pk=s["person"].pk)
            barrier.wait(timeout=10)
            try:
                doc, created = emit(person, pk, {"request_key": uuid4().hex})
                return doc.pk, doc.number, created
            except Problem as exc:
                return exc.body["error"]
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=len(ids)) as pool:
        return list(pool.map(work, ids))


def test_concurrent_consecutive_numbers(setup):
    # Falla si dos emisiones simultáneas consumen el mismo número o dejan huecos.
    s = configured(setup)
    ids = [paid(s)["id"] for _ in range(3)]
    result = concurrent(s, ids)
    assert {row[1] for row in result} == {"SETP-990000000", "SETP-990000001", "SETP-990000002"}
    assert SalesDocument.objects.count() == 3
    assert Resolution.objects.get(organization=s["org"]).next_number == 990000003


def test_concurrent_same_order(setup):
    # Falla si dos solicitudes simultáneas crean documentos distintos para el mismo pedido.
    s = configured(setup)
    pk = paid(s)["id"]
    result = concurrent(s, [pk, pk])
    assert result[0][:2] == result[1][:2]
    assert sorted(row[2] for row in result) == [False, True]
    assert Resolution.objects.get(organization=s["org"]).next_number == 990000001


def test_concurrent_last_available_number(setup):
    # Falla si dos pedidos obtienen el último número de una resolución o se supera su rango.
    s = configured(setup)
    ids = [paid(s)["id"] for _ in range(2)]
    Resolution.objects.filter(organization=s["org"]).update(number_to=990000000)
    result = concurrent(s, ids)
    assert result.count("not_ready") == 1
    assert SalesDocument.objects.count() == 1
    assert Resolution.objects.get(organization=s["org"]).next_number == 990000001
