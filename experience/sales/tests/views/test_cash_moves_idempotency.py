"""Reintentos idempotentes y aislados de entradas y salidas de caja."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections, connection
from rest_framework.test import APIClient

from realtime.models import SalesEvent
from sales.models import CashMove
from sales.tests.helpers import BASE, call, open_shift
from tenancy.tests.helpers import account, organization, pos_client

pytestmark = pytest.mark.django_db


def move_payload(**changes):
    """Construye la carga válida de una entrada de caja."""
    return {"kind": "in", "amount": 5000, "reason": "Cambio", **changes}


def post_move(client, shift_id, **changes):
    """Envía un movimiento de caja con los valores de prueba compartidos."""
    return client.post(BASE + f"shifts/{shift_id}/moves", move_payload(**changes), format="json")


def copied_session_client(source, org):
    """Crea un cliente aislado que conserva la misma sesión autenticada."""
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug)
    client.cookies["waiter_sid"] = source.cookies["waiter_sid"].value
    return client


def anonymous_client(s):
    """Crea un cliente sin cookie para la organización del escenario."""
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=s["org"].slug)
    return client


def client_without_sales(s):
    """Crea la sesión de un mesero asignado sin permiso de ventas."""
    return pos_client(account(s["org"], "waiter", "sin.ventas", restaurants=[s["r1"]]))


def client_other_organization(s):
    """Crea la sesión de una persona que pertenece a otra organización."""
    other = organization("otra-organizacion")
    return pos_client(account(other, username="ajeno"))


def client_other_restaurant(s):
    """Crea la sesión de una administradora sin acceso a la sede del turno."""
    return pos_client(account(s["org"], "admin", "otra.sede", restaurants=[s["r2"]]))


def simultaneous_posts(source, org, shift_id, payloads):
    """Ejecuta POST concurrentes desde conexiones y clientes independientes."""
    barrier = Barrier(len(payloads))

    def post(payload):
        """Espera a la otra conexión y remite una carga exactamente una vez."""
        client = copied_session_client(source, org)
        close_old_connections()
        try:
            barrier.wait()
            response = client.post(BASE + f"shifts/{shift_id}/moves", payload, format="json")
            return response.status_code, response.data
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=len(payloads)) as pool:
        return list(pool.map(post, payloads))


def test_replay_de_movimiento_retorna_el_mismo_resultado(setup):
    """El reintento de una carga confirmada devuelve el movimiento original."""
    # Falla si un reintento tras perder la respuesta duplica el efectivo o el evento de caja.
    s = setup
    shift = open_shift(s)
    key = "cash-move-replay-0001"
    events_before = SalesEvent.objects.filter(kind="cash").count()

    first = post_move(s["client"], shift["id"], request_key=key)
    replay = post_move(s["client"], shift["id"], request_key=key)

    assert first.status_code == replay.status_code == 200
    assert first.data["move"]["id"] == replay.data["move"]["id"]
    assert first.data["expected_cash"] == replay.data["expected_cash"] == 6000
    assert CashMove.objects.filter(request_key=key).count() == 1
    assert call(s["client"], "get", f"shifts/{shift['id']}/closing")["expected_cash"] == 6000
    assert SalesEvent.objects.filter(kind="cash").count() == events_before + 1


@pytest.mark.parametrize(
    "changes",
    [
        {"kind": "out"},
        {"amount": 6000},
        {"reason": "Compra"},
    ],
    ids=["tipo", "importe", "motivo"],
)
def test_replay_con_carga_distinta_es_un_conflicto_sin_efectos(setup, changes):
    """Una misma clave rechaza el cambio independiente de cada dato protegido."""
    # Falla si una clave de caja se acepta para otro tipo, importe o motivo y altera el efectivo.
    s = setup
    shift = open_shift(s)
    key = "cash-move-conflict-0001"
    created = post_move(s["client"], shift["id"], request_key=key)
    move = CashMove.objects.get(request_key=key)
    events_before = SalesEvent.objects.filter(kind="cash").count()

    conflict = post_move(s["client"], shift["id"], request_key=key, **changes)

    assert created.status_code == 200
    assert conflict.status_code == 409
    assert conflict.data["error"] == "request_key_conflict"
    assert CashMove.objects.filter(request_key=key).count() == 1
    assert CashMove.objects.get(request_key=key).account_id == move.account_id
    assert call(s["client"], "get", f"shifts/{shift['id']}/closing")["expected_cash"] == 6000
    assert SalesEvent.objects.filter(kind="cash").count() == events_before


def test_replay_igual_sobre_turno_cerrado_retorna_el_movimiento_original(setup):
    """La consulta de replay antecede al bloqueo de una caja ya cerrada."""
    # Falla si cerrar la caja impide recuperar un movimiento que el servidor ya había confirmado.
    s = setup
    shift = open_shift(s)
    key = "cash-move-closed-replay-0001"
    first = post_move(s["client"], shift["id"], request_key=key)
    call(s["client"], "post", f"shifts/{shift['id']}/close", {"counted_cash": 6000, "notes": ""})
    events_after_close = SalesEvent.objects.filter(kind="cash").count()

    replay = post_move(s["client"], shift["id"], request_key=key)
    new_key = post_move(s["client"], shift["id"], request_key="cash-move-closed-new-0001")

    assert first.status_code == replay.status_code == 200
    assert replay.data["move"]["id"] == first.data["move"]["id"]
    assert replay.data["expected_cash"] == 6000
    assert new_key.status_code == 409
    assert new_key.data["error"] == "shift_closed"
    assert CashMove.objects.filter(shift_id=shift["id"]).count() == 1
    assert SalesEvent.objects.filter(kind="cash").count() == events_after_close


def test_movimientos_sin_clave_conservan_el_historial_legacy(setup):
    """Las dos operaciones heredadas sin clave permanecen como filas independientes."""
    # Falla si los movimientos históricos sin clave dejan de poder registrarse como filas independientes.
    s = setup
    shift = open_shift(s)

    first = post_move(s["client"], shift["id"])
    second = post_move(s["client"], shift["id"])

    assert first.status_code == second.status_code == 200
    assert first.data["move"]["id"] != second.data["move"]["id"]
    assert CashMove.objects.filter(shift_id=shift["id"], request_key__isnull=True).count() == 2


@pytest.mark.skipif(connection.vendor != "mysql", reason="La colación de MySQL requiere ejecutar esta prueba con MySQL.")
def test_claves_de_caja_difieren_por_mayusculas_en_mysql(setup):
    """La colación binaria de MySQL distingue dos claves que cambian de caso."""
    # Falla si MySQL compara sin distinguir mayúsculas las claves de idempotencia de caja.
    s = setup
    shift = open_shift(s)
    upper = "Clave-Exacta-0001"
    lower = "clave-exacta-0001"

    first = post_move(s["client"], shift["id"], request_key=upper)
    second = post_move(s["client"], shift["id"], request_key=lower)
    replay = post_move(s["client"], shift["id"], request_key=upper)

    assert connection.vendor == "mysql"
    assert first.status_code == second.status_code == replay.status_code == 200
    assert first.data["move"]["id"] != second.data["move"]["id"]
    assert replay.data["move"]["id"] == first.data["move"]["id"]
    assert CashMove.objects.filter(shift_id=shift["id"], request_key__in=[upper, lower]).count() == 2


@pytest.mark.parametrize(
    ("client_factory", "status"),
    [
        (anonymous_client, 401),
        (client_without_sales, 403),
        (client_other_organization, 404),
        (client_other_restaurant, 404),
    ],
)
def test_replay_no_omite_autenticacion_permisos_ni_aislamiento(setup, client_factory, status):
    """El resultado previo no evita la autenticación ni el alcance de cada solicitante."""
    # Falla si el caché de una clave devuelve un movimiento ajeno sin comprobar cada control de acceso.
    s = setup
    shift = open_shift(s)
    key = "cash-move-access-replay-0001"
    created = post_move(s["client"], shift["id"], request_key=key)
    move = CashMove.objects.get(request_key=key)
    events_before = SalesEvent.objects.filter(kind="cash").count()
    client = client_factory(s)

    replay = post_move(client, shift["id"], request_key=key)

    assert created.status_code == 200
    assert replay.status_code == status
    assert "move" not in replay.data
    assert CashMove.objects.filter(request_key=key).count() == 1
    assert CashMove.objects.get(request_key=key).account_id == move.account_id
    assert call(s["client"], "get", f"shifts/{shift['id']}/closing")["expected_cash"] == 6000
    assert SalesEvent.objects.filter(kind="cash").count() == events_before


@pytest.mark.skipif(not connection.features.has_select_for_update, reason="La concurrencia de caja requiere bloqueos de filas del motor de producción.")
@pytest.mark.django_db(transaction=True)
def test_reintentos_simultaneos_comparten_un_solo_movimiento(setup):
    """Dos clientes con la misma clave compiten por un único resultado confirmado."""
    # Falla si dos conexiones MySQL con la misma clave crean dos movimientos o dos eventos de caja.
    s = setup
    shift = open_shift(s)
    events_before = SalesEvent.objects.filter(kind="cash").count()
    payload = move_payload(request_key="cash-move-concurrent-0001")

    responses = simultaneous_posts(s["client"], s["org"], shift["id"], [payload, payload])

    assert [response[0] for response in responses] == [200, 200]
    assert responses[0][1]["move"]["id"] == responses[1][1]["move"]["id"]
    assert CashMove.objects.filter(shift_id=shift["id"]).count() == 1
    assert call(s["client"], "get", f"shifts/{shift['id']}/closing")["expected_cash"] == 6000
    assert SalesEvent.objects.filter(kind="cash").count() == events_before + 1


@pytest.mark.skipif(not connection.features.has_select_for_update, reason="La concurrencia de caja requiere bloqueos de filas del motor de producción.")
@pytest.mark.django_db(transaction=True)
def test_reintentos_simultaneos_con_importes_distintos_dejan_un_conflicto(setup):
    """Dos importes con una clave compartida dejan un ganador observable y un conflicto."""
    # Falla si dos conexiones MySQL aceptan importes distintos para la misma clave de movimiento.
    s = setup
    shift = open_shift(s)
    key = "cash-move-concurrent-conflict-0001"
    events_before = SalesEvent.objects.filter(kind="cash").count()
    payloads = [move_payload(request_key=key), move_payload(request_key=key, amount=6000)]

    responses = simultaneous_posts(s["client"], s["org"], shift["id"], payloads)
    winner = next(response[1] for response in responses if response[0] == 200)
    expected_cash = call(s["client"], "get", f"shifts/{shift['id']}/closing")["expected_cash"]

    assert sorted(response[0] for response in responses) == [200, 409]
    assert next(response[1] for response in responses if response[0] == 409)["error"] == "request_key_conflict"
    assert winner["move"]["amount"] in (5000, 6000)
    assert expected_cash == {5000: 6000, 6000: 7000}[winner["move"]["amount"]]
    assert CashMove.objects.filter(shift_id=shift["id"]).count() == 1
    assert CashMove.objects.get(shift_id=shift["id"]).amount == winner["move"]["amount"]
    assert SalesEvent.objects.filter(kind="cash").count() == events_before + 1
