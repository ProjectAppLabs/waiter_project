"""Descuento de primera compra de la app del comensal (Plan H), en `pos.config` y sin vistas.

El restaurante decide el porcentaje (o lo apaga con 0) desde Configuración del POS; la experiencia del
comensal (`experience/`) lo lee con la carta por `pos.session.load_data` y lo aplica de verdad al confirmar:
las líneas del comensal con cuenta verificada viajan con `pos.order.line.discount`, una sola vez por cuenta.
Vive en Odoo para que todas las tablets y el comensal vean el mismo valor.
"""
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = "pos.config"

    signup_discount_percent = fields.Float(compute='_compute_signup_discount', inverse='_inverse_signup_discount', compute_sudo=True)

    @api.depends('company_id.signup_discount_percent')
    def _compute_signup_discount(self):
        actions = self.env['waiter.benefit.action'].with_context(active_test=False).search([
            ('company_id', 'in', self.company_id.ids), ('action', '=', 'cuenta'),
        ])
        for config in self:
            action = actions.filtered(lambda a: a.company_id == config.company_id)[:1]
            excluded = action and action.pos_config_ids and config not in action.pos_config_ids
            config.signup_discount_percent = 0 if excluded else config.company_id.signup_discount_percent

    def _inverse_signup_discount(self):
        for config in self:
            config.company_id.sudo().signup_discount_percent = config.signup_discount_percent

    def _load_pos_data_fields(self, *args, **kwargs):
        # Odoo devuelve [] para pos.config: "todos los campos", este incluido. Si algún día devuelve una lista
        # concreta, se agrega el propio; nunca se reemplaza [] por una lista (igual que en ops.py).
        fields_ = super()._load_pos_data_fields(*args, **kwargs)
        if not fields_:
            return fields_
        return fields_ + ["signup_discount_percent"]


class ResCompany(models.Model):
    _inherit = 'res.company'

    signup_discount_percent = fields.Float(string='Descuento de primera compra (%)', default=5.0, digits=(5, 2))
