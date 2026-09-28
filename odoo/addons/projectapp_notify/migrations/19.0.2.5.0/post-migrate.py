"""Asigna los registros existentes a su restaurante sin cambiar su estado."""
from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    first = env['pos.config'].search([], order='id', limit=1)
    for row in env['waiter.notification'].search([('config_id', '=', False)]):
        order = env['pos.order'].browse(row.res_id).exists() if row.res_model == 'pos.order' else env['pos.order']
        row.config_id = order.config_id or first
    cr.execute('ALTER TABLE waiter_notification ALTER COLUMN config_id SET NOT NULL')
