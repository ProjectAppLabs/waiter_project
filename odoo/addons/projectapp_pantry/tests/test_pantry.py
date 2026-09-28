"""Despensa del kit: raciones servibles, niveles, solicitud sin duplicar, alta de plato con receta e ingrediente con stock.

Corren con el runner de Odoo (`-u projectapp_pantry --test-enable --test-tags /projectapp_pantry`).
"""
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from odoo.addons.projectapp_pantry.hooks import seed_demo, INGREDIENTS, RECIPES
from odoo.addons.projectapp_ops.tests.common_waiter import single_restaurant


@tagged("post_install", "-at_install")
class TestPantry(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        single_restaurant(cls.env)
        cls.Template = cls.env["product.template"]
        cls.kg = cls.env.ref("uom.product_uom_kgm")
        cls.unit = cls.env.ref("uom.product_uom_unit")
        cls.supplier = cls.env["res.partner"].create({"name": "Proveedor de pruebas", "supplier_rank": 1})

    def _ingredient(self, name, uom, qty, supplier=None, **extra):
        vals = {"name": name, "pantry_category": "meat", "uom_id": uom.id}
        vals.update(extra)
        return self.Template.browse(self.Template.waiter_create_ingredient(vals, initial_qty=qty, supplier_id=supplier)["id"])

    def test_servings_available_is_the_bottleneck_ingredient_and_recipe_lines_carry_levels(self):
        """Falla si las raciones no salen del ingrediente más escaso, si la conversión de unidades se ignora o si un plato sin receta finge datos."""
        meat = self._ingredient("Carne de prueba", self.kg, 1.0)
        bun = self._ingredient("Pan de prueba", self.unit, 12.0, pantry_category="dry")
        dish = self.Template.browse(self.Template.waiter_create_dish(
            {"name": "Hamburguesa de prueba", "list_price": 32000},
            [{"product_tmpl_id": meat.id, "qty": 200, "uom_id": self.env.ref("uom.product_uom_gram").id}, {"product_tmpl_id": bun.id, "qty": 1}],
        )["id"])
        self.assertEqual((dish.has_recipe, dish.servings_available, dish.available_in_pos, dish.is_storable), (True, 5, True, False))
        lines = {line["name"]: line for line in dish.recipe_lines()}
        self.assertEqual((lines["Carne de prueba"]["servings"], lines["Pan de prueba"]["servings"]), (5, 12))
        self.assertEqual((lines["Carne de prueba"]["level"], lines["Pan de prueba"]["level"], lines["Carne de prueba"]["uom_name"]), ("low", "medium", "g"))
        self.assertEqual((dish.pantry_level, dish.pantry_status), ("medium", "normal"))
        bare = self.Template.create({"name": "Plato sin receta"})
        self.assertEqual((bare.has_recipe, bare.servings_available, bare.pantry_level, bare.pantry_status), (False, 0, False, False))

    def test_levels_and_status_follow_the_orderpoint_or_the_default_thresholds(self):
        """Falla si los niveles no salen del orderpoint (mín / máx), si no se aplican los umbrales 5 / 20 sin orderpoint, o si el estado no acompaña."""
        cheese = self._ingredient("Queso de prueba", self.kg, 0.0, pantry_min=5, pantry_max=20)
        expectations = [(0.0, "empty", "request"), (3.0, "low", "request"), (12.0, "medium", "normal"), (25.0, "high", "good")]
        for qty, level, status in expectations:
            cheese.waiter_set_stock(qty)
            cheese.invalidate_recordset()
            self.assertEqual((cheese.qty_available, cheese.pantry_level, cheese.pantry_status), (qty, level, status), qty)
        cheese.waiter_set_thresholds(30, 60)
        cheese.invalidate_recordset()
        self.assertEqual((cheese.pantry_min, cheese.pantry_max, cheese.pantry_level), (30.0, 60.0, "low"))
        plain = self._ingredient("Sal de prueba", self.kg, 7.0, pantry_category="dry")
        self.assertEqual((plain.pantry_min, plain.pantry_max, plain.pantry_level, plain.pantry_status), (5.0, 20.0, "medium", "normal"))

    def test_request_ingredient_needs_a_supplier_and_never_duplicates_the_draft(self):
        """Falla si se solicita sin proveedor con un error opaco, si la RFQ no queda en borrador con el proveedor, o si una segunda solicitud duplica."""
        orphan = self._ingredient("Sin proveedor", self.kg, 1.0)
        with self.assertRaises(UserError) as caught:
            self.Template.waiter_request_ingredient(orphan.id)
        self.assertIn("no tiene proveedor", str(caught.exception))
        salmon = self._ingredient("Salmón de prueba", self.kg, 2.0, supplier=self.supplier.id, pantry_category="seafood", standard_price=65000)
        first = self.Template.waiter_request_ingredient(salmon.id)
        order = self.env["purchase.order"].browse(first["id"])
        self.assertEqual((first["created"], order.state, order.partner_id, order.waiter_pantry_request), (True, "draft", self.supplier, True))
        self.assertEqual((order.order_line.product_id, order.order_line.product_qty, order.order_line.price_unit), (salmon.product_variant_id, 18.0, 65000.0))
        again = self.Template.waiter_request_ingredient(salmon.id, qty=3)
        self.assertEqual((again["id"], again["created"]), (order.id, False))
        self.assertEqual(self.env["purchase.order"].search_count([("order_line.product_id", "=", salmon.product_variant_id.id)]), 1)
        listed = [row for row in self.Template.waiter_request_list() if row["id"] == order.id]
        self.assertEqual((len(listed), listed[0]["state"], listed[0]["lines"][0]["product_tmpl_id"]), (1, "draft", salmon.id))

    def test_new_ingredient_gets_supplier_stock_and_flags_and_new_dish_gets_its_kit_bom(self):
        """Falla si el alta de ingrediente no deja stock inicial, proveedor y banderas correctas, o si el plato nuevo no tiene su mrp.bom kit."""
        egg = self._ingredient("Huevo de prueba", self.unit, 8.0, supplier=self.supplier.id, pantry_category="dairy")
        self.assertEqual((egg.qty_available, egg.is_ingredient, egg.is_storable, egg.sale_ok, egg.purchase_ok, egg.available_in_pos),
                         (8.0, True, True, False, True, False))
        self.assertEqual((egg.pantry_supplier_id, egg.pantry_category, egg.uom_id), (self.supplier, "dairy", self.unit))
        self.assertEqual(self.env["stock.move"].search_count([("product_id", "=", egg.product_variant_id.id), ("state", "=", "done")]), 1)
        vals = self.Template.waiter_create_dish({"name": "Arepa de prueba", "list_price": 12000}, [{"product_tmpl_id": egg.id, "qty": 2}])
        bom = self.env["mrp.bom"].search([("product_tmpl_id", "=", vals["id"])])
        self.assertEqual((bom.type, bom.bom_line_ids.product_id, bom.bom_line_ids.product_qty), ("phantom", egg.product_variant_id, 2.0))
        self.assertEqual((vals["servings_available"], vals["has_recipe"], vals["pantry_level"]), (4, True, "low"))
        dish = self.Template.browse(vals["id"])
        dish.waiter_set_recipe([{"product_tmpl_id": egg.id, "qty": 1}])
        self.assertEqual((self.env["mrp.bom"].search_count([("product_tmpl_id", "=", dish.id)]), dish.servings_available), (1, 8))

    def test_demo_seed_is_idempotent_and_builds_the_recipes_of_the_demo_dishes(self):
        """Falla si la siembra crea duplicados al repetirse o si no engancha la receta a un plato demo existente."""
        # Aísla la siembra de platos/ingredientes demo y pedidos que ya traiga la base de pruebas.
        names = [row[0] for row in INGREDIENTS] + list(RECIPES)
        for template in self.Template.search([('name', 'in', names)]):
            template.name = template.name + ' (previo a prueba)'
        angus = self.Template.create({"name": "Hamburguesa Angus", "list_price": 38000, "available_in_pos": True})
        seed_demo(self.env)
        seed_demo(self.env)
        ingredients = self.Template.search([("is_ingredient", "=", True), ("name", "in", ["Carne de res Angus", "Huevos", "Arroz"])])
        self.assertEqual(len(ingredients), 3)
        self.assertEqual(self.env["res.partner"].search_count([("name", "=", "Distribuidora La Finca")]), 1)
        meat = ingredients.filtered(lambda t: t.name == "Carne de res Angus")
        self.assertEqual((meat.qty_available, meat.pantry_level, meat.pantry_supplier_id.name), (12.0, "medium", "Carnes y Mares del Valle"))
        self.assertEqual((angus.has_recipe, angus.servings_available, len(angus.recipe_lines())), (True, 60, 3))
        self.assertEqual(self.env["mrp.bom"].search_count([("product_tmpl_id", "=", angus.id)]), 1)
