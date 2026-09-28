"""Notificaciones del kit: plato listo, stock bajo sin duplicar, solicitud al proveedor y lectura por usuario.

Corren con el runner de Odoo (`-u projectapp_notify --test-enable --test-tags /projectapp_notify`).
"""
from odoo import fields
from odoo.tests import TransactionCase, tagged
from odoo.tests.common import new_test_user
from odoo.addons.projectapp_ops.tests.common_waiter import single_restaurant


@tagged("post_install", "-at_install")
class TestNotify(TransactionCase):
    def setUp(self):
        super().setUp()
        single_restaurant(self.env)
        self.Notification = self.env["waiter.notification"]
        self.config = self.env["pos.config"].search([("module_pos_restaurant", "=", True)], limit=1) or self.env["pos.config"].search([], limit=1)
        self.session = self.config.current_session_id or self.env["pos.session"].create({"config_id": self.config.id, "user_id": self.env.uid})
        self.warehouse = self.env["stock.warehouse"].search([("company_id", "=", self.env.company.id)], limit=1)
        self.vendor = self.env["res.partner"].create({"name": "Proveedor de prueba"})
        self.salmon = self.env["product.product"].create({
            "name": "Filete de salmón", "type": "consu", "is_storable": True, "sale_ok": False, "purchase_ok": True,
            "seller_ids": [(0, 0, {"partner_id": self.vendor.id, "price": 2500, "min_qty": 5})],
        })
        self.orderpoint = self.env["stock.warehouse.orderpoint"].create({
            "product_id": self.salmon.id, "warehouse_id": self.warehouse.id, "location_id": self.warehouse.lot_stock_id.id,
            "product_min_qty": 10, "product_max_qty": 20,
        })

    def _set_stock(self, qty):
        quant = self.env["stock.quant"]
        current = quant._get_available_quantity(self.salmon, self.warehouse.lot_stock_id)
        quant._update_available_quantity(self.salmon, self.warehouse.lot_stock_id, qty - current)
        self.salmon.invalidate_recordset()
        self.orderpoint.invalidate_recordset(["qty_on_hand"])

    def _inventory_open(self):
        return self.Notification.search([("kind", "=", "inventory"), ("res_id", "=", self.salmon.id), ("action_done", "=", False)])

    def test_ready_course_notifies_one_dish_per_line_with_the_table(self):
        """Atrapa una notificación sin producto o sin mesa, o duplicada al reescribir ready_date."""
        floor = self.env["restaurant.floor"].create({"name": "Salón notify", "pos_config_ids": [(4, self.config.id)]})
        table = self.env["restaurant.table"].create({"floor_id": floor.id, "table_number": 7})
        dish = self.env["product.product"].create({"name": "Ajiaco", "available_in_pos": True, "lst_price": 20000})
        order = self.env["pos.order"].create({
            "company_id": self.env.company.id, "session_id": self.session.id, "date_order": fields.Datetime.now(), "table_id": table.id,
            "amount_tax": 0.0, "amount_total": 40000.0, "amount_paid": 0.0, "amount_return": 0.0,
            "lines": [(0, 0, {"product_id": dish.id, "qty": 1, "price_unit": 20000, "price_subtotal": 20000, "price_subtotal_incl": 20000}) for _ in range(2)],
        })
        course = self.env["restaurant.order.course"].browse(self.env["restaurant.order.course"].kitchen_fire(order.id, order.lines.ids))
        course.action_kitchen_ready()
        notes = self.Notification.search([("kind", "=", "kitchen"), ("res_model", "=", "pos.order"), ("res_id", "=", order.id)])
        self.assertEqual(len(notes), 2)
        self.assertEqual(notes[0].title, "Plato listo para servir")
        self.assertIn("Ajiaco", notes[0].body)
        self.assertIn("Mesa 7", notes[0].body)
        self.assertEqual((notes[0].action, notes[0].read, notes[0].user_id.id), ("serve", False, False))
        course.write({"ready_date": fields.Datetime.now()})
        self.assertEqual(self.Notification.search_count([("kind", "=", "kitchen"), ("res_id", "=", order.id)]), 2)

    def test_low_stock_is_notified_once_while_it_stays_low(self):
        """Atrapa un cron que repita «Stock bajo» cada 5 minutos, o que no vuelva a avisar tras recuperarse."""
        self._set_stock(3)
        created = self.Notification.waiter_check_low_stock()
        self.assertEqual(len(self._inventory_open()), 1)
        note = self.Notification.browse(created)
        self.assertEqual((note.kind, note.title, note.action, note.res_model), ("inventory", "Stock bajo", "request_ingredient", "product.product"))
        self.assertIn("Filete de salmón", note.body)
        self.Notification.waiter_check_low_stock()
        self.assertEqual(len(self._inventory_open()), 1, "sigue bajo: no se duplica")
        self._set_stock(15)
        self.Notification.waiter_check_low_stock()
        self.assertEqual((len(self._inventory_open()), note.action_done), (0, True))
        self._set_stock(2)
        self.Notification.waiter_check_low_stock()
        self.assertEqual(len(self._inventory_open()), 1, "volvió a bajar: aviso nuevo")

    def test_request_ingredient_creates_a_draft_purchase_with_the_supplier(self):
        """Atrapa una solicitud sin proveedor, con otra cantidad, o que deje la notificación pendiente."""
        self._set_stock(3)
        note = self.Notification.browse(self.Notification.waiter_check_low_stock())
        result = self.Notification.waiter_request_ingredient(self.salmon.id)
        purchase = self.env["purchase.order"].browse(result["purchase_id"])
        self.assertEqual((purchase.state, purchase.partner_id), ("draft", self.vendor))
        line = purchase.order_line
        self.assertEqual((line.product_id, line.product_qty, line.price_unit), (self.salmon, 17.0, 2500.0))
        self.assertEqual((result["partner_id"], result["product_qty"]), (self.vendor.id, 17.0))
        self.assertTrue(note.action_done)

    def test_mark_all_read_and_search_read_only_touch_general_or_own(self):
        """Atrapa que un usuario lea o marque notificaciones dirigidas a otro."""
        waiter = new_test_user(self.env, login="mesero_notify_kit", groups="base.group_user,point_of_sale.group_pos_user")
        other = new_test_user(self.env, login="otro_notify_kit", groups="base.group_user,point_of_sale.group_pos_user")
        self.Notification.create([{"kind": "system", "title": "General"}, {"kind": "system", "title": "Mía", "user_id": waiter.id},
                                  {"kind": "system", "title": "Ajena", "user_id": other.id}])
        mine = self.Notification.with_user(waiter)
        domain = [("user_id", "in", [False, waiter.id]), ("title", "in", ["General", "Mía", "Ajena"])]
        self.assertEqual(sorted(n["title"] for n in mine.search_read(domain, ["title"])), ["General", "Mía"])
        self.assertEqual(mine.waiter_mark_all_read() >= 2, True)
        self.assertEqual(self.Notification.search([("title", "=", "Ajena")]).read, False)
        self.assertTrue(all(n.read for n in self.Notification.search([("title", "in", ["General", "Mía"])])))
        self.assertFalse(mine.search([("title", "=", "Ajena")]), "la regla de registro oculta las ajenas")
