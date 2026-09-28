"""Asigna los registros existentes a su restaurante sin cambiar su estado."""
from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    for row in env['waiter.reservation'].search([('config_id', '=', False)]):
        configs = row.table_id.floor_id.pos_config_ids
        config = row.preorder_id.config_id or configs.sorted('id')[:1]
        if not config:
            raise ValueError('Hay una reserva cuya mesa no pertenece a ningún restaurante.')
        row.config_id = config
    cr.execute('ALTER TABLE waiter_reservation ALTER COLUMN config_id SET NOT NULL')
