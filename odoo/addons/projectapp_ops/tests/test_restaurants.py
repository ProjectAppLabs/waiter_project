"""Contrato O1: aislamiento real con usuarios de Odoo y recursos por restaurante."""
from odoo import Command
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRestaurants(TransactionCase):
    def setUp(self):
        super().setUp()
        self.env.user.waiter_role = 'owner'
        self.model = self.env['pos.config']
        self.first = self.model.browse(self.model.waiter_create_restaurant('Primero prueba O', 'primero-prueba-o')['id'])
        self.first.write({'alert_late_minutes': 27, 'roi_hour_cost': 34567})
        from ..models.gateway_payments import _POLICY_WRITE
        self.first.with_context(_policy_write=_POLICY_WRITE).write({'waiter_kitchen_prepay_roles': ['waiter']})
        if 'reservation_open' in self.first._fields:
            self.first.write({'reservation_open': 11, 'reservation_close': 21})
        self.env['restaurant.table'].create({'floor_id': self.first.floor_ids.id, 'table_number': 1})
        self.second = self.model.browse(self.model.waiter_create_restaurant('Segundo prueba O', 'segundo-prueba-o', self.first.id)['id'])

    def user(self, role, configs, suffix):
        return self.env['res.users'].create({'name': suffix, 'login': 'prueba-o-' + suffix, 'waiter_role': role,
                                            'company_id': self.env.company.id,
                                            'company_ids': [Command.set(self.env.company.ids)],
                                            'waiter_config_ids': [Command.set(configs.ids)]})

    def employee(self, role, configs, suffix):
        return self.env['hr.employee'].create({'name': suffix, 'waiter_role': role,
                                              'company_id': self.env.company.id,
                                              'waiter_config_ids': [Command.set(configs.ids)]})

    def test_record_rules_isolate_orders_sessions_payments_and_configs(self):
        # Falla si un mesero ve datos ajenos, si el encargado pierde alguno de sus locales o si el dueño queda limitado.
        users = [(self.user('waiter', self.second, 'mesero'), self.second),
                 (self.user('admin', self.first | self.second, 'encargado'), self.first | self.second),
                 (self.user('owner', self.model.browse(), 'dueno'), self.first | self.second)]
        sessions = self.env['pos.session']
        orders = self.env['pos.order']
        payments = self.env['pos.payment']
        for config in self.first | self.second:
            session = self.env['pos.session'].create({'config_id': config.id, 'user_id': self.env.uid})
            order = self.env['pos.order'].create({'session_id': session.id, 'amount_tax': 0, 'amount_total': 10,
                                                 'amount_paid': 0, 'amount_return': 0})
            payment = self.env['pos.payment'].create({'pos_order_id': order.id, 'amount': 10,
                                                      'payment_method_id': config.payment_method_ids.filtered('is_cash_count')[:1].id})
            sessions |= session
            orders |= order
            payments |= payment
        for user, expected in users:
            for model, ids, config_field in [('pos.config', (self.first | self.second).ids, 'id'),
                                              ('pos.session', sessions.ids, 'config_id'),
                                              ('pos.order', orders.ids, 'config_id'),
                                              ('pos.payment', payments.ids, 'config_id')]:
                visible = self.env[model].with_user(user).search([('id', 'in', ids)])
                visible_configs = visible if config_field == 'id' else visible.config_id
                self.assertEqual(set(visible_configs.ids), set(expected.ids), model)
            if user.waiter_role == 'waiter':
                forbidden = orders.filtered(lambda o: o.config_id == self.first)
                with self.assertRaises(AccessError):
                    forbidden.with_user(user).read(['amount_total'])

    def test_login_list_has_no_empty_list_fallback_and_assignment_updates_pin_lists(self):
        # Falla si el PIN aparece en otro local o si vaciar la lista permite entrar a todos los empleados de la empresa.
        employee = self.employee('waiter', self.first, 'Mesero de Primero')
        manager = self.employee('admin', self.first | self.second, 'Encargado de ambos')
        staff = self.env['hr.employee']
        self.assertIn(employee.id, [e['id'] for e in staff.waiter_login_list(self.first.id)])
        self.assertNotIn(employee.id, [e['id'] for e in staff.waiter_login_list(self.second.id)])
        self.assertIn(manager, self.first.advanced_employee_ids)
        self.assertIn(manager, self.second.advanced_employee_ids)
        staff.waiter_set_restaurants(employee.id, self.second.ids)
        self.assertNotIn(employee, self.first.basic_employee_ids)
        self.assertIn(employee, self.second.basic_employee_ids)
        self.first.write({'basic_employee_ids': [Command.clear()], 'advanced_employee_ids': [Command.clear()]})
        self.assertNotIn(employee.id, [e['id'] for e in staff.waiter_login_list(self.first.id)])

    def test_roles_validate_number_of_restaurants_and_manager_cannot_expand_scope(self):
        # Falla si un mesero o cajero queda en dos locales, si asignar desde la consola deja a alguien sin local, o si un
        # encargado asigna locales fuera de su alcance. Crear personal sin local (desde RR. HH.) sí se permite.
        for role in ('waiter', 'cashier'):
            with self.assertRaises(ValidationError), self.cr.savepoint():
                self.employee(role, self.first | self.second, 'Inválido')
            with self.assertRaises(ValidationError), self.cr.savepoint():
                self.user(role, self.first | self.second, 'invalido-' + role)
        for role in ('waiter', 'cashier', 'admin'):
            pending = self.employee(role, self.model.browse(), 'Sin local ' + role)
            with self.assertRaises(ValidationError), self.cr.savepoint():
                self.env['hr.employee'].waiter_set_restaurants(pending.id, [])
        manager = self.user('admin', self.first, 'encargado-local')
        employee = self.employee('waiter', self.first, 'Mesero local')
        with self.assertRaises(AccessError), self.cr.savepoint():
            self.env['hr.employee'].with_user(manager).waiter_set_restaurants(employee.id, self.second.ids)
        self.employee('owner', self.model.browse(), 'Dueño sin lista')

    def test_create_restaurant_owns_stock_cash_floor_and_copies_settings(self):
        # Falla si el nuevo restaurante comparte efectivo o almacén, hereda mesas o pierde los ajustes copiados.
        self.assertNotEqual(self.first.warehouse_id, self.second.warehouse_id)
        self.assertEqual(self.second.picking_type_id, self.second.warehouse_id.out_type_id)
        first_cash = self.first.payment_method_ids.filtered('is_cash_count')
        second_cash = self.second.payment_method_ids.filtered('is_cash_count')
        self.assertEqual(len(second_cash), 1)
        self.assertFalse(first_cash & second_cash)
        self.assertNotEqual(first_cash.journal_id, second_cash.journal_id)
        self.assertEqual(len(self.second.floor_ids), 1)
        self.assertFalse(self.second.floor_ids.table_ids)
        self.assertEqual((self.second.alert_late_minutes, self.second.roi_hour_cost), (27, 34567))
        self.assertEqual(self.second.pricelist_id, self.first.pricelist_id)
        self.assertEqual(self.second.waiter_kitchen_prepay_roles, ['waiter'])
        self.assertEqual(self.first.payment_method_ids - first_cash, self.second.payment_method_ids - second_cash)
        if 'reservation_open' in self.second._fields:
            self.assertEqual((self.second.reservation_open, self.second.reservation_close), (11, 21))
        waiter = self.user('waiter', self.second, 'no-crea')
        with self.assertRaises(AccessError):
            self.model.with_user(waiter).waiter_create_restaurant('No permitido', 'no-permitido')

    def test_restaurants_returns_only_assigned_configs_and_exact_keys(self):
        # Falla si el selector expone otro restaurante o cambia las claves pactadas con el POS.
        manager = self.user('admin', self.second, 'lista-local')
        rows = self.model.with_user(manager).waiter_restaurants()
        self.assertEqual([row['id'] for row in rows], self.second.ids)
        self.assertEqual(set(rows[0]), {'id', 'name', 'slug', 'street', 'city', 'phone', 'open', 'salesToday', 'ordersToday'})
        self.assertFalse(rows[0]['open'])

    def test_reassignment_invalidates_cached_record_rules(self):
        # Falla si ir.rule conserva el restaurante anterior después de cambiar la asignación del usuario.
        user = self.user('waiter', self.first, 'reasignado')
        visible = self.model.with_user(user)
        self.assertEqual(visible.search([]), self.first.with_user(user))
        self.env['res.users'].waiter_set_restaurants(user.id, self.second.ids)
        self.assertEqual(visible.search([]), self.second.with_user(user))

    def test_pos_hr_does_not_add_a_local_manager_to_every_restaurant(self):
        # Falla si escribir ajustes reactiva el alta automática de gerentes de pos_hr en restaurantes ajenos.
        user = self.user('admin', self.first, 'gerente-hr')
        employee = self.env['hr.employee'].create({'name': 'Gerente local', 'user_id': user.id,
                                                   'waiter_role': 'admin', 'waiter_config_ids': [Command.set(self.first.ids)]})
        self.second.write({'alert_late_minutes': 33})
        self.assertNotIn(employee, self.second.advanced_employee_ids)
        self.assertNotIn(employee.id, [row['id'] for row in self.env['hr.employee'].waiter_login_list(self.second.id)])
        self.assertIn(employee, self.first.basic_employee_ids)
        self.assertIn(employee, self.first.advanced_employee_ids)

    def test_local_availability_keeps_the_organization_catalog(self):
        # Falla si agotar un plato en un restaurante lo retira del catálogo de toda la organización.
        product = self.env['product.template'].create({'name': 'Plato local', 'available_in_pos': True, 'list_price': 12345})
        product.waiter_set_availability(self.second.id, False)
        self.assertTrue(product.available_in_pos)
        self.assertEqual(product.waiter_unavailable_config_ids, self.second)
        product.waiter_set_availability(self.second.id, True)
        self.assertFalse(product.waiter_unavailable_config_ids)

    def test_banners_and_benefits_are_shared_with_optional_restaurant_restrictions(self):
        # Falla si banners y acciones siguen por config, o si una promoción restringida se aplica en otro restaurante.
        self.env.user.group_ids |= self.env.ref('projectapp_ops.group_waiter_integration')
        banner = {'layout': 'notice', 'title': 'Oferta local', 'subtitle': '', 'button': '', 'target': 'none',
                  'targetId': None, 'image': '', 'theme': 'amber', 'active': True, 'configs': self.second.ids}
        self.first.waiter_banner_settings_integration([banner], dry_run=False)
        self.assertEqual(self.second.waiter_banner_settings()['banners'], [banner])
        self.assertEqual(self.env.company.waiter_menu_banners, [banner])
        self.first.waiter_benefits_settings(action={'action': 'novedades', 'reward': 'descuento', 'active': True,
                                                  'percent': 12, 'configs': self.second.ids})
        action = self.env['waiter.benefit.action'].search([('company_id', '=', self.env.company.id), ('action', '=', 'novedades')])
        self.assertEqual(len(action), 1)
        self.assertFalse(action.config_id)
        self.assertNotIn('novedades', [a['accion'] for a in self.first.waiter_benefit_actions()])
        self.assertIn('novedades', [a['accion'] for a in self.second.waiter_benefit_actions()])
        self.first.waiter_benefits_settings(action={'action': 'cuenta', 'reward': 'descuento', 'active': True,
                                                  'percent': 9, 'configs': self.second.ids})
        self.assertEqual(self.env.company.signup_discount_percent, 9)
        self.assertEqual(self.first.signup_discount_percent, 0)
        self.assertEqual(self.second.signup_discount_percent, 9)
        self.first.waiter_benefits_settings(coupon={'code': 'TODOSO', 'percent': 10, 'minimum': 0})
        coupon = self.env['loyalty.program'].search([('waiter_menu_coupon', '=', True), ('rule_ids.code', '=', 'TODOSO')])
        self.assertFalse(coupon.pos_config_ids)
        self.assertEqual(self.second.waiter_coupon_quote('TODOSO', 100)['porcentaje'], 10)
