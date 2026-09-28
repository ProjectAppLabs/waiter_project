"""Despensa del kit CloudPos sobre product / stock / mrp / purchase.

Ingrediente = product.template almacenable, no vendible, con `is_ingredient`, categoría del kit y proveedor
(`product.supplierinfo`). Receta = `mrp.bom` tipo kit (phantom) del plato. Niveles desde `stock.warehouse.orderpoint`
(mín / máx) o los umbrales por defecto 5 / 20. Sin vistas: el POS llama estos métodos por `call_kw`.
"""
import math

from odoo import Command, api, fields, models, _
from odoo.exceptions import UserError

PANTRY_CATEGORIES = [
    ("produce", "Frutas y verduras"),
    ("meat", "Carnes y aves"),
    ("seafood", "Pescados y mariscos"),
    ("dairy", "Lácteos y huevos"),
    ("dry", "Secos y granos"),
]
LEVELS = [("empty", "Vacío"), ("low", "Bajo"), ("medium", "Medio"), ("high", "Alto")]
STATUSES = [("request", "Solicitar"), ("normal", "Normal"), ("good", "Bien")]
DEFAULT_MIN_QTY = 5.0
DEFAULT_MAX_QTY = 20.0
STATUS_BY_LEVEL = {"empty": "request", "low": "request", "medium": "normal", "high": "good"}


def level_for(qty, min_qty, max_qty):
    if qty <= 0:
        return "empty"
    if qty < min_qty:
        return "low"
    if qty < max_qty:
        return "medium"
    return "high"


class ProductTemplate(models.Model):
    _inherit = "product.template"

    is_ingredient = fields.Boolean(string="Es ingrediente", default=False, index=True)
    pantry_category = fields.Selection(PANTRY_CATEGORIES, string="Categoría de despensa")
    pantry_min = fields.Float(string="Mínimo", compute="_compute_pantry_thresholds", help="Del orderpoint o 5 por defecto.")
    pantry_max = fields.Float(string="Máximo", compute="_compute_pantry_thresholds", help="Del orderpoint o 20 por defecto.")
    pantry_level = fields.Selection(LEVELS, string="Nivel", compute="_compute_pantry",
                                    help="Ingrediente: existencias contra mín / máx. Plato con receta: raciones servibles contra mín / máx. Plato sin receta: vacío.")
    pantry_status = fields.Selection(STATUSES, string="Estado de despensa", compute="_compute_pantry")
    pantry_supplier_id = fields.Many2one("res.partner", string="Proveedor", compute="_compute_pantry_supplier")
    has_recipe = fields.Boolean(string="Tiene receta", compute="_compute_servings")
    servings_available = fields.Integer(string="Raciones servibles", compute="_compute_servings",
                                        help="Mínimo de ingredientes libres después de pedidos pendientes / cantidad por plato. 0 sin receta.")

    # ------------------------------------------------------------------ cálculos
    def _pantry_orderpoints(self):
        Orderpoint = self.env["stock.warehouse.orderpoint"]
        by_template = {}
        for orderpoint in Orderpoint.search([("product_id.product_tmpl_id", "in", self.ids), ("warehouse_id", "=", self._waiter_config().warehouse_id.id)], order="id"):
            by_template.setdefault(orderpoint.product_id.product_tmpl_id.id, orderpoint)
        return by_template

    @api.depends_context("waiter_config_id")
    def _compute_pantry_thresholds(self):
        orderpoints = self._pantry_orderpoints()
        for template in self:
            orderpoint = orderpoints.get(template.id)
            template.pantry_min = orderpoint.product_min_qty if orderpoint else DEFAULT_MIN_QTY
            template.pantry_max = orderpoint.product_max_qty if orderpoint else DEFAULT_MAX_QTY
            if template.pantry_max <= template.pantry_min:
                template.pantry_max = template.pantry_min + (DEFAULT_MAX_QTY - DEFAULT_MIN_QTY)

    @api.depends_context("waiter_config_id")
    def _compute_pantry(self):
        for template in self:
            if template.is_ingredient:
                level = level_for(template.with_context(warehouse_id=self._waiter_config().warehouse_id.id).qty_available, template.pantry_min, template.pantry_max)
            elif template.has_recipe:
                level = level_for(template.servings_available, template.pantry_min, template.pantry_max)
            else:
                level = False
            template.pantry_level = level
            template.pantry_status = STATUS_BY_LEVEL.get(level, False)

    def _compute_pantry_supplier(self):
        for template in self:
            template.pantry_supplier_id = template.seller_ids.sorted("sequence")[:1].partner_id

    def _pantry_boms(self):
        """Receta (mrp.bom tipo kit) por plantilla."""
        boms = self.env["mrp.bom"]._bom_find(self.mapped("product_variant_id"), bom_type="phantom")
        return {template.id: boms[template.product_variant_id] for template in self if template.product_variant_id}

    def _compute_servings(self):
        boms = self._pantry_boms()
        for template in self:
            bom = boms.get(template.id)
            lines = bom.bom_line_ids.filtered(lambda l: l.product_qty > 0) if bom else self.env["mrp.bom.line"]
            template.has_recipe = bool(lines)
            template.servings_available = min((line._waiter_servings() for line in lines), default=0)

    # ------------------------------------------------------------------ lectura para el POS
    def recipe_lines(self):
        """Receta del plato: ``[{product_tmpl_id, product_id, name, qty, uom_id, uom_name, qty_available, level, status, servings}]``."""
        self.ensure_one()
        bom = self._pantry_boms().get(self.id)
        return [line._waiter_vals() for line in bom.bom_line_ids] if bom else []

    def waiter_pantry_vals(self):
        """Ficha de ingrediente o plato para las listas del kit."""
        self.ensure_one()
        return {
            "id": self.id, "product_id": self.product_variant_id.id, "name": self.name, "is_ingredient": self.is_ingredient,
            "pantry_category": self.pantry_category or False, "qty_available": self.with_context(warehouse_id=self._waiter_config().warehouse_id.id).qty_available, "uom_id": self.uom_id.id,
            "uom_name": self.uom_id.name, "pantry_min": self.pantry_min, "pantry_max": self.pantry_max,
            "pantry_level": self.pantry_level or False, "pantry_status": self.pantry_status or False,
            "supplier_id": self.pantry_supplier_id.id or False, "supplier_name": self.pantry_supplier_id.display_name or "",
            "has_recipe": self.has_recipe, "servings_available": self.servings_available, "list_price": self.list_price,
            "available_in_pos": self.available_in_pos, "image_url": "/web/image/product.template/%s/image_512" % self.id,
        }

    # ------------------------------------------------------------------ acciones del POS
    @api.model
    def waiter_request_ingredient(self, product_id, qty=None):
        """Solicita `product_id` (id de product.template) al proveedor: purchase.order en borrador, sin duplicar.

        Sin proveedor (`product.supplierinfo`) lanza UserError. Si ya hay un borrador o RFQ enviada con ese
        ingrediente, lo devuelve con ``created: False``. ``qty`` por defecto: lo que falta hasta el máximo.
        """
        template = self.browse(product_id).exists()
        if not template:
            raise UserError(_("El ingrediente no existe."))
        seller = template.seller_ids.sorted("sequence")[:1]
        if not seller:
            raise UserError(_("El ingrediente %s no tiene proveedor. Asigna uno antes de solicitarlo.", template.display_name))
        variant = template.product_variant_id
        Purchase = self.env["purchase.order"]
        existing = Purchase.search([("state", "in", ("draft", "sent")), ("picking_type_id", "=", self._waiter_config().warehouse_id.in_type_id.id), ("order_line.product_id", "=", variant.id)], order="id desc", limit=1)
        if existing:
            return existing.waiter_request_vals(created=False)
        purchase_unit = seller.product_uom_id or template.uom_id
        if qty is not None and (not isinstance(qty, (int, float)) or isinstance(qty, bool) or not math.isfinite(qty) or qty <= 0):
            raise UserError(_("La cantidad solicitada debe ser mayor que cero."))
        stock_qty = qty if qty is not None else max(template.pantry_max - template.with_context(warehouse_id=self._waiter_config().warehouse_id.id).qty_available, 1.0)
        qty = max(template.uom_id._compute_quantity(stock_qty, purchase_unit, round=False), seller.min_qty)
        order = Purchase.create({
            "picking_type_id": self._waiter_config(strict=True).warehouse_id.in_type_id.id, "partner_id": seller.partner_id.id, "origin": _("Despensa"), "waiter_pantry_request": True,
            "order_line": [Command.create({
                "product_id": variant.id, "name": template.display_name, "product_qty": qty,
                "product_uom_id": (seller.product_uom_id or template.uom_id).id, "price_unit": seller.price,
                "date_planned": fields.Datetime.now(),
            })],
        })
        return order.waiter_request_vals(created=True)

    @api.model
    def waiter_request_list(self):
        """Solicitudes hechas desde el POS, la más reciente primero, con estado (draft = Solicitud de presupuesto…)."""
        orders = self.env["purchase.order"].search([("waiter_pantry_request", "=", True), ("picking_type_id", "=", self._waiter_config().warehouse_id.in_type_id.id)], order="date_order desc, id desc")
        return [order.waiter_request_vals() for order in orders]

    @api.model
    def waiter_create_dish(self, vals, recipe=None):
        """Alta de plato ("Add New Dish"): product.template vendible en el POS más su receta.

        ``vals``: campos de product.template (name, list_price, description_sale, pos_categ_ids, taxes_id…).
        ``recipe``: ``[{"product_tmpl_id": <ingrediente> | "product_id": <product.product>, "qty": 0.2, "uom_id": opcional}]``.
        """
        vals = dict(vals or {})
        vals.update({"type": vals.get("type", "consu"), "is_storable": False, "is_ingredient": False})
        vals.setdefault("sale_ok", True)
        vals.setdefault("available_in_pos", True)
        template = self.create(vals)
        if recipe:
            template.waiter_set_recipe(recipe)
        return template.waiter_pantry_vals()

    def waiter_set_recipe(self, recipe):
        """Reemplaza la receta del plato por ``recipe`` (misma forma que en waiter_create_dish)."""
        self.ensure_one()
        Bom = self.env["mrp.bom"]
        Bom.search([("product_tmpl_id", "=", self.id), ("type", "=", "phantom")]).write({"active": False})
        lines = []
        for item in recipe:
            ingredient = (self.env["product.product"].browse(item["product_id"]) if item.get("product_id")
                          else self.browse(item.get("product_tmpl_id")).product_variant_id)
            if not ingredient.exists():
                raise UserError(_("Un ingrediente de la receta no existe."))
            lines.append(Command.create({
                "product_id": ingredient.id, "product_qty": item.get("qty") or 1.0,
                "product_uom_id": item.get("uom_id") or ingredient.uom_id.id,
            }))
        bom = Bom.create({"product_tmpl_id": self.id, "type": "phantom", "product_qty": 1.0, "product_uom_id": self.uom_id.id,
                          "bom_line_ids": lines})
        self._waiter_invalidate()
        return bom

    @api.model
    def _waiter_invalidate(self):
        """Los calculados no se almacenan: tras cambiar stock, receta o umbrales se recalculan en la siguiente lectura."""
        self.env["product.template"].invalidate_model(
            ["qty_available", "has_recipe", "servings_available", "pantry_level", "pantry_status", "pantry_min", "pantry_max"])
        self.env["product.product"].invalidate_model(["qty_available"])

    @api.model
    def waiter_create_ingredient(self, vals, initial_qty=0.0, supplier_id=None):
        """Alta de ingrediente ("Add New Ingredients"): almacenable, no vendible, con proveedor y stock inicial.

        ``vals``: campos de product.template (name, pantry_category, uom_id, standard_price, image_1920…) más
        ``pantry_min`` / ``pantry_max`` opcionales (crean el orderpoint). ``initial_qty`` entra por ajuste de inventario.
        """
        vals = dict(vals or {})
        min_qty, max_qty = vals.pop("pantry_min", None), vals.pop("pantry_max", None)
        vals.update({"type": "consu", "is_storable": True, "is_ingredient": True})
        vals.setdefault("sale_ok", False)
        vals.setdefault("purchase_ok", True)
        vals.setdefault("available_in_pos", False)
        template = self.create(vals)
        if supplier_id:
            self.env["product.supplierinfo"].create({"partner_id": supplier_id, "product_tmpl_id": template.id,
                                                     "price": vals.get("standard_price", 0.0), "min_qty": 0.0})
        if min_qty is not None or max_qty is not None:
            template.waiter_set_thresholds(min_qty, max_qty)
        if initial_qty:
            template.waiter_set_stock(initial_qty)
        return template.waiter_pantry_vals()

    def waiter_set_thresholds(self, min_qty=None, max_qty=None):
        """Crea o actualiza el orderpoint (mín / máx) del ingrediente en el almacén principal; disparo manual."""
        self.ensure_one()
        min_qty = DEFAULT_MIN_QTY if min_qty is None else float(min_qty)
        max_qty = max(DEFAULT_MAX_QTY if max_qty is None else float(max_qty), min_qty)
        orderpoint = self._pantry_orderpoints().get(self.id)
        if orderpoint:
            orderpoint.write({"product_min_qty": min_qty, "product_max_qty": max_qty})
        else:
            orderpoint = self.env["stock.warehouse.orderpoint"].create({
                "product_id": self.product_variant_id.id, "location_id": self._waiter_stock_location(strict=True).id,
                "product_min_qty": min_qty, "product_max_qty": max_qty, "trigger": "manual",
            })
        self._waiter_invalidate()
        return orderpoint

    def waiter_set_stock(self, qty):
        """Ajuste de inventario a ``qty`` en el almacén principal (stock.quant en modo inventario)."""
        self.ensure_one()
        quant = self.env["stock.quant"].with_context(inventory_mode=True).create({
            "product_id": self.product_variant_id.id, "location_id": self._waiter_stock_location(strict=True).id, "inventory_quantity": qty,
        })
        quant.action_apply_inventory()
        self._waiter_invalidate()
        return quant

    def _waiter_config(self, strict=False):
        return self.env['pos.config']._waiter_selected_config(strict=strict)

    def _waiter_stock_location(self, strict=False):
        return self._waiter_config(strict=strict).warehouse_id.lot_stock_id


class MrpBomLine(models.Model):
    _inherit = "mrp.bom.line"

    def _waiter_qty_per_serving(self):
        """Cantidad del ingrediente por ración, en la unidad del ingrediente."""
        self.ensure_one()
        qty = self.product_uom_id._compute_quantity(self.product_qty, self.product_id.uom_id, round=False)
        return qty / (self.bom_id.product_qty or 1.0)

    def _waiter_servings(self):
        self.ensure_one()
        per_serving = self._waiter_qty_per_serving()
        if per_serving <= 0:
            return 0
        return max(int(math.floor(self.product_id.with_context(warehouse_id=self.env['pos.config']._waiter_selected_config().warehouse_id.id).qty_available / per_serving + 1e-9)), 0)

    def _waiter_vals(self):
        self.ensure_one()
        template = self.product_id.product_tmpl_id
        return {
            "id": self.id, "product_tmpl_id": template.id, "product_id": self.product_id.id, "name": template.name,
            "qty": self.product_qty, "uom_id": self.product_uom_id.id, "uom_name": self.product_uom_id.name,
            "qty_available": self.product_id.with_context(warehouse_id=self.env['pos.config']._waiter_selected_config().warehouse_id.id).qty_available, "level": template.pantry_level or False,
            "status": template.pantry_status or False, "servings": self._waiter_servings(),
        }
