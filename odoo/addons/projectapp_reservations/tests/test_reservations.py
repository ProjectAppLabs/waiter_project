"""Reservas del kit: solape, franjas, mesas disponibles, pre-pedido con correo, timeline y estados.

Corren con el runner de Odoo (`-u projectapp_reservations --test-enable --test-tags /projectapp_reservations`).
"""
import math
from datetime import date, timedelta
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestReservations(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.env["pos.config"].search([("module_pos_restaurant", "=", True)], limit=1)
        assert cls.config, "hace falta un pos.config de restaurante (demo)"
        cls.floor = cls.env["restaurant.floor"].create({"name": "Terraza de pruebas", "pos_config_ids": [(4, cls.config.id)]})
        Table = cls.env["restaurant.table"]
        cls.t2, cls.t4, cls.t8 = (Table.create({"floor_id": cls.floor.id, "table_number": number, "seats": seats})
                                  for number, seats in ((901, 2), (902, 4), (903, 8)))
        cls.session = cls.config.current_session_id or cls.env["pos.session"].create({"config_id": cls.config.id, "user_id": cls.env.uid})
        cls.product = cls.env["product.template"].create({"name": "Bowl de pruebas", "list_price": 25000, "available_in_pos": True})
        cls.day = date(2030, 10, 15)  # martes
        # Las pruebas corren sobre una copia de la base de desarrollo: el horario que alguien haya configurado ahí no
        # puede decidir si pasan. Sin horario rige el anterior, 10:00–22:00 todos los días.
        cls.config.reservation_schedule = False
        cls.Reservation = cls.env["waiter.reservation"]

    def _open_all_day(self):
        """Para las pruebas que reservan «dentro de unas horas» según el reloj: lo que miden no es el horario."""
        self.config.waiter_save_reservation_schedule({"weekly": {str(d): [[0.0, 24.0]] for d in range(7)}, "overrides": []})

    def _reserve(self, table, time_start, **vals):
        base = {"customer_name": "Bruno", "date": self.day, "time_start": time_start, "people": 2, "table_id": table.id}
        base.update(vals)
        return self.Reservation.create(base)

    def _lines(self, note="Sin cebolla"):
        return [{"product_id": self.product.product_variant_id.id, "qty": 2, "note": note}]

    def test_overlapping_reservations_on_the_same_table_are_rejected(self):
        """Falla si dos reservas activas comparten mesa y franja, si una cancelada sigue bloqueando o si la hora no es de 30 min."""
        first = self._reserve(self.t4, 12.0, prep_minutes="0")
        self.assertEqual((first.time_end, first.state, first.floor_id), (13.5, "confirmed", self.floor))
        with self.assertRaises(ValidationError):
            self._reserve(self.t4, 13.0, prep_minutes="0")
        with self.assertRaises(ValidationError):
            self._reserve(self.t4, 11.0, time_end=12.5, prep_minutes="0")
        self._reserve(self.t4, 13.5, prep_minutes="0")
        self._reserve(self.t2, 12.0, prep_minutes="0")
        first.action_cancel()
        self._reserve(self.t4, 12.0, prep_minutes="0")
        with self.assertRaises(ValidationError):
            self._reserve(self.t8, 12.25)

    def test_the_prep_margin_holds_the_table_before_the_hour_and_frees_the_rest_of_the_day(self):
        """El margen es para preparar la mesa, no porque el comensal esté ya ahí: una reserva de la noche
        no puede dejar la mesa muerta desde el almuerzo, y media hora antes sí la aparta."""
        night = self._reserve(self.t4, 20.0, prep_minutes="30")
        self.assertEqual((night.hold_start, night.time_end), (19.5, 21.5))
        # A mediodía la mesa se usa con normalidad.
        self.assertIn(self.t4.id, [t["id"] for t in self.Reservation.waiter_available_tables(self.config.id, self.day, 13.0, 3)])
        # Dentro del margen ya no: una reserva que acabe a las 19:45 pisa la preparación.
        with self.assertRaises(ValidationError):
            self._reserve(self.t4, 18.5, time_end=19.75, prep_minutes="0")
        # Sin margen, esa misma reserva cabe.
        night.write({"prep_minutes": "0"})
        self.assertEqual(night.hold_start, 20.0)
        self._reserve(self.t4, 18.5, time_end=19.75, prep_minutes="0")

    def test_the_floor_only_shows_the_reservation_that_holds_the_table_now(self):
        """Falla si el plano pinta "Reservada" por una reserva de dentro de seis horas."""
        table = self.env["restaurant.table"].create({"floor_id": self.floor.id, "table_number": 904, "seats": 4})
        today = fields.Date.context_today(self.Reservation)
        self._open_all_day()
        # Mediodía fijo: de noche «dentro de cuatro horas» pasaba de medianoche y la reserva no se podía crear.
        with patch.object(type(self.Reservation), "_waiter_now_hour", return_value=12.0):
            self._reserve(table, 16.0, date=today, prep_minutes="30")
            self.assertFalse(table.waiter_reserved_at(today)[table.id], "todavía no la aparta")

    def test_slots_follow_the_config_hours_and_available_tables_skip_clashes_and_small_tables(self):
        """Falla si las franjas no van de 10:00 a 21:30 cada 30 min, si el pos.config no las configura o si una mesa ocupada o pequeña se ofrece."""
        slots = self.Reservation.waiter_slots(self.config.id, self.day)
        self.assertEqual(len(slots), 24)
        self.assertEqual((slots[0], slots[-1]["label"]), ({"time": 10.0, "label": "10:00", "past": False, "closed": False, "soon": False}, "21:30"))
        self.config.write({"reservation_open": 12.0, "reservation_close": 14.0})
        self.assertEqual([s["label"] for s in self.Reservation.waiter_slots(self.config.id, self.day)], ["12:00", "12:30", "13:00", "13:30"])
        self._reserve(self.t4, 12.0, prep_minutes="0")
        free = [t["id"] for t in self.Reservation.waiter_available_tables(self.config.id, self.day, 13.0, 3, prep_minutes="0")]
        self.assertNotIn(self.t4.id, free)
        self.assertNotIn(self.t2.id, free)
        self.assertIn(self.t8.id, free)
        self.assertIn(self.t4.id, [t["id"] for t in self.Reservation.waiter_available_tables(self.config.id, self.day, 13.5, 3, prep_minutes="0")])
        by_id = {t["id"]: t for t in self.Reservation.waiter_available_tables(self.config.id, self.day, 13.0, 3, include_unavailable=True, prep_minutes="0")}
        self.assertEqual((by_id[self.t4.id]["status"], by_id[self.t4.id]["reserved_at"], by_id[self.t2.id]["status"]), ("reserved", "12:00", "unavailable"))

    def test_waiter_create_builds_the_dine_in_preorder_and_queues_the_confirmation_mail(self):
        """Falla si el código no es RVnnn, si el pre-pedido no es un borrador Dine In con las líneas, o si no sale el correo."""
        before = self.env["mail.mail"].search([])
        detail = self.Reservation.waiter_create({
            "customer_name": "Nadia Olivia", "customer_email": "nadia@example.com", "date": "2030-10-15", "time_start": 15.0,
            "people": 2, "baby_chair": True, "table_id": self.t4.id, "config_id": self.config.id,
        }, self._lines())
        reservation = self.Reservation.browse(detail["id"])
        self.assertRegex(reservation.name, r"^RV\d{3}$")
        self.assertEqual((detail["time_label"], detail["baby_chair"], len(detail["lines"])), ("15:00 – 16:30", True, 1))
        order = reservation.preorder_id
        self.assertEqual((order.state, order.preset_id.name, order.table_id, order.customer_count), ("draft", "Dine In", self.t4, 2))
        self.assertEqual((order.lines.qty, order.lines.customer_note), (2, "Sin cebolla"))
        self.assertGreater(order.amount_total, 0)
        self.assertEqual(detail["amount_total"], order.amount_total)
        mail = self.env["mail.mail"].search([]) - before
        self.assertEqual((len(mail), mail.email_to), (1, "nadia@example.com"))
        self.assertIn(reservation.name, mail.subject)
        self.assertIn("Sin cebolla", mail.body_html)
        self.assertNotIn(order, self.session.get_session_orders(), "un pre-pedido futuro no bloquea el cierre de la caja")

    def test_a_reservation_without_email_sends_nothing(self):
        before = self.env["mail.mail"].search([])
        self._reserve(self.t2, 20.0, customer_email=False)
        self.assertFalse(self.env["mail.mail"].search([]) - before)

    def test_timeline_and_reserved_at_show_the_next_reservation_per_table(self):
        """Falla si la grilla no trae mesas × reservas del piso pedido o si el plano no sabe la próxima reserva de la mesa."""
        first = self._reserve(self.t4, 12.0, customer_name="Eva", people=4)
        second = self._reserve(self.t4, 17.0)
        self._reserve(self.t8, 11.5)
        timeline = self.Reservation.waiter_timeline(self.config.id, self.day, self.floor.id)
        self.assertEqual([t["id"] for t in timeline["tables"]], [self.t2.id, self.t4.id, self.t8.id])
        rows = {t["id"]: t["reservations"] for t in timeline["tables"]}
        self.assertEqual(([r["name"] for r in rows[self.t4.id]], rows[self.t2.id]), ([first.name, second.name], []))
        self.assertEqual((rows[self.t4.id][0]["label"], rows[self.t4.id][0]["people"], len(timeline["slots"])), ("12:00", 4, 24))
        self.assertIn({"id": self.floor.id, "name": "Terraza de pruebas"}, timeline["floors"])
        reserved = (self.t2 | self.t4 | self.t8).waiter_reserved_at(self.day)
        self.assertEqual((reserved[self.t2.id], reserved[self.t4.id]["label"], reserved[self.t4.id]["customer_name"]), (False, "12:00", "Eva"))
        first.action_seated()
        self.assertEqual(self.t4.waiter_reserved_at(self.day)[self.t4.id]["name"], second.name)

    def test_state_actions_move_the_preorder_along(self):
        """Falla si sentar no deja el pre-pedido visible en la sesión, si cancelar no anula el borrador o si se repite una transición."""
        seated = self.Reservation.browse(self.Reservation.waiter_create(
            {"customer_name": "Huston", "date": self.day, "time_start": 12.5, "people": 2, "table_id": self.t8.id}, self._lines())["id"])
        seated.action_seated()
        self.assertEqual((seated.state, seated.preorder_id.preset_time), ("seated", False))
        self.assertIn(seated.preorder_id, self.session.get_session_orders())
        with self.assertRaises(UserError):
            seated.action_seated()
        absent = self._reserve(self.t2, 12.5)
        absent.action_no_show()
        self.assertEqual(absent.state, "no_show")
        with self.assertRaises(UserError):
            absent.action_cancel()
        cancelled = self.Reservation.browse(self.Reservation.waiter_create(
            {"customer_name": "Eva", "date": self.day, "time_start": 19.0, "people": 3, "table_id": self.t4.id}, self._lines())["id"])
        cancelled.action_cancel()
        self.assertEqual((cancelled.state, cancelled.preorder_id.state), ("cancelled", "cancel"))

    # Falla si una reserva sin platos deja de poder crearse, o si crea un pedido vacío en el POS.
    def test_a_reservation_without_dishes_has_no_preorder(self):
        detail = self.Reservation.waiter_create({"customer_name": "Ana", "date": self.day, "time_start": 12.0, "people": 2,
                                                 "table_id": self.t4.id, "config_id": self.config.id}, [])
        self.assertFalse(detail["preorder_id"])
        self.assertEqual(detail["lines"], [])
        self.assertEqual((detail["deposit_state"], detail["deposit_amount"]), ("none", 0.0))

    # Falla si quien crea la reserva puede fijar el estado del anticipo o su token, si dos reservas comparten enlace,
    # o si el enlace público expone correo, teléfono o notas del cliente.
    def test_the_deposit_starts_pending_with_a_secret_link_that_shows_only_what_is_needed(self):
        detail = self.Reservation.waiter_create({"customer_name": "Ana María Ruiz", "customer_email": "ana@example.com", "customer_phone": "3001234567",
                                                 "notes": "Aniversario", "date": self.day, "time_start": 13.0, "people": 3, "table_id": self.t4.id,
                                                 "deposit_amount": 50000, "deposit_state": "paid", "pay_token": "lo-elige-el-cliente-no-vale"}, [])
        other = self.Reservation.waiter_create({"customer_name": "Luis", "date": self.day, "time_start": 16.0, "people": 2, "table_id": self.t4.id}, [])
        self.assertEqual(detail["deposit_state"], "pending")
        self.assertGreaterEqual(len(detail["pay_token"]), 30)
        self.assertNotIn(detail["pay_token"], ("lo-elige-el-cliente-no-vale", other["pay_token"]))
        public = self.Reservation.waiter_deposit_public(detail["pay_token"])
        self.assertEqual(public, {"code": detail["name"], "customer": "Ana", "date": "2030-10-15", "time_label": "13:00", "people": 3,
                                  "table_number": 902, "table_numbers": [902], "state": "confirmed", "deposit_state": "pending", "amount_in_cents": 5000000})
        params = self.env["ir.config_parameter"].sudo()
        for key, value in (("projectapp.diner_url", "https://menu.example.com/"), ("projectapp.restaurant_slug", "burger-house"), ("projectapp.venue_slug", "poblado")):
            params.set_param(key, value)
        self.assertEqual(self.Reservation.browse(detail["id"]).waiter_detail()[0]["pay_url"], "https://menu.example.com/burger-house/poblado/reserva/%s" % detail["pay_token"])
        params.set_param("projectapp.diner_url", "")
        self.assertEqual(self.Reservation.browse(detail["id"]).waiter_detail()[0]["pay_url"], "")
        self.assertFalse(self.Reservation.waiter_deposit_public("x" * 32))
        self.assertFalse(self.Reservation.waiter_deposit_public(False))

    # Falla si un pago se concilia con otro monto, si un reintento con la misma referencia falla o duplica, si otra
    # referencia puede pisar un anticipo ya pagado, o si se puede cambiar el costo después de cobrado.
    def test_the_gateway_payment_is_idempotent_and_must_match_the_amount(self):
        detail = self.Reservation.waiter_create({"customer_name": "Ana", "date": self.day, "time_start": 18.0, "people": 2,
                                                 "table_id": self.t4.id, "deposit_amount": 30000}, [])
        token, reservation = detail["pay_token"], self.Reservation.browse(detail["id"])
        self.assertEqual(self.Reservation.waiter_deposit_paid(token, 2999900, "waiter-abc"), {"paid": False, "reason": "amount_changed"})
        self.assertEqual(reservation.deposit_state, "pending")
        self.assertEqual(self.Reservation.waiter_deposit_paid(token, 3000000, "waiter-abc"), {"paid": True, "reason": "paid"})
        self.assertEqual(self.Reservation.waiter_deposit_paid(token, 3000000, "waiter-abc"), {"paid": True, "reason": "already_paid"})
        self.assertEqual(self.Reservation.waiter_deposit_paid(token, 3000000, "waiter-otra"), {"paid": False, "reason": "already_paid"})
        self.assertEqual((reservation.deposit_state, reservation.deposit_reference), ("paid", "waiter-abc"))
        self.assertTrue(reservation.deposit_paid_at)
        with self.assertRaises(UserError):
            reservation.waiter_set_deposit(0)

    # Falla si no se puede quitar o cambiar el costo antes del pago, o registrar a mano un pago hecho por fuera.
    def test_the_cost_can_be_removed_changed_or_settled_by_hand_before_it_is_paid(self):
        reservation = self._reserve(self.t8, 20.0, deposit_amount=40000)
        self.assertEqual(reservation.waiter_set_deposit(0)["deposit_state"], "none")
        with self.assertRaises(UserError):
            reservation.waiter_mark_deposit_paid()
        self.assertEqual(reservation.waiter_set_deposit(25000)["deposit_amount"], 25000)
        paid = reservation.waiter_mark_deposit_paid("Efectivo en caja")
        self.assertEqual((paid["deposit_state"], paid["deposit_reference"]), ("paid", "Efectivo en caja"))
        with self.assertRaises(ValidationError):
            self._reserve(self.t2, 20.0, deposit_amount=-1)

    # ------------------------------------------------------------------ horario de reservas
    def _schedule(self, tuesday, overrides=()):
        weekly = {str(d): [[12.0, 15.0]] for d in range(7)}
        weekly["1"] = tuesday
        return self.config.waiter_save_reservation_schedule({"weekly": weekly, "overrides": list(overrides)})

    # Falla si las franjas dejan de salir del horario del día: un día partido debe ofrecer almuerzo y cena sin el hueco,
    # un día cerrado no ofrece nada, y sin horario configurado sigue rigiendo 10:00–22:00.
    def test_slots_follow_the_weekly_schedule_with_split_ranges_and_closed_days(self):
        legacy = self.Reservation.waiter_slots(self.config.id, self.day)
        self.assertEqual((legacy[0]["label"], legacy[-1]["label"], len(legacy)), ("10:00", "21:30", 24))
        self._schedule([[12.0, 14.0], [19.0, 20.5]])
        labels = [s["label"] for s in self.Reservation.waiter_slots(self.config.id, self.day)]
        self.assertEqual(labels, ["12:00", "12:30", "13:00", "13:30", "19:00", "19:30", "20:00"])
        self._schedule([])
        self.assertEqual(self.Reservation.waiter_slots(self.config.id, self.day), [])
        self.assertTrue(self.Reservation.waiter_slots(self.config.id, date(2030, 10, 16)), "el miércoles sigue abierto")

    # Falla si una fecha especial deja de mandar sobre su día de la semana, en los dos sentidos: cerrar un día que abre
    # y abrir con otro horario un día que cierra.
    def test_a_special_date_replaces_its_weekday(self):
        self._schedule([], overrides=[{"date": "2030-10-15", "ranges": [[18.0, 19.0]], "note": "Evento"},
                                      {"date": "2030-10-16", "ranges": [], "note": "Festivo"}])
        self.assertEqual([s["label"] for s in self.Reservation.waiter_slots(self.config.id, self.day)], ["18:00", "18:30"])
        self.assertEqual(self.Reservation.waiter_slots(self.config.id, date(2030, 10, 16)), [])
        self.assertTrue(self.Reservation.waiter_slots(self.config.id, date(2030, 10, 22)) == [], "el martes siguiente vuelve a su cierre semanal")

    # Falla si se puede reservar fuera del horario o en un día cerrado, o si acortar el horario rompe las reservas que ya
    # existían (deben poder seguir cambiando de estado).
    def test_reservations_must_start_inside_opening_hours_but_existing_ones_survive_a_change(self):
        self._schedule([[12.0, 15.0]])
        kept = self._reserve(self.t4, 14.0)
        with self.assertRaisesRegex(ValidationError, "12:00–15:00"):
            self._reserve(self.t2, 19.0)
        with self.assertRaisesRegex(ValidationError, "12:00–15:00"):
            self._reserve(self.t2, 15.0)  # el cierre no es una franja: la última empieza media hora antes
        self._schedule([])
        with self.assertRaisesRegex(ValidationError, "no se reciben reservas"):
            self._reserve(self.t2, 13.0)
        kept.write({"state": "seated"})
        self.assertEqual(kept.state, "seated")

    # Falla si la línea de tiempo pierde columnas: `cardPlacement` del POS ubica cada tarjeta por su distancia a la primera
    # franja, así que el hueco entre almuerzo y cena debe venir (marcado cerrado) y una reserva fuera del horario nuevo
    # debe ensanchar el tramo en vez de desaparecer.
    def test_the_timeline_stays_contiguous_and_keeps_reservations_outside_new_hours_visible(self):
        self._schedule([[12.0, 22.0]])
        self._reserve(self.t4, 20.0)
        self._schedule([[12.0, 13.0], [14.0, 15.0]])
        slots = self.Reservation.waiter_timeline(self.config.id, self.day, self.floor.id)["slots"]
        times = [s["time"] for s in slots]
        self.assertEqual(times, [12.0 + i * 0.5 for i in range(len(times))])
        self.assertEqual((times[0], times[-1]), (12.0, 21.0))  # la reserva de 20:00 dura hasta las 21:30
        closed = {s["label"] for s in slots if s["closed"]}
        self.assertIn("13:00", closed)
        self.assertNotIn("14:30", closed)
        self.assertIn("20:00", closed)

    # Falla si el servidor acepta un horario imposible: el editor valida, pero un cliente viejo o un write directo no.
    def test_impossible_schedules_are_rejected(self):
        for tuesday in ([[15.0, 12.0]], [[12.0, 15.0], [14.0, 18.0]], [[12.25, 15.0]], [[0.0, 25.0]], [[12.0, 13.0]] * 5):
            with self.assertRaises(ValidationError, msg=str(tuesday)):
                self._schedule(tuesday)
        with self.assertRaises(ValidationError):
            self._schedule([], overrides=[{"date": "2030-13-40", "ranges": []}])
        with self.assertRaises(ValidationError):
            self._schedule([], overrides=[{"date": "2030-10-15", "ranges": []}, {"date": "2030-10-15", "ranges": []}])
        with self.assertRaises(ValidationError):
            self.config.write({"reservation_schedule": {"weekly": {"0": []}}})


    # ------------------------------------------------------------------ varias mesas
    # Falla si una reserva de varias mesas deja libre alguna de ellas (otra reserva podría tomarla), si la principal
    # queda fuera de `table_ids`, o si una reserva de una sola mesa —como las de siempre— deja de apartar la suya.
    def test_a_reservation_can_hold_several_tables_and_each_one_is_taken(self):
        single = self._reserve(self.t8, 12.0)
        self.assertEqual(single.table_ids, self.t8)
        group = self.Reservation.waiter_create({"customer_name": "Grupo", "date": self.day, "time_start": 19.0, "people": 6,
                                                "table_ids": [self.t4.id, self.t2.id]}, [])
        record = self.Reservation.browse(group["id"])
        self.assertEqual((record.table_id, record.table_ids), (self.t4, self.t4 | self.t2))
        self.assertEqual((group["table_numbers"], group["seats"], [t["id"] for t in group["tables"]]), ([902, 901], 6, [self.t4.id, self.t2.id]))
        # El savepoint deshace el registro rechazado: la restricción salta después del INSERT y sin él seguiría ahí.
        with self.assertRaisesRegex(ValidationError, "901"), self.cr.savepoint():
            self._reserve(self.t2, 19.5)
        status = {t["id"]: t["status"] for t in self.Reservation.waiter_available_tables(self.config.id, self.day, 19.0, 2, include_unavailable=True)
                  if t["id"] in (self.t2.id, self.t4.id, self.t8.id)}
        self.assertEqual(status, {self.t2.id: "reserved", self.t4.id: "reserved", self.t8.id: "available"})
        rows = {t["id"]: [c["name"] for c in t["reservations"]] for t in self.Reservation.waiter_timeline(self.config.id, self.day, self.floor.id)["tables"]}
        self.assertEqual((rows[self.t2.id], rows[self.t4.id]), ([record.name], [record.name]))
        self.assertEqual(self.Reservation.waiter_deposit_public(record.pay_token)["table_numbers"], [902, 901])

    # Falla si cambiar las mesas de una reserva deja la principal fuera de la lista, si mover solo la principal suelta
    # las otras mesas, o si se puede dejar una reserva sin mesas.
    def test_changing_tables_keeps_the_main_table_inside_the_list(self):
        record = self._reserve(self.t4, 19.0, table_ids=[self.t4.id, self.t2.id])
        record.write({"table_id": self.t8.id})
        self.assertEqual((record.table_id, record.table_ids), (self.t8, self.t8 | self.t2))
        record.write({"table_ids": [self.t4.id]})
        self.assertEqual((record.table_id, record.table_ids), (self.t4, self.t4))
        with self.assertRaises(ValidationError):
            record.write({"table_ids": []})

    # Falla si el plano deja de pintar «Reservada» en las mesas secundarias de una reserva que ya aparta sus mesas.
    def test_every_table_of_a_group_shows_as_reserved_on_the_floor(self):
        self._open_all_day()
        today = fields.Date.context_today(self.Reservation)
        now = self.Reservation._waiter_now_hour()
        start = math.floor(now * 2) / 2
        if start + 1.5 > 24:
            self.skipTest("a esta hora la reserva de prueba no cabe en el día")
        record = self._reserve(self.t4, start, date=today, prep_minutes="0", table_ids=[self.t4.id, self.t2.id])
        reserved = (self.t2 | self.t4 | self.t8).waiter_reserved_at(today)
        self.assertEqual((reserved[self.t2.id]["name"], reserved[self.t4.id]["name"], reserved[self.t8.id]), (record.name, record.name, False))

    # ------------------------------------------------------------------ antelación
    def _rules(self, min_notice=0, max_days=0):
        schedule = {"weekly": {str(d): [[0.0, 24.0]] for d in range(7)}, "overrides": [], "rules": {"minNotice": min_notice, "maxDays": max_days}}
        return self.config.waiter_save_reservation_schedule(schedule)

    # Falla si se puede reservar con menos antelación de la mínima o más allá de la ventana, si las franjas no avisan
    # (`soon`) de las horas que ya no se pueden tomar —incluso al día siguiente cuando la antelación cruza la
    # medianoche—, o si cambiar mesa o estado de una reserva cercana se rechaza como si fuera reservar de nuevo.
    def test_booking_rules_limit_how_soon_and_how_far_ahead_you_can_reserve(self):
        today = fields.Date.context_today(self.Reservation)
        tomorrow, far = today + timedelta(days=1), today + timedelta(days=40)
        self._open_all_day()
        near = self._reserve(self.t8, 0.0, date=tomorrow)  # creada sin reglas: sigue siendo válida después
        self._rules(min_notice=24 * 60, max_days=30)
        with self.assertRaisesRegex(ValidationError, "1 día de antelación"), self.cr.savepoint():
            self._reserve(self.t4, 0.0, date=tomorrow)
        with self.assertRaisesRegex(ValidationError, "30 días"), self.cr.savepoint():
            self._reserve(self.t4, 12.0, date=far)
        self._reserve(self.t4, 12.0, date=today + timedelta(days=3))

        slots = self.Reservation.waiter_slots(self.config.id, tomorrow)
        self.assertTrue(slots[0]["soon"], "00:00 de mañana está a menos de 24 h")
        self.assertFalse(slots[-1]["soon"], "23:30 de mañana está a más de 24 h")
        self.assertTrue(all(s["past"] or s["soon"] for s in self.Reservation.waiter_slots(self.config.id, today)))
        self.assertEqual(self.Reservation.waiter_slots(self.config.id, far), [])

        near.write({"table_id": self.t2.id})
        near.write({"state": "cancelled"})
        with self.assertRaises(ValidationError):
            self._reserve(self.t2, 0.5, date=tomorrow).write({"time_start": 1.0})

    # Falla si el servidor acepta reglas imposibles o si un horario guardado antes de existir las reglas deja de leerse.
    def test_rules_are_validated_and_old_schedules_read_as_no_rules(self):
        for bad in ({"minNotice": -30, "maxDays": 0}, {"minNotice": 45, "maxDays": 0}, {"minNotice": 0, "maxDays": 9999}, {"minNotice": True, "maxDays": 0}, {"otra": 1}):
            with self.assertRaises(ValidationError, msg=str(bad)):
                self.config.waiter_save_reservation_schedule({"weekly": {str(d): [] for d in range(7)}, "overrides": [], "rules": bad})
        self.config.write({"reservation_schedule": {"weekly": {str(d): [[12.0, 15.0]] for d in range(7)}, "overrides": []}})
        self.assertEqual(self.config.waiter_reservation_schedule()["rules"], {"minNotice": 0, "maxDays": 0})

    # Falla si no se pueden cambiar las mesas de una reserva confirmada, si al editar sus propias mesas le salen
    # «reservadas» (no podría conservarlas), si el pre-pedido no sigue a la mesa principal nueva, si se le puede dar una
    # mesa que otra reserva tiene a esa hora, o si un horario acortado después impide el cambio.
    def test_the_tables_of_a_confirmed_reservation_can_be_changed(self):
        detail = self.Reservation.waiter_create({"customer_name": "Grupo", "date": self.day, "time_start": 19.0, "people": 6,
                                                "table_ids": [self.t4.id, self.t2.id]}, self._lines())
        record = self.Reservation.browse(detail["id"])
        other = self._reserve(self.t8, 19.5)

        def status(**kw):
            return {t["id"]: t["status"] for t in self.Reservation.waiter_available_tables(self.config.id, self.day, 19.0, 2, include_unavailable=True, **kw)
                    if t["id"] in (self.t2.id, self.t4.id, self.t8.id)}
        self.assertEqual(status(), {self.t2.id: "reserved", self.t4.id: "reserved", self.t8.id: "reserved"})
        self.assertEqual(status(exclude_id=record.id), {self.t2.id: "available", self.t4.id: "available", self.t8.id: "reserved"})

        self.config.waiter_save_reservation_schedule({"weekly": {str(d): [[12.0, 15.0]] for d in range(7)}, "overrides": []})  # las 19:00 ya no son horario
        changed = record.waiter_set_tables([self.t2.id])
        self.assertEqual((record.table_id, record.table_ids, changed["table_numbers"]), (self.t2, self.t2, [901]))
        self.assertEqual(record.preorder_id.table_id, self.t2)
        with self.assertRaisesRegex(ValidationError, other.name), self.cr.savepoint():
            record.waiter_set_tables([self.t2.id, self.t8.id])
        with self.assertRaises(UserError):
            record.waiter_set_tables([])
        record.state = "seated"
        with self.assertRaises(UserError):
            record.waiter_set_tables([self.t4.id])

    # ------------------------------------------------------------------ hallazgos de la revisión con Codex
    # Falla si un comando LINK del ORM (el de los formularios de Odoo) reemplaza las mesas en vez de sumar una: una
    # reserva de grupo soltaría en silencio sus otras mesas.
    def test_linking_a_table_adds_it_instead_of_replacing_the_group(self):
        record = self._reserve(self.t4, 19.0, table_ids=[self.t4.id, self.t2.id])
        record.write({"table_ids": [Command.link(self.t8.id)]})
        self.assertEqual((record.table_id, record.table_ids), (self.t4, self.t4 | self.t2 | self.t8))

    # Falla si un horario escrito directamente sin «overrides» (válido para la validación) rompe después las franjas
    # con un KeyError: se leía tal cual se guardó, sin normalizar.
    def test_a_schedule_written_without_special_dates_still_gives_slots(self):
        self.config.write({"reservation_schedule": {"weekly": {str(d): [[12.0, 14.0]] for d in range(7)}}})
        self.assertEqual([s["label"] for s in self.Reservation.waiter_slots(self.config.id, self.day)], ["12:00", "12:30", "13:00", "13:30"])
        self.assertEqual(self.config.waiter_reservation_schedule()["overrides"], [])

    # Falla si un horario heredado que abre a medianoche (reservation_open = 0, válido) se lee como las 10:00: con
    # cierre a las 8 quedaba la franja imposible 10–8 y toda reserva se rechazaba.
    def test_a_legacy_schedule_opening_at_midnight_is_kept(self):
        self.config.write({"reservation_schedule": False, "reservation_open": 0.0, "reservation_close": 8.0})
        self.assertEqual(self.config.waiter_reservation_schedule()["weekly"]["1"], [[0.0, 8.0]])
        self.assertEqual(self._reserve(self.t4, 1.0).time_start, 1.0)

    # Hallazgo de Codex al revisar los arreglos: al soportar UNLINK se podía quitar la mesa principal y el pre-pedido se
    # quedaba en ella. El hueco era más amplio: cualquier cambio de la principal por write() lo dejaba atrás (la
    # sincronización vivía solo en waiter_set_tables). Falla si el pre-pedido en borrador no sigue a la mesa principal.
    def test_the_draft_preorder_follows_the_main_table_whatever_changes_it(self):
        detail = self.Reservation.waiter_create({"customer_name": "Grupo", "date": self.day, "time_start": 19.0, "people": 6,
                                                "table_ids": [self.t4.id, self.t2.id]}, self._lines())
        record = self.Reservation.browse(detail["id"])
        self.assertEqual(record.preorder_id.table_id, self.t4)
        record.write({"table_ids": [Command.unlink(self.t4.id)]})
        self.assertEqual((record.table_id, record.table_ids, record.preorder_id.table_id), (self.t2, self.t2, self.t2))
        record.write({"table_id": self.t8.id})
        self.assertEqual((record.table_id, record.preorder_id.table_id), (self.t8, self.t8))

