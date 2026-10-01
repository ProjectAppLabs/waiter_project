"""Avisos del cierre real, con el mismo alcance que los accesos fuera de turno."""
from odoo import models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _waiter_notify_cash_difference(self):
        super()._waiter_notify_cash_difference()
        notifications = self.env['waiter.notification'].sudo()
        for session in self.filtered(lambda s: s.state == 'closed'):
            difference = session.cash_register_difference
            if abs(difference) <= session.company_id.waiter_cash_tolerance:
                continue
            recipients = session.config_id._waiter_management_recipients()
            existing = notifications.search([
                ('kind', '=', 'cash'), ('config_id', '=', session.config_id.id),
                ('res_model', '=', 'pos.session'), ('res_id', '=', session.id),
            ]).user_id
            actor = session.waiter_closed_by_id or session.user_id
            # «Faltante» o «sobrante» dice más que un signo: «$ -12.000» se leía como un error de formato.
            amount = format(abs(difference), ',.0f').replace(',', '.')
            kind = 'un faltante' if difference < 0 else 'un sobrante'
            body = 'Caja de %s cerró con %s de $ %s (%s)' % (session.config_id.name, kind, amount, actor.name)
            notifications.create([{
                'kind': 'cash', 'config_id': session.config_id.id, 'user_id': user.id,
                'title': 'Diferencia en el cierre de caja', 'body': body,
                'res_model': 'pos.session', 'res_id': session.id,
            } for user in recipients - existing])
