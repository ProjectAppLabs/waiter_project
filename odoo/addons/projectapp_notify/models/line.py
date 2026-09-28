"""Generador de cocina: cuando un plato queda listo (`waiter_ready_date`), su aviso al mesero.

El aviso es por plato y no por comanda porque cocina saca los platos de uno en uno: si se
esperara a que la comanda entera estuviera lista, el primero se enfriaría en el pase.
"""
from odoo import _, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    def write(self, vals):
        newly_ready = self.filtered(lambda l: not l.waiter_ready_date) if vals.get("waiter_ready_date") else self.browse()
        result = super().write(vals)
        if newly_ready:
            newly_ready._waiter_notify_ready()
        return result

    def _waiter_notify_ready(self):
        values = []
        for line in self.filtered(lambda l: not l.waiter_cancelled):
            order = line.order_id
            where = _("Mesa %s", order.table_id.table_number) if order.table_id else (getattr(order, "waiter_number", False) or order.name)
            values.append({
                "config_id": order.config_id.id, "kind": "kitchen", "title": _("Plato listo para servir"),
                "body": _("%(product)s · %(where)s", product=line.full_product_name or line.product_id.display_name, where=where),
                "res_model": "pos.order", "res_id": order.id, "action": "serve",
            })
        return self.env["waiter.notification"].sudo().create(values)
