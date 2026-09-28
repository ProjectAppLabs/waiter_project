"""Conserva la configuración de primera compra al introducir las acciones del menú."""
from odoo import SUPERUSER_ID, api


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Action = env['waiter.benefit.action'].with_context(active_test=False)
    for config in env['pos.config'].with_context(active_test=False).search([]):
        if not Action.search_count([('config_id', '=', config.id), ('action', '=', 'cuenta')]):
            Action.create({'config_id': config.id, 'action': 'cuenta', 'reward': 'descuento',
                           'active': config.signup_discount_percent > 0,
                           'percent': config.signup_discount_percent if config.signup_discount_percent > 0 else 5})
