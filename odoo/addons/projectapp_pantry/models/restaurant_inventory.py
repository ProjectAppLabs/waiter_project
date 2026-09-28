"""Inventario operativo de un restaurante: recetas, compromisos y movimientos auditables."""
import math
from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError


def number(value, label, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or (positive and value == 0):
        raise UserError(_('Revisa %s: debe ser una cantidad válida.', label))
    return float(value)


def unit_root(unit):
    while unit.relative_uom_id:
        unit = unit.relative_uom_id
    return unit


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model
    def waiter_setup_precision(self):
        if not self.env.su:
            raise AccessError(_('Esta configuración se aplica al actualizar el módulo.'))
        precision = self.env['decimal.precision'].search([('name', '=', 'Product Unit')], limit=1)
        if precision and precision.digits < 4:
            precision.digits = 4
        return True

    def _pantry_manager(self, employee_id, token):
        employee = self.env['hr.employee'].sudo().browse(employee_id).exists()
        if (self.env.user.waiter_role not in ('admin', 'owner') or not employee or not employee.active or
                employee.company_id != self.env.company or employee.waiter_role not in ('admin', 'owner') or not employee._waiter_session_ok(token)):
            raise AccessError(_('Valida el PIN del administrador para modificar recetas o existencias.'))
        self.check_access('write')
        config = self._waiter_config()
        if employee.waiter_role != 'owner' and config not in employee.waiter_config_ids:
            raise AccessError(_('El empleado no opera este restaurante.'))
        return employee

    def _pantry_requirements(self):
        """Ingredientes agrupados por producto y expresados en unidad de stock por plato."""
        result = {}
        boms = self._pantry_boms()
        for template, bom in ((t, boms.get(t.id)) for t in self):
            quantities = defaultdict(float)
            if bom:
                for line in bom.bom_line_ids:
                    quantities[line.product_id.id] += line.product_uom_id._compute_quantity(line.product_qty, line.product_id.uom_id, round=False) / (bom.product_qty or 1)
            result[template.id] = dict(quantities)
        return result

    @api.model
    def _pantry_pending_orders(self, organization=False):
        orders = self.env['pos.order'].sudo() if organization else self.env['pos.order']
        # Los compromisos son del almacén: cualquier punto de venta que descuenta de él compromete sus ingredientes.
        scope = ('company_id', '=', self.env.company.id) if organization else ('config_id.picking_type_id.warehouse_id', '=', self._waiter_config().warehouse_id.id)
        return orders.search([
            scope, ('state', 'in', ['draft', 'paid', 'done', 'invoiced']),
            '|', '|', ('state', '=', 'draft'), ('picking_ids.state', 'in', ['draft', 'waiting', 'confirmed', 'assigned']),
            '&', ('picking_ids', '=', False), ('session_id.state', '!=', 'closed'),
        ])
    @api.model
    def _pantry_pending(self):
        """Compromisos del POS aún no descontados por sus albaranes."""
        orders = self._pantry_pending_orders()
        requirements = orders.lines.product_id.product_tmpl_id._pantry_requirements()
        pending = defaultdict(float)
        for order in orders:
            demand = defaultdict(float)
            for line in order.lines.filtered(lambda l: l.qty > 0):
                for product_id, qty in requirements.get(line.product_id.product_tmpl_id.id, {}).items():
                    demand[product_id] += qty * line.qty
            for move in order.picking_ids.move_ids.filtered(lambda m: m.state == 'done'):
                if move.product_id.id in demand and move.location_id.usage == 'internal' and move.location_dest_id.usage != 'internal':
                    demand[move.product_id.id] -= move.product_uom._compute_quantity(move.quantity, move.product_id.uom_id, round=False)
            for product_id, qty in demand.items():
                pending[product_id] += max(0, qty)
        return pending

    @api.model
    def _pantry_balances(self, product_ids):
        location = self._waiter_stock_location()
        quants = self.env['stock.quant'].search([('product_id', 'in', list(product_ids)), ('location_id', 'child_of', location.id), ('company_id', '=', self.env.company.id)])
        balances = defaultdict(float)
        for quant in quants:
            balances[quant.product_id.id] += quant.quantity
        return balances

    @api.depends_context("waiter_config_id")
    def _compute_servings(self):
        requirements = self._pantry_requirements()
        pending = self._pantry_pending()
        balances = self._pantry_balances({p for recipe in requirements.values() for p in recipe})
        for template in self:
            recipe = requirements.get(template.id, {})
            template.has_recipe = bool(recipe)
            template.servings_available = min((max(0, math.floor((balances[p]-pending[p])/qty+1e-9)) for p, qty in recipe.items() if qty > 0), default=0)

    def waiter_recipe_detail(self):
        self.ensure_one()
        self.check_access('read')
        bom = self._pantry_boms().get(self.id)
        requirements = self._pantry_requirements().get(self.id, {})
        pending = self._pantry_pending()
        balances = self._pantry_balances(requirements)
        ingredients = []
        for product in self.env['product.product'].browse(list(requirements)):
            qty = requirements[product.id]
            free = max(0, balances[product.id]-pending[product.id])
            ingredients.append({'id': product.product_tmpl_id.id, 'name': product.name, 'qty': qty,
                'uom_id': product.uom_id.id, 'uom': product.uom_id.name, 'stock': balances[product.id],
                'pending': pending[product.id], 'free': free, 'servings': max(0, math.floor(free/qty+1e-9)) if qty > 0 else 0,
                'cost': qty*product.standard_price})
        servings = min((r['servings'] for r in ingredients), default=0)
        return {'id': self.id, 'name': self.name, 'bom_id': bom.id if bom else None, 'yield': bom.product_qty if bom else 1,
            'lines': [{'ingredientId': l.product_id.product_tmpl_id.id, 'qty': l.product_qty, 'uomId': l.product_uom_id.id} for l in bom.bom_line_ids] if bom else [],
            'ingredients': ingredients, 'servings': servings, 'cost': sum(r['cost'] for r in ingredients),
            'limiting': [r['name'] for r in ingredients if r['servings'] == servings]}

    def waiter_update_recipe(self, recipe, yield_qty, expected_bom_id, employee_id, token):
        self.ensure_one()
        self._pantry_manager(employee_id, token)
        yield_qty = number(yield_qty, 'las porciones de la receta', positive=True)
        self.env.cr.execute('SELECT id FROM product_template WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()
        bom = self._pantry_boms().get(self.id)
        if (bom.id if bom else None) != expected_bom_id:
            raise UserError(_('La receta cambió en otra pantalla. Vuelve a abrirla.'))
        # El consumo pendiente debe mantener la receta con la que se tomó el pedido.
        open_lines = self._pantry_pending_orders(organization=True).lines.filtered(lambda l: l.qty > 0 and l.product_id.product_tmpl_id == self)
        if open_lines:
            raise UserError(_('Termina o cancela los pedidos pendientes de este plato antes de cambiar su receta.'))
        created = self.waiter_set_recipe(recipe)
        created.product_qty = yield_qty
        self._waiter_invalidate()
        return self.waiter_recipe_detail()

    def waiter_set_recipe(self, recipe):
        self.ensure_one()
        self.check_access('write')
        if self.is_ingredient or not isinstance(recipe, list) or len(recipe) > 100:
            raise UserError(_('La receta necesita un plato y hasta 100 ingredientes.'))
        if self._pantry_pending_orders(organization=True).lines.filtered(lambda l: l.qty > 0 and l.product_id.product_tmpl_id == self):
            raise UserError(_('Termina los pedidos pendientes antes de modificar esta receta.'))
        normalized = []
        seen = set()
        for line in recipe:
            product = (self.env['product.product'].browse(line.get('product_id')).exists() if line.get('product_id') else self.browse(line.get('product_tmpl_id', line.get('ingredientId'))).exists().product_variant_id)
            if not product or not product.active or not product.is_ingredient or not product.is_storable or product.company_id not in (self.env.company, self.env['res.company']):
                raise UserError(_('Selecciona ingredientes activos con control de existencias.'))
            qty = number(line.get('qty'), 'la cantidad del ingrediente', positive=True)
            unit = self.env['uom.uom'].browse(line.get('uom_id', line.get('uomId')) or product.uom_id.id).exists()
            if not unit or unit_root(unit) != unit_root(product.uom_id):
                raise UserError(_('La unidad de %s no es compatible con su unidad de inventario.', product.name))
            if product.id in seen:
                raise UserError(_('El ingrediente %s está repetido; reúne su cantidad en una fila.', product.name))
            seen.add(product.id)
            normalized.append({'product_id': product.id, 'qty': qty, 'uom_id': unit.id})
        return super().waiter_set_recipe(normalized)

    def waiter_inventory_detail(self):
        self.ensure_one()
        self.check_access('read')
        product = self.product_variant_id
        location = self._waiter_stock_location(strict=True)
        locations = self.env['stock.location'].search([('id', 'child_of', location.id)]).ids
        moves = self.env['stock.move'].search([('product_id', '=', product.id), ('state', '=', 'done'),
            '|', ('location_id', 'in', locations), ('location_dest_id', 'in', locations)], order='date desc, id desc', limit=100)
        history = []
        for m in moves:
            sign = int(m.location_dest_id.id in locations)-int(m.location_id.id in locations)
            if not sign:
                continue
            history.append({'id': m.id, 'date': fields.Datetime.to_string(m.date), 'qty': sign*m.product_uom._compute_quantity(m.quantity, product.uom_id, round=False),
                'reason': m.waiter_pantry_reason or m.origin or m.reference or '', 'kind': m.waiter_pantry_kind or ('sale' if m.picking_id.pos_order_id else 'stock'),
                'employee': m.waiter_pantry_employee_id.name or m.create_uid.name})
        return {'stock': self._pantry_balances([product.id])[product.id], 'pending': self._pantry_pending()[product.id],
            'cost': product.standard_price, 'min': self.pantry_min, 'max': self.pantry_max, 'uom': product.uom_id.name, 'history': history}

    def waiter_inventory_move(self, kind, qty, reason, request_key, expected_stock, employee_id, token):
        self.ensure_one()
        employee = self._pantry_manager(employee_id, token)
        if not self.is_ingredient or self.tracking != 'none':
            raise UserError(_('Esta operación requiere un ingrediente sin seguimiento por lote. Los lotes se reciben desde Inventario de Odoo.'))
        if kind not in ('receipt', 'waste', 'count') or not isinstance(reason, str) or not reason.strip() or len(reason) > 300:
            raise UserError(_('Selecciona el movimiento y escribe su motivo o referencia (hasta 300 caracteres).'))
        qty = number(qty, 'la cantidad', positive=kind != 'count')
        if not isinstance(request_key, str) or not 16 <= len(request_key) <= 80:
            raise UserError(_('El identificador del movimiento no es válido.'))
        product = self.product_variant_id
        self.env.cr.execute('SELECT id FROM product_product WHERE id = %s FOR UPDATE', [product.id])
        existing = self.env['stock.move'].search([('waiter_pantry_key', '=', request_key)], limit=1)
        if existing:
            if existing.product_id != product or existing.waiter_pantry_kind != kind or existing.waiter_pantry_requested_qty != qty or existing.waiter_pantry_reason != reason.strip() or self._waiter_stock_location() not in (existing.location_id, existing.location_dest_id):
                raise UserError(_('El movimiento ya fue usado para otro ingrediente.'))
            return self.waiter_inventory_detail()
        self.env.cr.execute('SELECT id FROM stock_quant WHERE product_id = %s AND company_id = %s ORDER BY id FOR UPDATE', [product.id, self.env.company.id])
        self.env['stock.quant'].invalidate_model(['quantity'])
        self._waiter_invalidate()
        current = self._pantry_balances([product.id])[product.id]
        location = self._waiter_stock_location(strict=True)
        # Esta UI opera una ubicación; evita convertir un total de sububicaciones en un ajuste local.
        child_quants = self.env['stock.quant'].search([('product_id', '=', product.id), ('location_id', 'child_of', location.id), ('location_id', '!=', location.id), ('quantity', '!=', 0)], limit=1)
        if child_quants:
            raise UserError(_('Este ingrediente tiene existencias en sububicaciones. Registra el movimiento desde Inventario de Odoo.'))
        if kind == 'count':
            if self._pantry_pending()[product.id] > 1e-9:
                raise UserError(_('Termina los pedidos que usan este ingrediente antes del conteo físico, para no ajustar dos veces su consumo.'))
            number(expected_stock, 'la existencia consultada')
            if abs(current-expected_stock) > 1e-6:
                raise UserError(_('Las existencias cambiaron mientras contabas. Actualiza y revisa el conteo.'))
            delta = qty-current
            if abs(delta) < 1e-9:
                return self.waiter_inventory_detail()
        else:
            delta = qty if kind == 'receipt' else -qty
        if current+delta < -1e-6:
            raise UserError(_('No hay existencias suficientes para registrar esa merma.'))
        other = self.env.ref('stock.stock_location_suppliers') if kind == 'receipt' else product.property_stock_inventory
        source, dest = (other, location) if delta > 0 else (location, other)
        move = self.env['stock.move'].create({'product_id': product.id, 'product_uom': product.uom_id.id,
            'product_uom_qty': abs(delta), 'location_id': source.id, 'location_dest_id': dest.id,
            'company_id': self.env.company.id, 'origin': reason.strip(), 'waiter_pantry_reason': reason.strip(),
            'waiter_pantry_kind': kind, 'waiter_pantry_requested_qty': qty, 'waiter_pantry_key': request_key, 'waiter_pantry_employee_id': employee.id})
        move._action_confirm()
        move.write({'quantity': abs(delta), 'picked': True})
        move._action_done()
        self._waiter_invalidate()
        return self.waiter_inventory_detail()

    def write(self, vals):
        if vals.get('active') is False:
            ingredients = self.filtered('is_ingredient')
            if ingredients and self.env['mrp.bom.line'].search_count([('product_id.product_tmpl_id', 'in', ingredients.ids), ('bom_id.active', '=', True)]):
                raise UserError(_('Retira el ingrediente de las recetas activas antes de archivarlo.'))
        return super().write(vals)

    def waiter_inventory_settings(self, cost, minimum, maximum, employee_id, token):
        self.ensure_one()
        self._pantry_manager(employee_id, token)
        number(cost, 'el costo'); number(minimum, 'el mínimo'); number(maximum, 'el máximo')
        if maximum < minimum:
            raise UserError(_('El máximo no puede ser menor que el mínimo.'))
        self.standard_price = cost
        self.waiter_set_thresholds(minimum, maximum)
        return self.waiter_inventory_detail()


class StockMove(models.Model):
    _inherit = 'stock.move'
    waiter_pantry_requested_qty = fields.Float(copy=False)
    waiter_pantry_key = fields.Char(copy=False, index=True)
    waiter_pantry_reason = fields.Char(copy=False)
    waiter_pantry_kind = fields.Selection([('receipt', 'Entrada'), ('waste', 'Merma'), ('count', 'Conteo')], copy=False)
    waiter_pantry_employee_id = fields.Many2one('hr.employee', copy=False)
    _waiter_pantry_unique = models.Constraint('UNIQUE(waiter_pantry_key)', 'El movimiento de inventario ya fue registrado.')


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _force_create_picking_real_time(self):
        # Las recetas se descuentan al cobrar, sin esperar al cierre de caja.
        return super()._force_create_picking_real_time() or any(self.lines.product_id.product_tmpl_id._pantry_requirements().values())

    def action_pos_order_paid(self):
        self.ensure_one()
        self.check_access('write')
        self.env.cr.execute('SELECT id FROM pos_order WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset(['state', 'picking_ids'])
        result = super().action_pos_order_paid()
        # El POS propio cobra por esta API, no por _process_saved_order del cliente Odoo.
        # _create_order_picking es idempotente y el cliente nativo puede volver a llamarlo.
        self._create_order_picking()
        self.env['product.template']._waiter_invalidate()
        return result
