"""Catálogo de la organización y edición de costos desde la consola del dueño."""
import math
from collections import defaultdict

from odoo import api, models, _
from odoo.exceptions import ValidationError

from odoo.addons.projectapp_ops.models.owner_permissions import require_owner


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model
    def waiter_catalog_overview(self):
        """Platos, recetas e ingredientes activos, sin depender de un restaurante o turno."""
        require_owner(self.env)
        templates = self.with_context(active_test=True, bin_size=True, bin_size_image_1920=True)
        dishes = templates.search([
            ('active', '=', True), ('is_ingredient', '=', False), ('pos_categ_ids', '!=', False),
        ], order='name, id')
        ingredients = templates.search([
            ('active', '=', True), ('is_ingredient', '=', True),
        ], order='name, id')
        requirements = dishes._pantry_requirements()
        product_ids = {product_id for recipe in requirements.values() for product_id in recipe}
        products = self.env['product.product'].browse(sorted(product_ids))
        # Una lectura de costos para todo el catálogo; cada receta usa sus cantidades normalizadas.
        unit_costs = self._pantry_recipe_costs(dict.fromkeys(products.ids, 1.0))
        template_by_product = {product.id: product.product_tmpl_id.id for product in products}
        name_by_product = {product.id: product.product_tmpl_id.name for product in products}
        # Solo interesa la presencia de la foto; se leen los tamaños en lote, sin descargar los binarios.
        images = {row['id']: bool(row['image_1920']) for row in dishes.read(['image_1920'])}
        used_in = defaultdict(set)
        rows = []
        for dish in dishes:
            recipe = requirements.get(dish.id, {})
            for product_id in recipe:
                used_in[template_by_product[product_id]].add(dish.id)
            missing_costs = [name_by_product[product_id] for product_id in recipe if unit_costs[product_id] == 0]
            rows.append({
                'template_id': dish.id, 'name': dish.name,
                'categories': dish.pos_categ_ids.mapped('name'), 'category_ids': dish.pos_categ_ids.ids,
                'list_price': dish.list_price, 'available_in_pos': dish.available_in_pos,
                'has_image': images[dish.id], 'has_recipe': bool(recipe), 'ingredients_count': len(recipe),
                'recipe_cost': sum(qty * unit_costs[product_id] for product_id, qty in recipe.items())
                               if recipe and not missing_costs else None,
                'missing_costs': missing_costs,
            })
        return {
            'currency': self.env.company.currency_id.name,
            'dishes': rows,
            'ingredients': [{
                'template_id': ingredient.id, 'name': ingredient.name, 'uom': ingredient.uom_id.name,
                'cost': ingredient.standard_price, 'used_in': len(used_in[ingredient.id]),
            } for ingredient in ingredients],
        }

    def waiter_set_ingredient_cost(self, cost):
        """Actualiza el costo unitario de un ingrediente, sin turno ni token de restaurante."""
        require_owner(self.env)
        if len(self) != 1 or not self.exists() or not self.is_ingredient:
            raise ValidationError(_('Selecciona un ingrediente para cambiar su costo.'))
        valid = isinstance(cost, (int, float)) and not isinstance(cost, bool)
        if valid:
            try:
                valid = math.isfinite(cost) and cost >= 0
            except OverflowError:
                valid = False
        if not valid:
            raise ValidationError(_('El costo debe ser un número finito mayor o igual a cero.'))
        self.write({'standard_price': cost})
        return {'template_id': self.id, 'cost': self.standard_price}
