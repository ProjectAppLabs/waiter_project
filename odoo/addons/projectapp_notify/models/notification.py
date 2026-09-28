"""`waiter.notification`: la campana del kit CloudPos (Dashboard › Notification), sin vistas.

Tres tipos, como las tres pestañas del kit: `kitchen` (plato listo), `inventory` (stock bajo) y `system`.
Una notificación sin `user_id` es para todos los usuarios del terminal; con `user_id`, solo para ese usuario
(regla de registro `waiter_notification_rule_user`). El POS la lee con
`waiter.notification.search_read([('user_id', 'in', [False, uid])], [...])`.

Generadores:
- Cocina: al escribir `ready_date` en un `restaurant.order.course` (models/course.py), una notificación por línea
  «Plato listo para servir» con el producto y la mesa.
- Inventario: cron cada 5 minutos (`waiter_check_low_stock`) sobre `stock.warehouse.orderpoint`: «Stock bajo» para
  cada producto almacenable con existencias por debajo de `product_min_qty`. No se duplica mientras siga bajo; cuando
  el producto se recupera, las abiertas se cierran (`action_done`) y una caída posterior vuelve a avisar.
- Acción: `waiter_request_ingredient(product_id)` crea la solicitud de compra en borrador con el proveedor de
  `product.supplierinfo` y marca `action_done` en las notificaciones del producto.
"""
from odoo import _, api, fields, models
from odoo.exceptions import UserError

KINDS = [("kitchen", "Cocina"), ("inventory", "Inventario"), ("system", "Sistema")]


class WaiterNotification(models.Model):
    _name = "waiter.notification"
    _description = "Notificación del kit Waiter"
    _order = "create_date desc, id desc"

    config_id = fields.Many2one('pos.config', required=True, index=True, ondelete='cascade',
                                default=lambda self: self.env['pos.config']._waiter_selected_config())
    kind = fields.Selection(KINDS, string="Tipo", required=True, index=True)
    title = fields.Char(string="Título", required=True)
    body = fields.Char(string="Cuerpo")
    res_model = fields.Char(string="Modelo relacionado", help="pos.order, product.product…")
    res_id = fields.Integer(string="Registro relacionado", index=True)
    action = fields.Char(string="Acción", help="Lo que el POS ofrece: serve (llevar a la mesa), request_ingredient…")
    action_done = fields.Boolean(string="Acción realizada", default=False, index=True)
    read = fields.Boolean(string="Leída", default=False, index=True)
    user_id = fields.Many2one("res.users", string="Usuario", index=True, ondelete="cascade",
                              help="Vacío: para todos los usuarios del terminal.")

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        # El aviso tiene que sonar en la tablet ahora, no en el siguiente latido.
        configs = records.config_id.ids
        self.env["waiter.bus"].waiter_send(configs, "notify")
        return records

    # --- Lectura y marcado ------------------------------------------------------------------------

    @api.model
    def _waiter_mine_domain(self):
        return [("config_id", "=", self.env["pos.config"]._waiter_selected_config().id), "|", ("user_id", "=", False), ("user_id", "=", self.env.uid)]

    @api.model
    def waiter_mark_all_read(self):
        """Marca leídas todas las del usuario actual (y las generales). Devuelve cuántas cambió."""
        pending = self.search(self._waiter_mine_domain() + [("read", "=", False)])
        pending.write({"read": True})
        return len(pending)

    @api.model
    def waiter_mark_read(self, ids):
        self.browse(ids).write({"read": True})
        return True

    # --- Inventario -----------------------------------------------------------------------------

    @api.model
    def _low_stock_orderpoints(self):
        orderpoints = self.env["stock.warehouse.orderpoint"].search([("product_id.is_storable", "=", True)])
        # Existencias frescas aunque el cron corra en una transacción que ya leyó el producto.
        orderpoints.product_id.invalidate_recordset(["qty_available", "virtual_available"])
        orderpoints.invalidate_recordset(["qty_on_hand", "qty_forecast"])
        low = orderpoints.filtered(lambda o: o.qty_on_hand < o.product_min_qty)
        return low, orderpoints - low

    @api.model
    def waiter_check_low_stock(self):
        """Cron (cada 5 minutos). Crea «Stock bajo» por producto bajo mínimo sin duplicar mientras siga bajo;
        cierra las abiertas de los productos que se recuperaron. Devuelve los ids creados."""
        low, fine = self._low_stock_orderpoints()
        created = self.browse()
        for config in self.env['pos.config'].search([]):
            local_low = low.filtered(lambda o: o.warehouse_id == config.warehouse_id)
            local_fine = fine.filtered(lambda o: o.warehouse_id == config.warehouse_id)
            domain = [('config_id', '=', config.id), ('kind', '=', 'inventory'),
                      ('res_model', '=', 'product.product'), ('action_done', '=', False)]
            recovered = local_fine.product_id - local_low.product_id
            self.search(domain + [('res_id', 'in', recovered.ids)]).write({'action_done': True})
            already = set(self.search(domain).mapped('res_id'))
            for orderpoint in local_low:
                product = orderpoint.product_id
                if product.id in already:
                    continue
                already.add(product.id)
                created |= self.create({
                    'config_id': config.id, 'kind': 'inventory', 'title': _('Stock bajo'),
                    'body': _('%(product)s: quedan %(qty)s (mínimo %(min)s). Pide al proveedor pronto.',
                              product=product.display_name, qty=self._fmt(orderpoint.qty_on_hand),
                              min=self._fmt(orderpoint.product_min_qty)),
                    'res_model': 'product.product', 'res_id': product.id, 'action': 'request_ingredient',
                })
        return created.ids

    @staticmethod
    def _fmt(qty):
        return f"{qty:g}"

    @api.model
    def waiter_request_ingredient(self, product_id, qty=None):
        """Crea una solicitud de compra (borrador) al proveedor del producto (`product.supplierinfo`).
        Cantidad: la dada, o lo que falta para el máximo de la regla, o el mínimo del proveedor, o 1.
        Marca `action_done` en las notificaciones de inventario del producto.
        Devuelve `{purchase_id, name, partner_id, partner_name, product_qty}`."""
        config = self.env["pos.config"]._waiter_selected_config()
        product = self.env["product.product"].browse(int(product_id)).exists()
        if not product:
            raise UserError(_("El producto no existe."))
        sellers = product.seller_ids
        if not sellers:
            raise UserError(_("%s no tiene proveedor configurado (pestaña Compra del producto).", product.display_name))
        if qty is None:
            orderpoint = self.env["stock.warehouse.orderpoint"].search([("product_id", "=", product.id), ("warehouse_id", "=", config.warehouse_id.id)], limit=1)
            missing = (orderpoint.product_max_qty - orderpoint.qty_on_hand) if orderpoint else 0.0
            qty = missing if missing > 0 else (sellers[0].min_qty or 1.0)
        # El proveedor más barato que sirva esa cantidad; si ninguno cubre el mínimo, el primero de la lista.
        seller = product._select_seller(quantity=qty, date=fields.Date.context_today(self), uom_id=product.uom_id) or sellers[0]
        purchase = self.env["purchase.order"].create({
            "picking_type_id": config.warehouse_id.in_type_id.id, "partner_id": seller.partner_id.id, "origin": _("Waiter: solicitud de ingrediente"),
            "order_line": [(0, 0, {
                "product_id": product.id, "name": product.display_name, "product_qty": qty,
                "product_uom_id": (seller.product_uom_id or product.uom_id).id, "price_unit": seller.price,
                "date_planned": fields.Datetime.now(),
            })],
        })
        self.search([("config_id", "=", config.id), ("kind", "=", "inventory"), ("res_model", "=", "product.product"), ("res_id", "=", product.id),
                     ("action_done", "=", False)]).write({"action_done": True})
        return {"purchase_id": purchase.id, "name": purchase.name, "partner_id": seller.partner_id.id,
                "partner_name": seller.partner_id.display_name, "product_qty": qty}
