"""Q3: avisos emitidos por el cierre real, con destinatarios de la sede."""
from odoo.exceptions import UserError
from odoo.tests import tagged

from odoo.addons.projectapp_ops.tests.common_business import BusinessCase


@tagged('post_install', '-at_install')
class TestCashNotifications(BusinessCase):
    def _notifications(self, session):
        return self.env['waiter.notification'].sudo().search([
            ('kind', '=', 'cash'), ('res_model', '=', 'pos.session'), ('res_id', '=', session.id),
        ])

    def test_close_notifies_owner_and_only_local_managers(self):
        # Falla si la diferencia no avisa al dueño y encargado local o avisa a un encargado de otra sede.
        self.company.waiter_cash_settings(2000)
        self._order(amount=20000)
        session = self._close(difference=-12000, actor=self.manager)
        notifications = self._notifications(session)
        self.assertIn(self.owner, notifications.user_id)
        self.assertIn(self.manager, notifications.user_id)
        self.assertNotIn(self.other_manager, notifications.user_id)
        self.assertNotIn(self.cashier, notifications.user_id)
        self.assertEqual(set(notifications.user_id.ids), set(self.first._waiter_management_recipients().ids))
        self.assertEqual(notifications.config_id, self.first)
        self.assertEqual(set(notifications.mapped('body')), {
            'Caja de %s cerró con $ -12.000 de diferencia (%s)' % (self.first.name, self.manager.name),
        })
        session._waiter_notify_cash_difference()
        self.assertEqual(self._notifications(session), notifications)

    def test_difference_equal_or_below_tolerance_does_not_notify(self):
        # Falla si el umbral es inclusivo o si se notifica una caja que cuadra dentro de tolerancia.
        self.company.waiter_cash_settings(2000)
        for difference in (0, 1000, -2000, 2000):
            with self.subTest(difference=difference):
                self._order(amount=20000)
                session = self._close(difference=difference)
                self.assertFalse(self._notifications(session))

    def test_zero_default_tolerance_and_other_restaurant_recipients(self):
        # Falla si tolerancia cero desactiva avisos o si reutiliza los encargados de la primera sede.
        self._order(self.second, amount=100)
        session = self._close(self.second, difference=1, actor=self.other_manager)
        recipients = self._notifications(session).user_id
        self.assertIn(self.owner, recipients)
        self.assertIn(self.other_manager, recipients)
        self.assertNotIn(self.manager, recipients)

    def test_failed_close_never_emits_cash_notification(self):
        # Falla si el aviso aparece al iniciar el control de cierre, antes de que Odoo confirme la caja.
        self._order(state='draft')
        session = self._session()
        session.cash_register_balance_end_real = 100
        with self.assertRaises(UserError):
            session.with_user(self.manager).action_pos_session_closing_control()
        self.assertNotEqual(session.state, 'closed')
        self.assertFalse(session.waiter_closed_by_id)
        self.assertFalse(self._notifications(session))
