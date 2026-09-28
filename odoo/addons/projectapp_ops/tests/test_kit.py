"""Plan I en el addon: prefijo y número del pedido, mover mesa, PIN con bloqueo, turno, notificaciones y siembra.

Corren con el runner de Odoo (`-u projectapp_ops --test-enable --test-tags /projectapp_ops`), nunca contra el
Odoo compartido.
"""
import json
from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged
from odoo.tests.common import new_test_user
from odoo.addons.projectapp_ops.tests.common_waiter import single_restaurant


class KitCase(TransactionCase):
    def setUp(self):
        super().setUp()
        single_restaurant(self.env)
        self.env["waiter.seed"].seed_kit()
        self.config = self.env["waiter.seed"]._demo_config()
        self.assertTrue(self.config, "hace falta un pos.config (demo)")
        self.session = self.config.current_session_id or self.env["pos.session"].create({"config_id": self.config.id, "user_id": self.env.uid})
        self.product = self.env["product.product"].create({"name": "Arepa de prueba", "available_in_pos": True, "lst_price": 12000})
        self.presets = {p.name: p for p in self.env["pos.preset"].search([("name", "in", ["Dine In", "Takeout", "Delivery"])])}

    def _order(self, preset=None, table=None, **extra):
        values = {
            "company_id": self.env.company.id, "session_id": self.session.id, "date_order": fields.Datetime.now(),
            "amount_tax": 0.0, "amount_total": 12000.0, "amount_paid": 0.0, "amount_return": 0.0,
            "lines": [(0, 0, {"product_id": self.product.id, "qty": 1, "price_unit": 12000, "price_subtotal": 12000, "price_subtotal_incl": 12000})],
        }
        if preset:
            values["preset_id"] = self.presets[preset].id
        if table:
            values["table_id"] = table.id
        values.update(extra)
        return self.env["pos.order"].create(values)

    def _floor_with_tables(self, count):
        floor = self.env["restaurant.floor"].create({"name": "Salón prueba", "pos_config_ids": [(4, self.config.id)]})
        return floor, [self.env["restaurant.table"].create({"floor_id": floor.id, "table_number": 900 + i}) for i in range(count)]


@tagged("post_install", "-at_install")
class TestWaiterOrder(KitCase):
    def test_prefix_and_number_follow_the_preset_and_count_per_day_and_config(self):
        """Atrapa un prefijo que no salga de service_at o una secuencia que no reinicie por prefijo (DI001, DI002, TA001)."""
        # La numeración es por terminal y por día: con el terminal demo, los pedidos que la base de desarrollo ya tenga hoy
        # corrían la cuenta (el primero salía DI002). Un terminal propio de la prueba parte de cero.
        config = self.config.copy({"name": "Numeración de prueba"})
        self.session = self.env["pos.session"].create({"config_id": config.id, "user_id": self.env.uid})
        first, second = self._order("Dine In"), self._order("Dine In")
        takeout, delivery, bare = self._order("Takeout"), self._order("Delivery"), self._order()
        self.assertEqual((first.waiter_prefix, first.waiter_number), ("DI", "DI001"))
        self.assertEqual(second.waiter_number, "DI002")
        self.assertEqual((takeout.waiter_prefix, takeout.waiter_number), ("TA", "TA001"))
        self.assertEqual((delivery.waiter_prefix, delivery.waiter_number), ("DE", "DE001"))
        self.assertEqual(bare.waiter_number, "DI003", "sin preset se sirve en mesa: DI")

    def test_billing_flag_baby_chair_and_delivery_fields_are_written_and_loaded(self):
        order = self._order("Delivery", baby_chair=True, delivery_address="Cra 43 # 5-10", delivery_phone="3001234567")
        self.assertTrue(self.env["pos.order"].set_waiter_billing(order.id, True))
        self.assertTrue(order.waiter_billing)
        self.env["pos.order"].set_waiter_billing(order.id, False)
        self.assertFalse(order.waiter_billing)
        self.assertEqual((order.baby_chair, order.delivery_address, order.delivery_phone), (True, "Cra 43 # 5-10", "3001234567"))
        loaded = self.env["pos.order"]._load_pos_data_fields(self.config)
        self.assertTrue(not loaded or {"baby_chair", "waiter_billing", "waiter_number", "delivery_address"} <= set(loaded))

    def test_move_table_refuses_an_occupied_destination(self):
        """Atrapa que dos pedidos abiertos compartan mesa: el destino debe estar libre."""
        _floor, (t1, t2, t3) = self._floor_with_tables(3)
        moving, other = self._order("Dine In", table=t1), self._order("Dine In", table=t2)
        with self.assertRaises(UserError):
            self.env["pos.order"].waiter_move_table(moving.id, t2.id)
        self.assertEqual(moving.table_id, t1)
        self.assertTrue(self.env["pos.order"].waiter_move_table(moving.id, t3.id))
        self.assertEqual(moving.table_id, t3)
        other.write({"state": "paid"})
        self.assertTrue(self.env["pos.order"].waiter_move_table(moving.id, t2.id), "una mesa con pedido pagado está libre")

    def test_floor_type_rotation_and_available_from_travel_in_load_data(self):
        floor, (table,) = self._floor_with_tables(1)
        floor.floor_type = "outdoor"
        table.rotation = 90
        with self.assertRaises(UserError):
            table.rotation = 45
        self.assertIn("floor_type", self.env["restaurant.floor"]._load_pos_data_fields(self.config))
        self.assertIn("rotation", self.env["restaurant.table"]._load_pos_data_fields(self.config))
        self.assertIn("available_from", self.env["product.template"]._load_pos_data_fields(self.config))
        self.assertIn("waiter_notify", self.env["res.users"]._load_pos_data_fields(self.config))


@tagged("post_install", "-at_install")
class TestEmployeePin(KitCase):
    def setUp(self):
        super().setUp()
        self.pos_user = new_test_user(self.env, login="terminal_kit", groups="base.group_user,point_of_sale.group_pos_user")
        self.employee = self.env["hr.employee"].create({"name": "Prueba Mesera", "pin": "123456", "work_email": "prueba.mesera@example.com"})
        self.Employee = self.env["hr.employee"].with_user(self.pos_user)

    def test_correct_pin_opens_one_attendance_and_end_shift_closes_it(self):
        """Atrapa un login que no registre asistencia, que abra dos, o un cierre que no marque check_out."""
        result = self.Employee.waiter_check_pin(self.employee.id, "123456")
        self.assertTrue(result["ok"])
        self.assertEqual((result["employee"]["name"], result["employee"]["waiter_role"]), ("Prueba Mesera", "waiter"))
        self.assertRegex(result["employee"]["employee_code"], r"^WT-\d{4}$")
        attendance = self.env["hr.attendance"].browse(result["attendance_id"])
        self.assertEqual((attendance.employee_id, attendance.check_out), (self.employee, False))
        again = self.Employee.waiter_check_pin(self.employee.id, "123456")
        self.assertEqual(again["attendance_id"], attendance.id)
        # Un nuevo acceso del mismo empleado conserva el token vigente del turno, para no invalidar las pantallas que ya
        # tenía abiertas (decisión del 2026-09-08, docs/decisiones/2026-09-08-editor-plano-y-zonas.md; la prueba del
        # editor la cubre también). Esta prueba seguía pidiendo un token nuevo y contradecía a aquella.
        self.assertEqual(again["token"], result["token"], "un nuevo acceso conserva el token vigente del turno")
        ended = self.Employee.waiter_end_shift(self.employee.id, token=again["token"])
        self.assertEqual((ended["ok"], ended["attendance_id"], bool(attendance.check_out)), (True, attendance.id, True))
        with self.assertRaises(AccessError, msg="cerrar el turno invalida el token"):
            self.Employee.waiter_end_shift(self.employee.id, token=again["token"])

    def test_wrong_pin_counts_attempts_and_locks_for_ten_minutes(self):
        """Atrapa un PIN que se pueda forzar: 5 fallos bloquean 10 minutos, incluso con el PIN correcto."""
        for expected_left in (4, 3, 2, 1):
            result = self.Employee.waiter_check_pin(self.employee.id, "000000")
            self.assertEqual((result["ok"], result["reason"], result["attempts_left"]), (False, "wrong", expected_left))
        locked = self.Employee.waiter_check_pin(self.employee.id, "000000")
        self.assertEqual(locked["reason"], "locked")
        self.assertEqual(self.Employee.waiter_check_pin(self.employee.id, "123456")["reason"], "locked")
        self.assertFalse(self.env["hr.attendance"].search([("employee_id", "=", self.employee.id)]))
        self.employee.waiter_pin_locked_until = fields.Datetime.now() - timedelta(seconds=1)
        self.assertTrue(self.Employee.waiter_check_pin(self.employee.id, "123456")["ok"])
        self.assertEqual(self.Employee.waiter_check_pin(self.employee.id, "000000")["attempts_left"], 4, "el acierto reinicia el contador")

    def test_unknown_employee_and_pin_types(self):
        self.assertEqual(self.Employee.waiter_check_pin(999999, "123456")["reason"], "unknown")
        self.assertTrue(self.Employee.waiter_check_pin(self.employee.id, 123456)["ok"], "el POS puede mandar un entero")

    def test_change_pin_requires_six_ascii_digits(self):
        for bad in ("12345", "1234567", "abcdef", "١٢٣٤٥٦", ""):
            with self.assertRaises(UserError, msg=bad):
                self.Employee.waiter_change_pin(self.employee.id, bad)
        self.assertTrue(self.Employee.waiter_change_pin(self.employee.id, "654321", current_pin="123456"))
        self.assertTrue(self.Employee.waiter_check_pin(self.employee.id, "654321")["ok"])
        self.assertFalse(self.Employee.waiter_check_pin(self.employee.id, "123456")["ok"])

    def test_the_pos_load_never_asks_for_the_hr_only_employee_fields(self):
        """Atrapa la regresión que dejaba al mesero sin carta: pedir estos campos en load_data hace que Odoo
        lance AccessError para quien atiende, la carga se queda sin pos.config y pos_loyalty revienta."""
        loaded = self.env["hr.employee"]._load_pos_data_fields(self.config)
        for field in ("waiter_role", "employee_code", "joining_date", "shift_start", "shift_end", "employment_status"):
            self.assertNotIn(field, loaded, f"{field} es de RR. HH.: va por waiter_login_list, no por load_data")
        session = self.config.current_session_id or self.env["pos.session"].create({"config_id": self.config.id, "user_id": self.env.uid})
        waiter = new_test_user(self.env, login="mesero_carta", groups="base.group_user,point_of_sale.group_pos_user")
        self.config.write({"module_pos_hr": True, "basic_employee_ids": [(4, self.employee.id)]})
        data = self.env["pos.session"].with_user(waiter).browse(session.id).load_data([])
        self.assertTrue(data.get("pos.config"), "sin pos.config el POS se queda en blanco")

    def test_a_waiter_without_hr_rights_can_still_list_the_employees_to_log_in(self):
        """Atrapa el bug que dejaba fuera a los meseros: search_read niega los campos de RR. HH. y la lista
        del selector llegaba vacía, así que solo podían entrar los administradores."""
        with self.assertRaises(AccessError, msg="los campos de RR. HH. siguen cerrados por lectura directa"):
            self.Employee.search_read([], ["name", "waiter_role", "employee_code"])
        rows = self.Employee.waiter_login_list()
        mine = next(r for r in rows if r["id"] == self.employee.id)
        self.assertEqual((mine["name"], mine["waiter_role"]), ("Prueba Mesera", "waiter"))
        self.assertNotIn("pin", mine, "la lista del login nunca expone el PIN")

    def test_changing_someone_elses_pin_needs_proof_of_identity(self):
        """Atrapa la escalada de privilegios: sin token ni PIN actual, una tablet le cambiaba el PIN al jefe."""
        jefe = self.env["hr.employee"].create({"name": "Jefa", "pin": "999999", "waiter_role": "admin"})
        with self.assertRaises(AccessError):
            self.Employee.waiter_change_pin(jefe.id, "111111")
        mio = self.Employee.waiter_check_pin(self.employee.id, "123456")["token"]
        with self.assertRaises(AccessError, msg="el token de un empleado no vale para otro"):
            self.Employee.waiter_change_pin(jefe.id, "111111", token=mio)
        with self.assertRaises(AccessError):
            self.Employee.waiter_end_shift(jefe.id, token=mio)
        self.assertTrue(self.env["hr.employee"].sudo().browse(jefe.id).pin == "999999", "el PIN del jefe sigue intacto")

    def test_a_wrong_current_pin_counts_as_a_failed_attempt(self):
        """Atrapa un oráculo de fuerza bruta: probar PIN actual en el cambio no puede ser gratis."""
        # Sin `assertRaises`: el de Odoo envuelve en un savepoint y revertiría el contador que queremos ver.
        try:
            self.Employee.waiter_change_pin(self.employee.id, "111111", current_pin="000000")
            self.fail("un PIN actual equivocado no puede cambiar nada")
        except AccessError:
            pass
        self.env.invalidate_all()
        self.assertEqual(self.env["hr.employee"].sudo().browse(self.employee.id).waiter_pin_attempts, 1)
        self.assertTrue(self.Employee.waiter_check_pin(self.employee.id, "123456")["ok"], "el PIN no cambió")

    def test_a_manager_can_reset_a_pin_without_the_old_one(self):
        manager = new_test_user(self.env, login="jefe_kit", groups="base.group_user,point_of_sale.group_pos_user")
        manager.write({"group_ids": [(4, self.env.ref("point_of_sale.group_pos_manager").id)]})
        self.assertTrue(manager.has_group("point_of_sale.group_pos_manager"), "el encargado necesita el grupo")
        self.assertTrue(self.env["hr.employee"].with_user(manager).waiter_change_pin(self.employee.id, "222222"))
        self.assertTrue(self.Employee.waiter_check_pin(self.employee.id, "222222")["ok"])

    def test_forgot_pin_mails_a_new_pin_without_revealing_the_email(self):
        """Atrapa una respuesta distinta para correos desconocidos, o un PIN nuevo que no llegue por mail.mail."""
        with patch("odoo.addons.mail.models.mail_mail.MailMail.send", return_value=True):  # auto_delete borraría el correo al enviarlo
            self.assertTrue(self.Employee.waiter_forgot_pin("nadie@example.com"))
            self.assertFalse(self.env["mail.mail"].search([("email_to", "=", "nadie@example.com")]))
            self.assertTrue(self.Employee.waiter_forgot_pin("Prueba.Mesera@example.com"))
        mail = self.env["mail.mail"].search([("email_to", "=", "prueba.mesera@example.com")], limit=1)
        self.assertTrue(mail, "el PIN nuevo se envía por mail.mail")
        new_pin = self.employee.sudo().pin
        self.assertNotEqual(new_pin, "123456")
        self.assertIn(new_pin, mail.body_html)
        self.assertTrue(self.Employee.waiter_forgot_pin("prueba.mesera@example.com"))
        self.assertEqual(self.employee.sudo().pin, new_pin, "un envío por minuto: el segundo no cambia el PIN")

    def test_employee_code_is_a_sequence_and_reaches_the_pos_through_the_login_list(self):
        other = self.env["hr.employee"].create({"name": "Otro Empleado"})
        self.assertRegex(other.employee_code, r"^WT-\d{4}$")
        self.assertNotEqual(other.employee_code, self.employee.employee_code)
        # El POS los recibe por waiter_login_list, nunca por load_data (son campos de RR. HH.).
        row = next(r for r in self.Employee.waiter_login_list() if r["id"] == other.id)
        self.assertEqual(row["employee_code"], other.employee_code)


@tagged("post_install", "-at_install")
class TestUserNotifyAndSeed(KitCase):
    def test_notify_preferences_default_to_all_true_and_merge_on_write(self):
        user = new_test_user(self.env, login="mesero_notify", groups="base.group_user,point_of_sale.group_pos_user")
        self.assertTrue(all(user.get_waiter_notify().values()))
        result = user.with_user(user).set_waiter_notify('{"kitchen_sound": false, "unknown": true}')
        self.assertEqual(result["kitchen_sound"], False)
        self.assertEqual(sum(result.values()), 5)
        self.assertEqual(json.loads(user.waiter_notify)["kitchen_sound"], False)
        self.assertEqual(user.with_user(user).set_waiter_notify({"system_popup": False})["kitchen_sound"], False, "conserva lo anterior")

    # Falla si la siembra vuelve a crear presets propios en vez de usar los de Odoo cuando la base está en español: los de
    # Odoo se llaman «Comer en el local», «Para llevar» y «Entrega» en es_CO, la búsqueda por el nombre en inglés no los
    # encontraba y cada base nueva nacía con los tres presets duplicados (pasó en la base de desarrollo el 7 de septiembre).
    def test_seed_reuses_odoo_presets_whatever_the_language(self):
        canonical = {self.env.ref(f"pos_restaurant.{xml_id}") for xml_id in ("pos_takein_preset", "pos_takeout_preset", "pos_delivery_preset")}
        before = self.env["pos.preset"].search_count([])
        presets = self.env["waiter.seed"].with_context(lang="es_CO").seed_presets()
        self.assertEqual(set(presets), canonical)
        self.assertEqual(self.env["pos.preset"].search_count([]), before)

    # Falla si los presets duplicados que ya existen no se funden en los de Odoo, o si al fundirlos un pedido pierde su
    # tipo de servicio, su número (ya impreso en comandas) o el terminal se queda apuntando a uno borrado.
    def test_seed_merges_duplicate_presets_into_odoo_ones_keeping_orders_intact(self):
        takein = self.env.ref("pos_restaurant.pos_takein_preset")
        duplicate = self.env["pos.preset"].with_context(lang="en_US").create({"name": "Dine In", "service_at": "table"})
        order = self._order()
        order.preset_id = duplicate
        number, prefix = order.waiter_number, order.waiter_prefix
        self.config.write({"default_preset_id": duplicate.id, "available_preset_ids": [(4, duplicate.id)]})
        self.env["waiter.seed"].seed_kit()
        self.assertFalse(duplicate.exists())
        self.assertEqual((order.preset_id, order.waiter_number, order.waiter_prefix), (takein, number, prefix))
        self.assertEqual(self.config.default_preset_id, takein)
        self.assertIn(takein, self.config.available_preset_ids)

    def test_seed_is_idempotent_and_configures_presets_loyalty_and_demo_employees(self):
        """Atrapa una siembra que duplique al repetirse o que deje el preset Dine In sin service_at=table."""
        counts = lambda: (self.env["pos.preset"].search_count([("name", "in", ["Dine In", "Takeout", "Delivery"])]),
                          self.env["loyalty.program"].search_count([("name", "=", "Puntos Waiter")]),
                          self.env["hr.employee"].search_count([("name", "in", ["Sofía Mesera", "Carlos Cajero", "Laura Encargada"])]))
        self.env["waiter.seed"].seed_kit()
        self.assertEqual(counts(), (3, 1, 3))
        self.assertEqual([self.presets[n].service_at for n in ("Dine In", "Takeout", "Delivery")], ["table", "counter", "delivery"])
        self.assertEqual((self.presets["Takeout"].identification, self.presets["Delivery"].identification), ("name", "address"))
        program = self.env["loyalty.program"].search([("name", "=", "Puntos Waiter")])
        self.assertEqual((program.program_type, program.rule_ids.reward_point_mode, program.rule_ids.reward_point_amount), ("loyalty", "money", 0.001))
        self.assertEqual((program.reward_ids.discount_mode, program.reward_ids.required_points, program.reward_ids.discount), ("per_point", 100.0, 10.0))
        sofia = self.env["hr.employee"].search([("name", "=", "Sofía Mesera")])
        self.assertEqual((sofia.sudo().pin, sofia.waiter_role, sofia in self.config.basic_employee_ids), ("123456", "waiter", True))
        self.assertEqual(self.env["hr.employee"].search([("name", "=", "Carlos Cajero")]).waiter_role, "cashier")
        # Sin un empleado administrador, Cocina y Administración quedan fuera del alcance de cualquier tablet.
        self.assertEqual(self.env["hr.employee"].search([("name", "=", "Laura Encargada")]).waiter_role, "admin")
        self.assertTrue(self.config.use_presets and self.presets["Dine In"] in self.config.available_preset_ids)
