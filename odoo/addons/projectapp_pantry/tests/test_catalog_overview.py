"""Plan R: contrato del catálogo con datos propios, incluso sobre una copia de desarrollo."""
import base64
import io
import json
from unittest.mock import patch
from uuid import uuid4

from PIL import Image

from odoo import Command
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestCatalogOverview(TransactionCase):
    def setUp(self):
        super().setUp()
        self.env.user.waiter_role = 'owner'
        self.templates = self.env['product.template']
        self.owner = self._user('owner', 'Dueño R')
        self.manager = self._user('admin', 'Encargada R')
        self.cashier = self._user('cashier', 'Cajero R')
        self.category = self.env['pos.category'].create({'name': 'Platos R'})
        self.kg = self.env.ref('uom.product_uom_kgm')
        self.gram = self.env.ref('uom.product_uom_gram')
        self.ingredient = self._ingredient('B Papa R', 4500)
        self.missing = self._ingredient('A Sal sin costo R', 0)
        self.unused = self._ingredient('C Ingrediente sin uso R', 800)
        self.dish = self._dish('B Papas R', [{'ingredientId': self.ingredient.id, 'qty': 0.25}])
        self.no_recipe = self._dish('A Plato sin receta R')
        self.incomplete = self._dish('C Plato con costo incompleto R', [
            {'ingredientId': self.ingredient.id, 'qty': 0.5},
            {'ingredientId': self.missing.id, 'qty': 0.01},
        ])

    def _user(self, role, name):
        return self.env['res.users'].create({
            'name': name, 'login': 'catalogo-r-' + uuid4().hex, 'waiter_role': role,
            'group_ids': [Command.set(self.env.ref('base.group_user').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'waiter_config_ids': [Command.clear()],
        })

    def _ingredient(self, name, cost, **values):
        return self.templates.create({
            'name': name, 'type': 'consu', 'is_storable': True, 'is_ingredient': True,
            'sale_ok': False, 'available_in_pos': False, 'standard_price': cost, 'uom_id': self.kg.id,
            **values,
        })

    def _dish(self, name, recipe=None, **values):
        dish = self.templates.create({
            'name': name, 'type': 'consu', 'is_storable': False, 'is_ingredient': False,
            'available_in_pos': True, 'list_price': 8900, 'pos_categ_ids': [Command.set(self.category.ids)],
            'image_1920': False, **values,
        })
        if recipe is not None:
            dish.waiter_set_recipe(recipe)
        return dish

    def _overview(self, user=None, **context):
        return self.templates.with_user(user or self.owner).with_context(**context).waiter_catalog_overview()

    def _rows(self, overview, key):
        return {row['template_id']: row for row in overview[key]}

    def test_overview_contract_and_recipe_cost(self):
        # Falla si cambia una clave del contrato o se usa el costo del plato en vez del de su receta.
        self.dish.standard_price = 99999
        overview = self._overview()
        self.assertEqual(set(overview), {'currency', 'dishes', 'ingredients'})
        self.assertEqual(overview['currency'], self.env.company.currency_id.name)
        self.assertEqual(self._rows(overview, 'dishes')[self.dish.id], {
            'template_id': self.dish.id, 'name': self.dish.name,
            'categories': [self.category.name], 'category_ids': self.category.ids,
            'list_price': 8900.0, 'available_in_pos': True, 'has_image': False,
            'has_recipe': True, 'ingredients_count': 1, 'recipe_cost': 1125.0, 'missing_costs': [],
        })
        self.assertEqual(self._rows(overview, 'ingredients')[self.ingredient.id], {
            'template_id': self.ingredient.id, 'name': self.ingredient.name,
            'uom': self.kg.name, 'cost': 4500.0, 'used_in': 2,
        })
        self.assertEqual(json.loads(json.dumps(overview, allow_nan=False)), overview)

    def test_no_recipe_and_missing_cost_are_null(self):
        # Falla si una receta inexistente, vacía o sin costo se presenta como gratis o pierde el nombre faltante.
        empty = self._dish('Receta vacía R', [])
        rows = self._rows(self._overview(), 'dishes')
        for dish in (self.no_recipe, empty):
            row = rows[dish.id]
            self.assertFalse(row['has_recipe'])
            self.assertEqual(row['ingredients_count'], 0)
            self.assertIsNone(row['recipe_cost'])
            self.assertEqual(row['missing_costs'], [])
        row = rows[self.incomplete.id]
        self.assertTrue(row['has_recipe'])
        self.assertEqual(row['ingredients_count'], 2)
        self.assertIsNone(row['recipe_cost'])
        self.assertEqual(row['missing_costs'], [self.missing.name])

    def test_cost_matches_recipe_detail_with_units_and_yield(self):
        # Falla si el catálogo ignora gramos/rendimiento o difiere del costo mostrado por el editor de recetas.
        bom = self.dish.waiter_set_recipe([
            {'ingredientId': self.ingredient.id, 'qty': 1000, 'uomId': self.gram.id},
        ])
        bom.product_qty = 4
        config = self.env['pos.config'].waiter_create_restaurant('Restaurante R', 'r-' + uuid4().hex)
        detail = self.dish.with_user(self.owner).with_context(waiter_config_id=config['id']).waiter_recipe_detail()
        cost = self._rows(self._overview(), 'dishes')[self.dish.id]['recipe_cost']
        self.assertEqual(cost, 1125.0)
        self.assertEqual(cost, detail['cost'])

    def test_hidden_dishes_are_included_and_inactive_records_are_excluded(self):
        # Falla si ocultar en la carta elimina el plato, entran productos sin categoría o reaparecen archivados.
        hidden = self._dish('Oculto R', [{'ingredientId': self.ingredient.id, 'qty': 1}], available_in_pos=False)
        archived = self._dish('Archivado R', [{'ingredientId': self.ingredient.id, 'qty': 1}])
        archived.active = False
        uncategorized = self._dish('Sin categoría R', pos_categ_ids=[Command.clear()])
        archived_ingredient = self._ingredient('Ingrediente archivado R', 10, active=False)
        self.ingredient.pos_categ_ids = self.category
        overview = self._overview(active_test=False)
        dishes = self._rows(overview, 'dishes')
        ingredients = self._rows(overview, 'ingredients')
        self.assertFalse(dishes[hidden.id]['available_in_pos'])
        self.assertEqual(dishes[hidden.id]['recipe_cost'], 4500.0)
        for template in (archived, uncategorized, self.ingredient):
            self.assertNotIn(template.id, dishes)
        self.assertNotIn(archived_ingredient.id, ingredients)
        self.assertNotIn(self.dish.id, ingredients)
        self.assertEqual(ingredients[self.ingredient.id]['used_in'], 3)

    def test_used_in_counts_active_dishes_and_current_recipes(self):
        # Falla si used_in cuenta cantidades, recetas antiguas, platos archivados o inventa usos del ingrediente libre.
        self.dish.waiter_set_recipe([{'ingredientId': self.ingredient.id, 'qty': 10}])
        self.incomplete.waiter_set_recipe([{'ingredientId': self.missing.id, 'qty': 1}])
        hidden = self._dish('Oculto con receta R', [{'ingredientId': self.ingredient.id, 'qty': 3}], available_in_pos=False)
        archived = self._dish('Archivado con receta R', [{'ingredientId': self.ingredient.id, 'qty': 1}])
        archived.active = False
        ingredients = self._rows(self._overview(), 'ingredients')
        self.assertEqual(ingredients[self.ingredient.id]['used_in'], 2)
        self.assertEqual(ingredients[self.missing.id]['used_in'], 1)
        self.assertEqual(ingredients[self.unused.id]['used_in'], 0)
        hidden.active = False
        self.assertEqual(self._rows(self._overview(), 'ingredients')[self.ingredient.id]['used_in'], 1)

    def test_names_categories_and_image_presence(self):
        # Falla si las listas no están ordenadas, las categorías pierden sus ids o has_image no refleja la foto.
        second_category = self.env['pos.category'].create({'name': 'Entradas R'})
        self.dish.pos_categ_ids |= second_category
        stream = io.BytesIO()
        Image.new('RGB', (8, 8), (90, 150, 40)).save(stream, format='PNG')
        self.dish.image_1920 = base64.b64encode(stream.getvalue())
        overview = self._overview()
        own_dishes = (self.no_recipe | self.dish | self.incomplete).ids
        own_ingredients = (self.missing | self.ingredient | self.unused).ids
        self.assertEqual([row['template_id'] for row in overview['dishes'] if row['template_id'] in own_dishes], own_dishes)
        self.assertEqual([row['template_id'] for row in overview['ingredients'] if row['template_id'] in own_ingredients], own_ingredients)
        row = self._rows(overview, 'dishes')[self.dish.id]
        self.assertEqual(dict(zip(row['category_ids'], row['categories'])), {
            self.category.id: self.category.name, second_category.id: second_category.name,
        })
        self.assertTrue(row['has_image'])
        self.dish.image_1920 = False
        self.assertFalse(self._rows(self._overview(), 'dishes')[self.dish.id]['has_image'])

    def test_overview_requires_owner(self):
        # Falla si el encargado o cajero puede leer el catálogo del dueño usando sus permisos reales.
        for user in (self.manager, self.cashier):
            with self.subTest(user=user.name), self.assertRaisesRegex(AccessError, 'Solo el dueño'):
                self._overview(user)
        self.assertIn(self.dish.id, self._rows(self._overview(), 'dishes'))

    def test_system_group_can_read_and_set_cost_without_owner_group(self):
        # Falla si un administrador de Odoo sin grupo de dueño pierde el acceso previsto por el contrato.
        self.manager.write({'group_ids': [Command.link(self.env.ref('base.group_system').id)]})
        self.assertFalse(self.manager.has_group('projectapp_ops.group_waiter_owner'))
        self.assertIn(self.dish.id, self._rows(self._overview(self.manager), 'dishes'))
        self.assertEqual(self.ingredient.with_user(self.manager).waiter_set_ingredient_cost(5000), {
            'template_id': self.ingredient.id, 'cost': 5000.0,
        })

    def test_set_cost_updates_overview_without_session_or_token(self):
        # Falla si editar costo exige turno/token, no lo persiste o deja desactualizado el costo de las recetas.
        self._overview()
        result = self.ingredient.with_user(self.owner).waiter_set_ingredient_cost(6000)
        self.assertEqual(result, {'template_id': self.ingredient.id, 'cost': 6000.0})
        self.assertEqual(self.ingredient.standard_price, 6000.0)
        self.assertEqual(self.ingredient.product_variant_id.standard_price, 6000.0)
        overview = self._overview()
        self.assertEqual(self._rows(overview, 'ingredients')[self.ingredient.id]['cost'], 6000.0)
        self.assertEqual(self._rows(overview, 'dishes')[self.dish.id]['recipe_cost'], 1500.0)
        self.missing.with_user(self.owner).waiter_set_ingredient_cost(1000)
        row = self._rows(self._overview(), 'dishes')[self.incomplete.id]
        self.assertEqual(row['recipe_cost'], 3010.0)
        self.assertEqual(row['missing_costs'], [])

    def test_zero_cost_is_valid_and_marks_recipe_as_incomplete(self):
        # Falla si rechaza cero o sigue mostrando un costo conocido al dejar un ingrediente sin costo.
        result = self.ingredient.with_user(self.owner).waiter_set_ingredient_cost(0)
        self.assertEqual(result, {'template_id': self.ingredient.id, 'cost': 0.0})
        row = self._rows(self._overview(), 'dishes')[self.dish.id]
        self.assertIsNone(row['recipe_cost'])
        self.assertEqual(row['missing_costs'], [self.ingredient.name])

    def test_invalid_cost_is_rejected_without_writing(self):
        # Falla si acepta negativos, no finitos, booleanos o textos, o modifica el costo antes de validarlo.
        for cost in (-1, float('nan'), float('inf'), -float('inf'), True, False, '4500', None, [], {}, 10 ** 400):
            with self.subTest(cost=cost), self.assertRaises(ValidationError):
                self.ingredient.with_user(self.owner).waiter_set_ingredient_cost(cost)
            self.assertEqual(self.ingredient.standard_price, 4500.0)

    def test_set_cost_requires_an_ingredient(self):
        # Falla si permite editar el costo de un plato o acepta una selección vacía, múltiple o inexistente.
        for records in (self.dish, self.templates.browse(), self.ingredient | self.missing, self.templates.browse(-1)):
            with self.subTest(ids=records.ids), self.assertRaises(ValidationError):
                records.with_user(self.owner).waiter_set_ingredient_cost(1)
        self.assertEqual(self.ingredient.standard_price, 4500.0)

    def test_set_cost_requires_owner(self):
        # Falla si encargado/cajero pueden cambiar costo, aunque lo repitan o manden un valor inválido.
        for user in (self.manager, self.cashier):
            for cost in (4500, 6000, -1):
                with self.subTest(user=user.name, cost=cost), self.assertRaisesRegex(AccessError, 'Solo el dueño'):
                    self.ingredient.with_user(user).waiter_set_ingredient_cost(cost)
        self.assertEqual(self.ingredient.standard_price, 4500.0)

    def test_recipes_and_combo_components_are_loaded_in_batches(self):
        # Falla si consulta recetas de platos/componentes uno a uno o el combo pierde costos y usos de ingredientes.
        second = self._dish('Segundo plato del combo R', [{'ingredientId': self.ingredient.id, 'qty': 0.5}])
        combo = self._dish('Combo R', diner_attributes=json.dumps({'combo': [
            {'producto': self.dish.product_variant_id.id, 'cantidad': 2},
            {'producto': second.product_variant_id.id, 'cantidad': 3},
        ]}))
        model = type(self.templates)
        original = model._pantry_boms
        batches = []

        def record_batch(records):
            batches.append(set(records.ids))
            return original(records)

        with patch.object(model, '_pantry_boms', record_batch):
            overview = self._overview()
        own_dishes = {self.dish.id, second.id, combo.id}
        self.assertTrue(any(own_dishes <= batch for batch in batches))
        component_batches = [batch for batch in batches[1:] if batch & {self.dish.id, second.id}]
        self.assertTrue(component_batches)
        self.assertTrue(all({self.dish.id, second.id} <= batch for batch in component_batches))
        self.assertEqual(self._rows(overview, 'dishes')[combo.id]['recipe_cost'], 9000.0)
        self.assertEqual(self._rows(overview, 'ingredients')[self.ingredient.id]['used_in'], 4)
