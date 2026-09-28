from copy import deepcopy
from odoo.tests import tagged
from odoo.exceptions import AccessError, ValidationError
from .test_kit import KitCase
from ..models.role_permissions import DEFAULTS


@tagged('post_install', '-at_install')
class TestRolePermissions(KitCase):
    def setUp(self):
        super().setUp()
        self.env.user.waiter_role = 'admin'
        self.staff = {}
        for role in ('waiter', 'cashier', 'admin'):
            employee = self.env['hr.employee'].create({'name': 'Permisos ' + role, 'company_id': self.config.company_id.id, 'waiter_role': role})
            self.staff[role] = (employee.id, employee._waiter_new_session())
        self.env['ir.config_parameter'].sudo().set_param('waiter.role_permissions', '')
        self.env['ir.config_parameter'].sudo().set_param('waiter.role_permissions.%s' % self.config.id, '')

    def guard(self, role, model, method, args):
        return self.config._waiter_check_rpc(*self.staff[role], model, method, args)

    def test_defaults_and_admin_only_policy(self):
        self.assertEqual(self.config.waiter_role_policy(*self.staff['waiter']), DEFAULTS)
        with self.assertRaises(AccessError):
            self.config.waiter_role_policy(*self.staff['cashier'], deepcopy(DEFAULTS))
        with self.assertRaises(AccessError):
            self.config.waiter_role_policy(self.staff['admin'][0], 'invalid', deepcopy(DEFAULTS))

    def test_waiter_create_and_serve_but_cannot_pay_even_via_write_or_sync(self):
        self.guard('waiter', 'pos.order', 'sync_from_ui', [[{'state': 'draft'}]])
        self.guard('waiter', 'pos.order.line', 'action_kitchen_line_served', [[1]])
        for method, args in [('add_payment', [[1], {'amount': 1}]), ('action_pos_order_paid', [[1]]), ('write', [[1], {'state': 'paid'}]), ('sync_from_ui', [[{'state': 'paid'}]])]:
            with self.assertRaises(AccessError):
                self.guard('waiter', 'pos.order', method, args)
        with self.assertRaises(AccessError):
            self.guard('waiter', 'pos.payment', 'create', [{'amount': 1}])

    def test_cashier_can_create_and_pay_but_cannot_deliver(self):
        self.guard('cashier', 'pos.order', 'sync_from_ui', [[{'state': 'draft'}]])
        self.guard('cashier', 'pos.order', 'add_payment', [[1], {'amount': 1}])
        with self.assertRaises(AccessError):
            self.guard('cashier', 'pos.order.line', 'action_kitchen_line_served', [[1]])

    def test_saved_grants_and_revocations_apply_immediately(self):
        policy = deepcopy(DEFAULTS)
        policy['waiter']['actions'].append('charge_orders')
        policy['cashier']['actions'].remove('create_orders')
        self.config.waiter_role_policy(*self.staff['admin'], policy)
        self.guard('waiter', 'pos.order', 'add_payment', [[1], {}])
        with self.assertRaises(AccessError):
            self.guard('cashier', 'pos.order', 'sync_from_ui', [[{'state': 'draft'}]])
        self.assertTrue(self.config.waiter_can_charge)
        self.assertEqual(self.config.waiter_role_policy(*self.staff['cashier']), policy)

    def test_invalid_policy_and_company_are_rejected(self):
        policy = deepcopy(DEFAULTS)
        policy['waiter']['views'] = []
        with self.assertRaises(ValidationError):
            self.config.waiter_role_policy(*self.staff['admin'], policy)
        policy = deepcopy(DEFAULTS)
        policy['waiter']['actions'].append('invented_permission')
        with self.assertRaises(ValidationError):
            self.config.waiter_role_policy(*self.staff['admin'], policy)
        with self.assertRaises(AccessError):
            self.guard('waiter', 'ir.config_parameter', 'write', [[1], {'value': 'anything'}])
