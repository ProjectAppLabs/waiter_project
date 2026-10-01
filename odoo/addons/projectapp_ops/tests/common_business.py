"""Datos propios del Plan Q; compatibles con una copia de desarrollo con varias sedes."""
from uuid import uuid4

from odoo import Command
from odoo.tests import TransactionCase


class BusinessCase(TransactionCase):
    def setUp(self):
        super().setUp()
        self.env.user.waiter_role = 'owner'
        self.company = self.env.company
        self.company.resource_calendar_id = self.company.resource_calendar_id.copy({'tz': 'America/Bogota'})
        self.company.waiter_cash_tolerance = 0
        self.first = self._restaurant('Poblado')
        self.second = self._restaurant('Laureles')
        self.owner, self.owner_employee, self.owner_token = self._person('owner', self.env['pos.config'], 'Dueño Q')
        self.manager, self.manager_employee, self.manager_token = self._person('admin', self.first, 'Encargada Poblado Q')
        self.other_manager, _, _ = self._person('admin', self.second, 'Encargado Laureles Q')
        self.cashier, self.cashier_employee, self.cashier_token = self._person('cashier', self.first, 'Cajero Q')
        self.income = self._account('income', 'Ventas Q')
        self.liability = self._account('liability_current', 'Propinas Q')
        self.expense = self._account('expense', 'Faltantes Q')
        self.product = self.env['product.product'].create({
            'name': 'Plato Q', 'type': 'consu', 'available_in_pos': True, 'list_price': 100,
            'taxes_id': [Command.clear()], 'property_account_income_id': self.income.id,
        })
        self.tip = self.env['product.product'].create({
            'name': 'Propina Q', 'type': 'service', 'available_in_pos': True,
            'taxes_id': [Command.clear()], 'property_account_income_id': self.liability.id,
        })
        (self.first | self.second).write({'tip_product_id': self.tip.id, 'cash_control': True})
        for config in self.first | self.second:
            config.payment_method_ids.filtered('is_cash_count').journal_id.write({
                'profit_account_id': self.income.id, 'loss_account_id': self.expense.id,
            })
        self.partner = self.env['res.partner'].create({'name': 'Cliente Q'})
        pricelist = self.env['product.pricelist'].create({
            'name': 'Precios base Q', 'company_id': self.company.id, 'currency_id': self.company.currency_id.id,
        })
        (self.first | self.second).write({
            'pricelist_id': pricelist.id, 'available_pricelist_ids': [Command.set(pricelist.ids)], 'use_pricelist': True,
        })
        # La copia puede conservar permisos personalizados; estas pruebas verifican el contrato predeterminado.
        self.env['ir.config_parameter'].sudo().set_param('waiter.role_permissions', '')
        self.sessions = {}

    def _restaurant(self, label):
        values = self.env['pos.config'].waiter_create_restaurant('Q · ' + label, 'q-' + uuid4().hex)
        return self.env['pos.config'].browse(values['id'])

    def _account(self, kind, label):
        return self.env['account.account'].create({
            'name': label, 'code': str(int(uuid4().hex[:10], 16)), 'account_type': kind,
            'company_ids': [Command.set(self.company.ids)],
        })

    def _person(self, role, configs, label):
        user = self.env['res.users'].create({
            'name': label, 'login': 'q-' + uuid4().hex, 'waiter_role': role,
            'group_ids': [Command.set(self.env.ref('base.group_user').ids)],
            'company_id': self.company.id, 'company_ids': [Command.set(self.company.ids)],
            'waiter_config_ids': [Command.set(configs.ids)],
        })
        employee = self.env['hr.employee'].create({
            'name': label, 'user_id': user.id, 'company_id': self.company.id,
            'waiter_role': role, 'waiter_config_ids': [Command.set(configs.ids)],
        })
        return user, employee, employee._waiter_new_session()

    def _session(self, config=None):
        config = config if config is not None else self.first
        if config.id not in self.sessions or self.sessions[config.id].state == 'closed':
            session = self.env['pos.session'].create({'config_id': config.id, 'user_id': self.owner.id})
            session.set_opening_control(0, '')
            self.sessions[config.id] = session
        return self.sessions[config.id]

    def _order(self, config=None, amount=100, tip=0, state='paid', date='2040-06-15 17:00:00', guests=2,
               product=None, qty=1, tax=0):
        config = config if config is not None else self.first
        product = product if product is not None else self.product
        lines = [Command.create({'product_id': product.id, 'qty': qty, 'price_unit': amount / qty,
                                 'price_subtotal': amount, 'price_subtotal_incl': amount + tax,
                                 'tax_ids': [Command.clear()]})]
        if tip:
            lines.append(Command.create({'product_id': self.tip.id, 'qty': 1, 'price_unit': tip,
                                         'price_subtotal': tip, 'price_subtotal_incl': tip,
                                         'tax_ids': [Command.clear()]}))
        order = self.env['pos.order'].create({
            'session_id': self._session(config).id, 'date_order': date, 'partner_id': self.partner.id,
            'amount_tax': tax, 'amount_total': amount + tax + tip, 'amount_paid': 0, 'amount_return': 0,
            'customer_count': guests, 'lines': lines,
        })
        if state in ('paid', 'done'):
            order.add_payment({'pos_order_id': order.id, 'amount': amount + tax + tip,
                               'payment_method_id': config.payment_method_ids.filtered('is_cash_count')[:1].id})
            # El cobro real del POS (no solo el estado): es lo que deja la venta lista para facturarse y contabilizarse.
            order.action_pos_order_paid()
        if order.state != state:
            order.state = state
        return order

    def _close(self, config=None, difference=0, actor=None, notes='Conteo Q'):
        session = self._session(config)
        session.cash_register_balance_end_real = session.cash_register_balance_end + difference
        session.closing_notes = notes
        session.with_user(actor or self.manager).action_pos_session_closing_control()
        self.assertEqual(session.state, 'closed')
        return session
