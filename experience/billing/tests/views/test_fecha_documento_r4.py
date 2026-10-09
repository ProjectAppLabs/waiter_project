"""La fecha de un documento de venta es el día local de la organización, el mismo que firma el CUFE."""

import pytest
from freezegun import freeze_time

from billing.models import SalesDocument
from billing.providers.simulated import fiscal_fields
from billing.tests.helpers import configured, emit, paid
from sales.tests.helpers import call

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def ocho_de_la_noche_en_bogota():
    """Las 20:00 del 8 de octubre en Bogotá son la 01:00 UTC del 9: la venta y su documento ocurren ahí."""
    with freeze_time("2026-10-09T01:00:00Z"):
        yield


def test_documento_de_las_20_en_bogota_lleva_la_fecha_local_del_cufe(setup):
    """El detalle y la impresión fechan el documento el día de la venta, como el CUFE."""
    # Falla si el detalle o la impresión toman el día UTC (el 9) en vez del día local de la organización (el 8) con el
    # que el CUFE firma IssueDate, o si la impresión deja de mostrar la hora local de emisión.
    s = configured(setup)
    document = emit(s, paid(s))
    detail = call(s["client"], "get", f"documents/{document['id']}/detail")
    printed = s["client"].get(f"/api/pos/v1/documents/{document['id']}/pdf?org={s['org'].slug}").content.decode()
    issue_date = fiscal_fields(SalesDocument.objects.get(pk=document["id"]))[1]
    assert issue_date == detail["date"] == "2026-10-08"
    assert "Fecha: 2026-10-08T20:00:00-05:00" in printed
