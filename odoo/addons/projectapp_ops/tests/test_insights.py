from datetime import timedelta

from odoo import fields
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestSalesInsights(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.env['pos.config'].search([('module_pos_restaurant', '=', True)], limit=1)
        cls.session = cls.config.current_session_id or cls.env['pos.session'].create({'config_id': cls.config.id})
        cls.burger, cls.soda = (cls.env['product.product'].create({'name': name, 'list_price': 1000, 'available_in_pos': True}) for name in ('Hamburguesa de prueba', 'Gaseosa de prueba'))

    def _order(self, days_ago, lines, state='paid'):
        total = sum(qty * price for _p, qty, price in lines)
        return self.env['pos.order'].create({
            'session_id': self.session.id, 'config_id': self.config.id, 'state': state, 'date_order': fields.Datetime.now() - timedelta(days=days_ago),
            'amount_tax': 0, 'amount_total': total, 'amount_paid': total, 'amount_return': 0,
            'lines': [(0, 0, {'product_id': p.id, 'qty': qty, 'price_unit': price, 'price_subtotal': qty * price, 'price_subtotal_incl': qty * price}) for p, qty, price in lines]})

    # Las pruebas corren sobre una copia de la base de desarrollo, que ya trae ventas: se comparan diferencias.
    # Falla si el historial deja de sumar por día, si cuenta pedidos sin pagar, si la ventana de 28 días o la de los 28
    # anteriores se corren, si la propina cuenta como plato o si ventas de hace más de 84 días entran a la predicción.
    def test_history_sums_paid_sales_per_day_and_units_per_product_in_two_windows(self):
        before = self.config.waiter_sales_insights()
        tip = self.config.tip_product_id or self.env['product.product'].create({'name': 'Propina de prueba', 'available_in_pos': True})
        self.config.tip_product_id = tip
        self._order(1, [(self.burger, 3, 20000), (self.soda, 1, 5000), (tip, 1, 9000)])
        self._order(1, [(self.burger, 2, 20000)])
        self._order(1, [(self.burger, 50, 20000)], state='draft')
        self._order(40, [(self.burger, 4, 20000)])
        self._order(100, [(self.burger, 7, 20000)])
        after = self.config.waiter_sales_insights()

        def day(data, days_ago):
            iso = (fields.Date.to_date(data['today']) - timedelta(days=days_ago)).isoformat()
            return next((r for r in data['daily'] if r['date'] == iso), {'total': 0.0, 'orders': 0})
        self.assertEqual(day(after, 1)['total'] - day(before, 1)['total'], 114000)
        self.assertEqual(day(after, 1)['orders'] - day(before, 1)['orders'], 2)
        self.assertEqual(day(after, 40)['orders'] - day(before, 40)['orders'], 1)
        self.assertFalse(any(r['date'] < (fields.Date.to_date(after['today']) - timedelta(days=84)).isoformat() for r in after['daily']))

        rows = {p['product_id']: p for p in after['products']}
        self.assertEqual((rows[self.burger.id]['qty'], rows[self.burger.id]['amount'], rows[self.burger.id]['prev_qty']), (5, 100000, 4))
        self.assertEqual((rows[self.soda.id]['qty'], rows[self.soda.id]['prev_qty'], rows[self.soda.id]['template_id']), (1, 0, self.soda.product_tmpl_id.id))
        self.assertNotIn(tip.id, rows)
        # Horas pico: solo los últimos 28 días (los 2 pedidos de ayer, no los de hace 40 o 100 días) y en hora local.
        self.assertEqual(sum(h['orders'] for h in after['hourly']) - sum(h['orders'] for h in before['hourly']), 2)
        self.assertTrue(all(0 <= h['hour'] <= 23 for h in after['hourly']))
        self.assertEqual(after['products'], sorted(after['products'], key=lambda p: -p['qty']))

    # Hallazgo de la revisión con Codex. Falla si un plato que se vendía en los 28 días anteriores y dejó de venderse
    # desaparece del historial: «menos pedidos» perdería justo la señal más útil («bajó 100 %»).
    def test_a_dish_that_stopped_selling_keeps_its_previous_quantity(self):
        stopped = self.env['product.product'].create({'name': 'Plato que dejó de venderse', 'list_price': 1000, 'available_in_pos': True})
        self._order(40, [(stopped, 6, 1000)])
        row = next(p for p in self.config.waiter_sales_insights()['products'] if p['product_id'] == stopped.id)
        self.assertEqual((row['qty'], row['prev_qty'], row['amount']), (0, 6, 0))


    # Falla si el tablero suma por día en la zona del usuario y no en la de la empresa: quien no la tiene configurada sumaba
    # en UTC, y una venta del domingo a las 11 p. m. en Bogotá salía el lunes («esta semana»), distinta del resumen del dueño.
    def test_days_are_counted_in_the_company_timezone(self):
        company = self.config.company_id
        company.resource_calendar_id.tz = 'America/Bogota'
        self.env.user.tz = False
        before = self.config.waiter_sales_insights()
        order = self._order(0, [(self.burger, 1, 20000)])
        today = fields.Date.to_date(before['today'])
        # 23:30 de ayer en Bogotá = 04:30 UTC de hoy.
        order.date_order = fields.Datetime.to_datetime(f'{today.isoformat()} 04:30:00')
        after = self.config.waiter_sales_insights()
        yesterday = (today - timedelta(days=1)).isoformat()
        total = lambda data, day: next((r['total'] for r in data['daily'] if r['date'] == day), 0.0)
        self.assertEqual(total(after, yesterday) - total(before, yesterday), 20000)
        self.assertEqual(total(after, today.isoformat()) - total(before, today.isoformat()), 0)
