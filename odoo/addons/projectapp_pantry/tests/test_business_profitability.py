"""Q1 y Q4: la ficha comercial es del dueño; el encargado consulta costos de su sede."""
from odoo import Command
from odoo.exceptions import AccessError
from odoo.tests import tagged

from odoo.addons.projectapp_ops.tests.common_business import BusinessCase


@tagged('post_install', '-at_install')
class TestBusinessProfitability(BusinessCase):
    def setUp(self):
        super().setUp()
        self.templates = self.env['product.template'].with_context(waiter_config_id=self.first.id)
        self.ingredient = self.templates.create({
            'name': 'Ingrediente Q', 'type': 'consu', 'is_storable': True, 'is_ingredient': True,
            'sale_ok': False, 'available_in_pos': False, 'standard_price': 20,
            'uom_id': self.env.ref('uom.product_uom_kgm').id,
        })
        self.dish = self._dish('Plato con receta Q', price=100, qty=2)

    def _dish(self, name, price, qty):
        return self.templates.browse(self.templates.waiter_create_dish({
            'name': name, 'list_price': price, 'taxes_id': [Command.clear()],
            'property_account_income_id': self.income.id,
        }, [{'ingredientId': self.ingredient.id, 'qty': qty}])['id'])

    def _report(self, config=None, user=None):
        return self.templates.with_user(user or self.owner).waiter_profitability('2040-06-15', '2040-06-16', config)

    def _row(self, template, config=None, user=None):
        return next(row for row in self._report(config, user)['rows'] if row['template_id'] == template.id)

    def test_create_dish_requires_owner(self):
        # Falla si el encargado da de alta platos o el dueño pierde el alta autorizada.
        with self.assertRaises(AccessError):
            self.templates.with_user(self.manager).waiter_create_dish({'name': 'Plato prohibido'})
        result = self.templates.with_user(self.owner).waiter_create_dish({'name': 'Plato del dueño Q'})
        self.assertTrue(result['id'])

    def test_save_catalog_product_requires_owner(self):
        # Falla si guardar catálogo permite al encargado cambiar precio, impuestos o visibilidad.
        values = {'name': 'Plato actualizado Q', 'type': 'consu', 'list_price': 150}
        with self.assertRaises(AccessError):
            self.templates.with_user(self.manager).waiter_save_catalog_product(
                self.dish.id, values, self.manager_employee.id, self.manager_token)
        self.templates.with_user(self.owner).waiter_save_catalog_product(
            self.dish.id, values, self.owner_employee.id, self.owner_token)
        self.assertEqual(self.dish.list_price, 150)

    def test_recipe_update_requires_owner_but_manager_can_read(self):
        # Falla si el encargado cambia recetas por cualquiera de las dos APIs o deja de ver su costo.
        detail = self.dish.with_user(self.manager).waiter_recipe_detail()
        self.assertEqual(detail['cost'], 40)
        recipe = [{'ingredientId': self.ingredient.id, 'qty': 1}]
        with self.assertRaises(AccessError):
            self.dish.with_user(self.manager).waiter_update_recipe(
                recipe, 1, detail['bom_id'], self.manager_employee.id, self.manager_token)
        with self.assertRaises(AccessError):
            self.dish.with_user(self.manager).waiter_set_recipe(recipe)
        changed = self.dish.with_user(self.owner).waiter_update_recipe(
            recipe, 1, detail['bom_id'], self.owner_employee.id, self.owner_token)
        self.assertEqual(changed['cost'], 20)

    def test_manager_changes_thresholds_but_not_cost(self):
        # Falla si mínimo/máximo requieren dueño o si el encargado puede alterar el costo del ingrediente.
        ingredient = self.ingredient.with_user(self.manager)
        result = ingredient.waiter_inventory_settings(20, 3, 8, self.manager_employee.id, self.manager_token)
        self.assertEqual((result['min'], result['max'], result['cost']), (3, 8, 20))
        with self.assertRaises(AccessError):
            ingredient.waiter_inventory_settings(25, 4, 9, self.manager_employee.id, self.manager_token)
        self.assertEqual((self.ingredient.pantry_min, self.ingredient.pantry_max, self.ingredient.standard_price), (3, 8, 20))
        result = self.ingredient.with_user(self.owner).waiter_inventory_settings(25, 4, 9, self.owner_employee.id, self.owner_token)
        self.assertEqual((result['min'], result['max'], result['cost']), (4, 9, 25))
        for record in (self.ingredient, self.ingredient.product_variant_id):
            with self.assertRaises(AccessError):
                record.with_user(self.manager).write({'standard_price': 30})

    def test_cost_reuses_recipe_quantities_units_and_yield(self):
        # Falla si Q4 usa standard_price del plato, ignora unidades/rendimiento o difiere del detalle de receta.
        detail = self.dish.waiter_recipe_detail()
        self.dish.waiter_update_recipe([{'ingredientId': self.ingredient.id, 'qty': 1000,
                                        'uomId': self.env.ref('uom.product_uom_gram').id}],
                                       2, detail['bom_id'], self.owner_employee.id, self.owner_token)
        row = self._row(self.dish, self.first.id)
        self.assertEqual(row['cost'], self.dish.waiter_recipe_detail()['cost'])
        self.assertEqual((row['cost'], row['margin'], row['food_cost_pct']), (10, 90, 10))
        self.assertIsNone(row['class'])

    def test_price_is_per_restaurant_and_margin_excludes_included_tax(self):
        # Falla si ignora la lista local o calcula margen y food cost con impuestos incluidos.
        tax = self.env['account.tax'].create({
            'name': 'Impuesto incluido Q', 'amount': 8, 'amount_type': 'percent', 'type_tax_use': 'sale',
            'company_id': self.company.id, 'price_include_override': 'tax_included',
        })
        self.dish.write({'list_price': 108, 'taxes_id': [Command.set(tax.ids)]})
        self.first.with_user(self.owner).waiter_set_catalog_price(self.dish.id, 216)
        self.second.with_user(self.owner).waiter_set_catalog_price(self.dish.id, 324)
        for config, price, net in ((self.first.id, 216, 200), (self.second.id, 324, 300), (None, 108, 100)):
            row = self._row(self.dish, config)
            self.assertEqual(row['price'], price)
            self.assertAlmostEqual(row['margin'], net - 40)
            self.assertAlmostEqual(row['food_cost_pct'], 40 / net * 100)

    def test_no_recipe_or_missing_ingredient_cost_has_null_metrics(self):
        # Falla si un plato sin receta o con costo incompleto aparece con margen del 100 %.
        missing = self._dish('Plato sin costo Q', 100, 1)
        self.ingredient.standard_price = 0
        for template in (self.product.product_tmpl_id, missing):
            row = self._row(template, self.first.id)
            for key in ('cost', 'margin', 'food_cost_pct', 'gross_profit', 'class'):
                self.assertIsNone(row[key], key)

    def test_four_menu_classes_with_constructed_sales(self):
        # Falla si cambia la regla del 70 %, usa margen no ponderado o confunde alguno de los cuatro tipos.
        fixtures = [('Estrella Q', 100, 10, 'star'), ('Caballo Q', 50, 10, 'plowhorse'),
                    ('Rompecabezas Q', 100, 1, 'puzzle'), ('Perro Q', 50, 1, 'dog')]
        expected = {}
        for name, price, units, kind in fixtures:
            dish = self._dish(name, price, 2)
            self._order(product=dish.product_variant_id, amount=price * units, qty=units)
            expected[dish.id] = kind
        # Sin costo aunque venda mucho: no participa en ninguno de los umbrales.
        self._order(product=self.product, amount=100000, qty=1000)
        result = self._report(self.first.id)
        self.assertAlmostEqual(result['thresholds']['popularity_units'], 3.85)
        self.assertAlmostEqual(result['thresholds']['margin'], 35)
        rows = {row['template_id']: row for row in result['rows']}
        self.assertEqual({key: rows[key]['class'] for key in expected}, expected)
        self.assertIsNone(rows[self.product.product_tmpl_id.id]['class'])

    def test_sales_refunds_period_and_restaurant_filter(self):
        # Falla si incluye borradores, otra sede, propinas o fechas ajenas, o no resta unidades e ingresos devueltos.
        product = self.dish.product_variant_id
        self._order(product=product, amount=180, qty=2, tip=20, tax=14.4)
        self._order(product=product, amount=-90, qty=-1, tip=-10, guests=0, tax=-7.2)
        self._order(self.second, product=product, amount=300, qty=3)
        self._order(product=product, amount=900, qty=9, state='draft')
        self._order(product=product, amount=900, qty=9, date='2040-06-15 04:59:59')
        row = self._row(self.dish, self.first.id)
        self.assertEqual((row['units'], row['revenue'], row['gross_profit']), (1, 90, 50))
        all_row = self._row(self.dish)
        self.assertEqual((all_row['units'], all_row['revenue'], all_row['gross_profit']), (4, 390, 230))
        self.assertNotIn(self.tip.product_tmpl_id.id, [r['template_id'] for r in self._report()['rows']])

    def test_manager_must_choose_an_assigned_restaurant(self):
        # Falla si el encargado usa None para ver la organización o consulta una sede ajena.
        own = self._row(self.dish, self.first.id, self.manager)
        self.assertEqual(own['cost'], 40)
        for config in (None, self.second.id):
            with self.assertRaises(AccessError):
                self._report(config, self.manager)
        with self.assertRaises(AccessError):
            self._report(self.first.id, self.cashier)
        self.assertEqual(self._report(self.second.id)['config_id'], self.second.id)
        self.assertIsNone(self._report()['config_id'])

    def test_local_availability_remains_operational(self):
        # Falla si la protección comercial impide al encargado agotar un plato solo en su restaurante.
        self.dish.with_user(self.manager).waiter_set_availability(self.first.id, False)
        self.assertIn(self.first, self.dish.waiter_unavailable_config_ids)
        self.assertNotIn(self.second, self.dish.waiter_unavailable_config_ids)
