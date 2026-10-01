"""Q2 y Q3: cifras, periodos y aislamiento de informes del negocio."""
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import tagged

from .common_business import BusinessCase


@tagged('post_install', '-at_install')
class TestOrganizationSummary(BusinessCase):
    def _summary(self, start='2040-06-15', end='2040-06-16'):
        return self.env['pos.config'].with_user(self.owner).waiter_org_summary(start, end)

    def test_restaurants_and_organization_totals(self):
        # Falla si mezcla sedes, promedia tickets sin ponderar o suma propinas como ventas.
        before = self._summary()['total']
        self._order(amount=100, tip=10, guests=2, tax=8)
        self._order(amount=200, guests=3, state='done')
        self._order(self.second, amount=600, tip=60, guests=4, state='done')
        self._order(amount=9000, state='draft')
        self._order(amount=9000, state='cancel')
        result = self._summary()
        rows = {row['config_id']: row for row in result['restaurants']}
        first, second = rows[self.first.id], rows[self.second.id]
        self.assertEqual((first['sales'], first['orders'], first['ticket'], first['guests'], first['tips']), (308, 2, 154, 5, 10))
        self.assertEqual((second['sales'], second['orders'], second['ticket'], second['guests'], second['tips']), (600, 1, 600, 4, 60))
        for key, delta in {'sales': 908, 'orders': 3, 'guests': 9, 'tips': 70}.items():
            self.assertEqual(result['total'][key] - before[key], delta)
            self.assertEqual(result['total'][key], sum(row[key] for row in rows.values()))
        self.assertEqual(result['total']['ticket'], result['total']['sales'] / result['total']['orders'])
        self.assertEqual(result['currency'], self.company.currency_id.name)

    def test_previous_period_and_company_timezone(self):
        # Falla si usa la zona del navegador, excluye el último día o compara periodos de distinta duración.
        self._order(amount=10, date='2040-06-13 05:00:00')
        self._order(amount=20, date='2040-06-15 04:59:59')
        self._order(amount=100, date='2040-06-15 05:00:00')
        self._order(amount=200, date='2040-06-17 04:59:59')
        self._order(amount=9000, date='2040-06-13 04:59:59')
        self._order(amount=9000, date='2040-06-17 05:00:00')
        result = self.env['pos.config'].with_user(self.owner).with_context(tz='Asia/Tokyo').waiter_org_summary('2040-06-15', '2040-06-16')
        row = next(r for r in result['restaurants'] if r['config_id'] == self.first.id)
        self.assertEqual((result['previous_from'], result['previous_to']), ('2040-06-13', '2040-06-14'))
        self.assertEqual((row['sales'], row['previous']['sales'], row['previous']['orders']), (300, 30, 2))
        self.assertEqual(row['previous']['ticket'], 15)

    def test_refunds_subtract_sales_and_tips(self):
        # Falla si el reembolso se suma en positivo, se omite o vuelve la propina parte de la venta.
        self._order(amount=100, tip=10)
        self._order(amount=-40, tip=-4, qty=-1, guests=0)
        row = next(r for r in self._summary()['restaurants'] if r['config_id'] == self.first.id)
        self.assertEqual((row['sales'], row['tips'], row['orders'], row['ticket']), (60, 6, 2, 30))

    def test_summary_is_only_for_owner(self):
        # Falla si el grupo administrador del POS basta para consultar cifras de toda la organización.
        for user in (self.manager, self.cashier):
            with self.assertRaises(AccessError):
                self.env['pos.config'].with_user(user).waiter_org_summary('2040-06-15', '2040-06-16')
        self.assertIn('total', self._summary())

    def test_empty_period_and_invalid_dates(self):
        # Falla si una sede sin ventas divide por cero o acepta fechas incompletas y rangos invertidos.
        row = next(r for r in self._summary()['restaurants'] if r['config_id'] == self.first.id)
        self.assertEqual((row['sales'], row['ticket'], row['orders'], row['previous']['ticket']), (0, 0, 0, 0))
        for start, end in [('2040-06-17', '2040-06-15'), ('15/06/2040', '2040-06-16'), (None, '2040-06-16')]:
            with self.assertRaises(ValidationError):
                self._summary(start, end)


@tagged('post_install', '-at_install')
class TestCashClosings(BusinessCase):
    def _historical_close(self, config, difference, date, actor=None):
        self._order(config, amount=100)
        session = self._close(config, difference, actor=actor)
        session.stop_at = date
        return session

    def _closings(self, user=None, configs=None, only=False):
        return self.env['pos.session'].with_user(user or self.owner).waiter_cash_closings(
            '2040-06-15', '2040-06-16', configs, only)

    def test_difference_tolerance_identity_note_and_order(self):
        # Falla si calcula mal la diferencia, atribuye el cierre a quien abrió o pierde nota y orden.
        self.company.waiter_cash_settings(20)
        first = self._historical_close(self.first, -21, '2040-06-15 17:00:00', self.manager)
        second = self._historical_close(self.second, 20, '2040-06-16 17:00:00', self.other_manager)
        rows = self._closings(configs=(self.first | self.second).ids)
        self.assertEqual([r['session_id'] for r in rows], [second.id, first.id])
        row = rows[1]
        self.assertEqual((row['expected'], row['counted'], row['difference'], row['over_tolerance']), (100, 79, -21, True))
        self.assertEqual(row['closed_by'], {'user_id': self.manager.id, 'name': self.manager.name})
        self.assertNotEqual(first.user_id, first.waiter_closed_by_id)
        self.assertEqual((row['notes'], row['closed_at']), ('Conteo Q', '2040-06-15T17:00:00Z'))
        self.assertFalse(rows[0]['over_tolerance'])

    def test_only_differences_includes_differences_within_tolerance(self):
        # Falla si «solo diferencias» significa por error «solo superiores a la tolerancia».
        self.company.waiter_cash_settings(20)
        zero = self._historical_close(self.first, 0, '2040-06-15 17:00:00')
        small = self._historical_close(self.first, 1, '2040-06-16 17:00:00')
        rows = self._closings(configs=self.first.ids, only=True)
        self.assertEqual([r['session_id'] for r in rows], [small.id])
        self.assertFalse(rows[0]['over_tolerance'])
        self.assertIn(zero.id, [r['session_id'] for r in self._closings(configs=self.first.ids)])

    def test_manager_can_only_report_assigned_restaurants(self):
        # Falla si omitir el filtro o mezclar un id ajeno permite al encargado consultar otra sede.
        own = self._historical_close(self.first, 1, '2040-06-15 17:00:00')
        self._historical_close(self.second, 2, '2040-06-15 18:00:00', self.other_manager)
        self.assertEqual([r['session_id'] for r in self._closings(user=self.manager)], [own.id])
        for configs in (self.second.ids, (self.first | self.second).ids):
            with self.assertRaises(AccessError):
                self._closings(user=self.manager, configs=configs)
        with self.assertRaises(AccessError):
            self._closings(user=self.cashier)
        self.assertEqual(len(self._closings(configs=(self.first | self.second).ids)), 2)

    def test_cash_settings_write_requires_owner(self):
        # Falla si el encargado cambia la tolerancia por método o por write directo.
        company = self.company.with_user(self.manager)
        self.assertEqual(company.waiter_cash_settings()['tolerance'], 0)
        with self.assertRaises(AccessError):
            company.waiter_cash_settings(2000)
        with self.assertRaises(AccessError):
            company.write({'waiter_cash_tolerance': 2000})
        self.assertEqual(self.company.with_user(self.owner).waiter_cash_settings(2000),
                         {'tolerance': 2000, 'currency': self.company.currency_id.name})
        for value in (-1, float('inf'), float('nan'), True):
            with self.assertRaises(ValidationError):
                self.company.with_user(self.owner).waiter_cash_settings(value)

    def test_historical_session_uses_opener_and_closed_at_company_bounds(self):
        # Falla si los cierres anteriores a Q3 no tienen responsable o el filtro usa la zona del usuario.
        session = self._session()
        session.write({'state': 'closed', 'stop_at': '2040-06-17 04:59:59', 'closing_notes': False})
        self.assertFalse(session.waiter_closed_by_id)
        rows = self._closings(configs=self.first.ids)
        self.assertEqual(rows[0]['closed_by']['user_id'], self.owner.id)
        self.assertEqual(rows[0]['notes'], '')
        session.stop_at = '2040-06-17 05:00:00'
        self.assertFalse(self._closings(configs=self.first.ids))

    def test_closing_person_cannot_be_forged(self):
        # Falla si un campo readonly se puede falsificar mediante RPC o un contexto inventado.
        session = self._session()
        with self.assertRaises(AccessError):
            session.with_user(self.manager).write({'waiter_closed_by_id': self.owner.id})
        with self.assertRaises(AccessError):
            session.with_user(self.manager).with_context(_waiter_closing_write=True).write({'waiter_closed_by_id': self.owner.id})

    def test_cash_settings_by_rpc_without_record(self):
        # Falla si la tolerancia no se puede leer ni guardar como la llama el POS: sin registro (`[]`) por RPC.
        from odoo.service.model import call_kw
        self.assertEqual(call_kw(self.env['res.company'].with_user(self.owner), 'waiter_cash_settings', [], {'tolerance': 1500})['tolerance'], 1500)
        self.assertEqual(call_kw(self.env['res.company'].with_user(self.manager), 'waiter_cash_settings', [], {})['tolerance'], 1500)
