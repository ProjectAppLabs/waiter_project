"""Cuadres de caja de Q3 y captura de la persona que completa el cierre."""
import math

from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError

from .business_reports import report_configs, report_period
from .owner_permissions import require_owner

_CLOSING_WRITE = object()


class ResCompany(models.Model):
    _inherit = 'res.company'

    waiter_cash_tolerance = fields.Monetary(string='Tolerancia de diferencia de caja', default=0,
                                            currency_field='currency_id')

    @api.constrains('waiter_cash_tolerance')
    def _check_waiter_cash_tolerance(self):
        if any(not math.isfinite(c.waiter_cash_tolerance) or c.waiter_cash_tolerance < 0 for c in self):
            raise ValidationError('La tolerancia debe ser un importe finito mayor o igual a cero.')

    def write(self, vals):
        if 'waiter_cash_tolerance' in vals and not self.env.su:
            require_owner(self.env)
        return super().write(vals)

    # @api.model: el POS la llama sin registro (`[]`), como las demás del plan Q; sin él, Odoo toma el primer argumento
    # por ids y respondía «list index out of range».
    @api.model
    def waiter_cash_settings(self, tolerance=None):
        company = self or self.env.company
        company.ensure_one()
        if company != self.env.company:
            raise AccessError('Selecciona la empresa activa para consultar su tolerancia.')
        company.check_access('read')
        if tolerance is not None:
            require_owner(self.env)
            if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or tolerance < 0:
                raise ValidationError('La tolerancia debe ser un importe finito mayor o igual a cero.')
            company.sudo().write({'waiter_cash_tolerance': tolerance})
        return {'tolerance': company.waiter_cash_tolerance, 'currency': company.currency_id.name}


class PosSession(models.Model):
    _inherit = 'pos.session'

    waiter_closed_by_id = fields.Many2one('res.users', string='Persona que cerró', readonly=True,
                                          copy=False, ondelete='restrict')

    def write(self, vals):
        if 'waiter_closed_by_id' in vals and self.env.context.get('_waiter_closing_write') is not _CLOSING_WRITE:
            raise AccessError('La persona del cierre se registra al validar la caja.')
        return super().write(vals)

    def _validate_session(self, balancing_account=False, amount_to_balance=0, bank_payment_method_diffs=None):
        """Sobrescribe pos.session._validate_session de Odoo 19, después de su cierre contable.

        Odoo 19 guarda closing_notes, stop_at y user_id (quien abrió), pero no quién cerró.
        Capturamos env.uid al completar la validación; cierres antiguos usan user_id como respaldo.
        Referencia: addons/point_of_sale/models/pos_session.py, rama oficial 19.0.
        """
        self.ensure_one()
        self.check_access('write')
        self.env.cr.execute('SELECT id FROM pos_session WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()
        was_closed = self.state == 'closed'
        actor = self.env.uid
        # La validación necesita leer sus asientos; las nuevas reglas los ocultan al encargado.
        # Esta elevación privada ocurre tras validar el acceso a la sesión y conserva al actor.
        result = super(PosSession, self.sudo())._validate_session(
            balancing_account, amount_to_balance, bank_payment_method_diffs)
        if not was_closed and self.state == 'closed':
            self.sudo().with_context(_waiter_closing_write=_CLOSING_WRITE).write({'waiter_closed_by_id': actor})
            self._waiter_notify_cash_difference()
        return result

    def _waiter_notify_cash_difference(self):
        """El generador vive en notify, que depende de ops; no se invierte esa dependencia."""
        return None

    @api.model
    def waiter_cash_closings(self, date_from, date_to, config_ids=None, only_differences=False):
        configs = report_configs(self.env, config_ids)
        period = report_period(self.env.company, date_from, date_to)
        if type(only_differences) is not bool:
            raise ValidationError('El filtro de diferencias debe ser verdadero o falso.')
        sessions = self.search([
            ('config_id', 'in', configs.ids), ('state', '=', 'closed'),
            ('stop_at', '>=', period['start']), ('stop_at', '<', period['end']),
        ], order='stop_at desc, id desc')
        result = []
        for session in sessions:
            difference = session.cash_register_difference
            if only_differences and session.currency_id.is_zero(difference):
                continue
            actor = session.waiter_closed_by_id or session.user_id
            result.append({'session_id': session.id, 'name': session.name, 'config_id': session.config_id.id,
                           'config_name': session.config_id.name, 'closed_at': session.stop_at.isoformat() + 'Z',
                           'closed_by': {'user_id': actor.id, 'name': actor.name},
                           'expected': session.cash_register_balance_end,
                           'counted': session.cash_register_balance_end_real, 'difference': difference,
                           'notes': session.closing_notes or '',
                           'over_tolerance': abs(difference) > session.company_id.waiter_cash_tolerance})
        return result
