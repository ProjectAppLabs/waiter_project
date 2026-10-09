"""Franjas de reserva de un restaurante que cierra a medianoche (ronda r4)."""
from datetime import UTC, datetime

import pytest

from sales.tests.helpers import call
from tables.models import Table

pytestmark = pytest.mark.django_db


@pytest.fixture
def cena(setup, monkeypatch):
    """Restaurante con una mesa y reservas de 19:00 a 24:00 todos los días, visto el 2 de octubre a las 10:00."""
    monkeypatch.setattr("django.utils.timezone.now", lambda: datetime(2026, 10, 2, 15, tzinfo=UTC))
    from accounts.models import Session

    Session.objects.all().update(expires=datetime(2026, 10, 4, tzinfo=UTC))
    setup["table"] = Table.objects.create(floor=setup["r1"].floors.get(), number=1, seats=4)
    week = {str(day): [[19, 24]] for day in range(7)}
    data = {"weekly": week, "overrides": [], "rules": {"minNotice": 0, "maxDays": 0}}
    call(setup["client"], "put", f"reservations/schedule?restaurant_id={setup['r1'].pk}", data)
    return setup


def reserva(s, hora):
    """Reserva sin hora de salida, como la manda el asistente: el servidor le da la duración por omisión."""
    return {"restaurant_id": s["r1"].pk, "customer_name": "Ana Pérez", "people": 2, "date": "2026-10-02",
            "time_start": hora, "table_ids": [s["table"].pk]}


def test_con_cierre_a_medianoche_solo_se_ofrecen_franjas_reservables(cena):
    """Las franjas ofrecidas se pueden reservar y la línea de tiempo conserva el día completo."""
    # Falla si /slots ofrece las 23:00 o las 23:30 cuando el restaurante cierra a las 24:00 (con la duración por
    # omisión la reserva pasaría de medianoche y mesas y crear responden 400), o si por eso la línea de tiempo deja
    # de dibujar el horario completo hasta medianoche.
    base = f"restaurant_id={cena['r1'].pk}&date=2026-10-02"
    franjas = call(cena["client"], "get", f"reservations/slots?{base}")
    assert [f["label"] for f in franjas] == ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]
    mesas = call(cena["client"], "get", f"reservations/tables?{base}&time_start={franjas[-1]['time']}&people=2")
    assert [m["id"] for m in mesas] == [cena["table"].pk]
    creada = call(cena["client"], "post", "reservations", reserva(cena, franjas[-1]["time"]), 201)
    assert creada["time_label"] == "22:30 – 24:00"
    call(cena["client"], "post", "reservations", reserva(cena, 23), 400)
    dia = call(cena["client"], "get", f"reservations/timeline?{base}")
    assert [f["label"] for f in dia["slots"]][-2:] == ["23:00", "23:30"]
