import uuid
from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged
from odoo.tests.common import new_test_user
from .test_kit import KitCase
from odoo.addons.point_of_sale.tests.common import CommonPosTest


@tagged('post_install', '-at_install', 'menu_benefits')
class TestMenuBenefits(CommonPosTest):
    _order = KitCase._order

    def setUp(self):
        super().setUp()
        self.config = self.pos_config_usd
        self.env['waiter.benefit.action'].with_context(active_test=False).search([
            ('company_id', '=', self.config.company_id.id)]).unlink()
        self.session = self.env['pos.session'].create({'config_id': self.config.id})
        self.session.action_pos_session_open()
        self.env['waiter.seed'].seed_loyalty()
        self.product = self.env['product.product'].create({'name': 'Plato de prueba', 'available_in_pos': True, 'list_price': 12000, 'taxes_id': [(6, 0, [])]})

    def _member(self):
        identity = {'id': str(uuid.uuid4()), 'name': 'Comensal de prueba', 'email': 'benefits@example.invalid'}
        data = self.config.waiter_diner_benefits(identity)
        return identity, self.env['loyalty.card'].browse(data['tarjeta'])

    def _coupon(self, **overrides):
        coupon = {'name': 'Descuento prueba', 'code': 'TEST' + uuid.uuid4().hex[:12].upper(), 'percent': 20, 'minimum': 10000, 'active': True}
        coupon.update(overrides)
        data = self.config.waiter_benefits_settings(coupon=coupon)
        return next(c for c in data['coupons'] if c['code'] == coupon['code'])

    def _pay(self, order):
        method = self.config.payment_method_ids.filtered(lambda m: m.type == 'cash')[:1] or self.config.payment_method_ids[:1]
        order.add_payment({'pos_order_id': order.id, 'payment_method_id': method.id, 'amount': order.amount_total})
        order.action_pos_order_paid()

    def test_coupon_uses_pos_program_and_validates_minimum_and_dates(self):
        c = self._coupon()
        self.assertEqual(self.config.waiter_coupon_quote(c['code'].lower(), 12000)['monto'], 2400)
        with self.assertRaises(UserError):
            self.config.waiter_coupon_quote(c['code'], 9999)
        c.update(end=str(fields.Date.today() - timedelta(days=1)))
        self.config.waiter_benefits_settings(coupon=c)
        with self.assertRaises(UserError):
            self.config.waiter_coupon_quote(c['code'], 12000)
        with self.assertRaises(ValidationError):
            self.config.waiter_benefits_settings(coupon={**c, 'percent': 101})

    def test_cashier_cannot_change_programs_or_provision_diner_identity(self):
        user = new_test_user(self.env, login='benefits-cashier', groups='point_of_sale.group_pos_user',
                             waiter_config_ids=[(6, 0, self.config.ids)])
        with self.assertRaises(AccessError):
            self.config.with_user(user).waiter_benefits_settings()
        with self.assertRaises(AccessError):
            self.config.with_user(user).waiter_diner_benefits({'id': str(uuid.uuid4())})

    def test_points_are_paid_only_and_idempotent_and_visible_on_same_card(self):
        identity, card = self._member()
        order = self._order(uuid=str(uuid.uuid4()))
        order.lines.waiter_loyalty_card_id = card
        self.assertEqual(card.points, 0)
        self._pay(order)
        self.assertAlmostEqual(card.points, 12)
        order._waiter_settle_points()
        order.write({'state': 'paid'})
        self.assertAlmostEqual(card.points, 12)
        data = self.config.waiter_diner_benefits(identity, order.uuid)
        self.assertEqual((data['tarjeta'], data['puntos'], data['ganados']), (card.id, 12, 12))
        self.assertEqual(len(card.history_ids), 1)

    def test_shared_table_only_rewards_owned_lines_and_refund_reverses_points(self):
        _, card = self._member()
        _, other = self._member()
        order = self._order()
        order.lines.waiter_loyalty_card_id = card
        order.lines.copy({'order_id': order.id, 'waiter_loyalty_card_id': other.id})
        order.recompute_prices()
        self._pay(order)
        self.assertAlmostEqual(card.points, 12)
        self.assertAlmostEqual(other.points, 12)
        original = order.lines.filtered(lambda l: l.waiter_loyalty_card_id == card)
        refund = self._order()
        refund.lines.write({'qty': -1, 'price_subtotal': -12000, 'price_subtotal_incl': -12000, 'refunded_orderline_id': original.id})
        refund.recompute_prices()
        self._pay(refund)
        self.assertAlmostEqual(card.points, 0)
        self.assertAlmostEqual(other.points, 12)
        refund._waiter_settle_points()
        self.assertAlmostEqual(card.points, 0)

    def test_coordinates_require_valid_pair_including_zero(self):
        self.env.company.write({'waiter_latitude': '0', 'waiter_longitude': '0'})
        with self.assertRaises(ValidationError):
            self.env.company.write({'waiter_latitude': '91'})

    def test_redemption_is_reserved_atomically_and_charged_once_at_payment(self):
        _, card = self._member()
        card.points = 200
        order = self._order()
        result = order.waiter_redeem_points(card.id)
        self.assertEqual(result, {'amount': 2000, 'points': 200})
        self.assertEqual(card.points, 200, 'Draft only reserves points')
        self.assertEqual(order.waiter_redeem_points(card.id), result)
        card.program_id.reward_ids.discount = 20
        order.recompute_prices()
        self.assertEqual(order.amount_total, 10000, 'Changing point value cannot change an existing reservation')
        another = self._order()
        with self.assertRaises(UserError):
            another.waiter_redeem_points(card.id)
        self._pay(order)
        self.assertEqual(card.points, 10, 'Earn on net paid consumption')
        order._waiter_settle_points()
        self.assertEqual(card.points, 10)
        self.assertEqual((card.history_ids.issued, card.history_ids.used), (10, 200))

    def test_cancelled_draft_releases_redemption_and_minimum_is_enforced(self):
        _, card = self._member()
        order = self._order()
        card.points = 99
        with self.assertRaises(UserError):
            order.waiter_redeem_points(card.id)
        card.points = 200
        order.waiter_redeem_points(card.id)
        order.write({'state': 'cancel'})
        another = self._order()
        self.assertEqual(another.waiter_redeem_points(card.id)['points'], 200)

    def test_admin_points_rate_applies_to_paid_orders(self):
        self.config.waiter_benefits_settings(loyalty={'spendPerPoint': 200, 'valuePerPoint': 10, 'minimumPoints': 50})
        _, card = self._member()
        self.assertEqual(card.program_id.rule_ids.minimum_amount, 200)
        self.product.list_price = 500
        order = self._order()
        order.lines.waiter_loyalty_card_id = card
        order.recompute_prices()
        self._pay(order)
        self.assertEqual(card.points, 2.5)

    def _action(self, action='opinion', **overrides):
        values = {'action': action, 'active': True, 'reward': 'descuento', 'percent': 12, 'couponId': None, 'points': 10}
        values.update(overrides)
        return self.config.waiter_benefits_settings(action=values)

    def test_action_defaults_and_signup_compatibility(self):
        # Falla si desaparecen las cuatro filas, cambia su orden o se pierde el descuento anterior.
        self.config.signup_discount_percent = 7
        rows = self.config.waiter_benefits_settings()['actions']
        self.assertEqual([r['action'] for r in rows], ['cuenta', 'opinion', 'novedades', 'pago_en_linea'])
        self.assertEqual(rows[0], {'action': 'cuenta', 'active': True, 'reward': 'descuento', 'percent': 7, 'couponId': None, 'points': 10, 'configs': []})
        self.assertEqual(rows[1], {'action': 'opinion', 'active': False, 'reward': 'descuento', 'percent': 5, 'couponId': None, 'points': 10, 'configs': []})
        self.assertEqual(self.config.waiter_benefit_actions(), [{'accion': 'cuenta', 'premio': {'tipo': 'descuento', 'porcentaje': 7}}])
        self._action('cuenta', percent=15)
        self.assertEqual(self.config.signup_discount_percent, 15)
        self._action('cuenta', active=False)
        self.assertEqual(self.config.signup_discount_percent, 0)
        self.assertFalse(self.config.waiter_benefit_actions())
        self._action('cuenta', reward='puntos', points=40)
        self.assertEqual(self.config.signup_discount_percent, 0)
        self.assertEqual(self.env['waiter.benefit.action'].with_context(active_test=False).search_count([
            ('company_id', '=', self.config.company_id.id), ('action', '=', 'cuenta')]), 1)

    def test_actions_validate_prizes_and_venue(self):
        # Falla si se guarda un porcentaje inválido, puntos sin programa o se rechaza un cupón de toda la organización.
        for invalid in ({'percent': 0}, {'percent': 101}, {'percent': float('nan')}, {'percent': float('inf')},
                        {'reward': 'puntos', 'points': 0}, {'reward': 'puntos', 'points': 1.5}, {'reward': 'cupon'}):
            with self.assertRaises(ValidationError), self.env.cr.savepoint():
                self._action(**invalid)
        coupon = self._coupon()
        program = self.env['loyalty.program'].browse(coupon['id'])
        self._action(reward='cupon', couponId=program.id)
        program.pos_config_ids = False
        self._action(reward='cupon', couponId=program.id)
        self.assertFalse(program.pos_config_ids)
        points_program = self.config._waiter_points_program()
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            self._action(reward='cupon', couponId=points_program.id)
        # Sin ningún programa de puntos: la copia de la base puede traer otros, también los que no se atan a un POS.
        self.config._get_program_ids().filtered(lambda p: p.program_type == 'loyalty').write({'active': False})
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            self._action(reward='puntos')

    def test_active_actions_omit_unavailable_coupons_and_points(self):
        # Falla si el menú promete un cupón vencido/inactivo o puntos de un programa desactivado.
        self.config.signup_discount_percent = 0
        coupon = self._coupon()
        self._action(reward='cupon', couponId=coupon['id'])
        self._action('novedades', reward='puntos', points=25)
        rows = self.config.waiter_benefit_actions()
        self.assertEqual(rows[0], {'accion': 'opinion', 'premio': {'tipo': 'cupon', 'codigo': coupon['code'],
            'nombre': coupon['name'], 'porcentaje': 20, 'minimo': 10000}})
        self.assertEqual(rows[1], {'accion': 'novedades', 'premio': {'tipo': 'puntos', 'puntos': 25,
            'programa': self.config._waiter_points_program().name}})
        program = self.env['loyalty.program'].browse(coupon['id'])
        for change in ({'active': False}, {'active': True, 'date_to': fields.Date.today() - timedelta(days=1)},
                       {'date_to': False, 'date_from': fields.Date.today() + timedelta(days=1)}):
            program.write(change)
            self.assertEqual([a['accion'] for a in self.config.waiter_benefit_actions()], ['novedades'])
        self.config._get_program_ids().filtered(lambda p: p.program_type == 'loyalty').write({'active': False})
        self.assertFalse(self.config.waiter_benefit_actions())

    def test_points_grant_is_idempotent_and_audited(self):
        # Falla si un reintento duplica el saldo o usa una tarjeta distinta a la cuenta del comensal.
        identity, card = self._member()
        key = 'cuenta:%s:' % identity['id']
        result = self.config.waiter_grant_points(identity, key, 30, 'Premio por verificar la cuenta')
        self.assertEqual(result, {'tarjeta': card.id, 'puntos': 30, 'otorgados': 30})
        self.assertEqual(self.config.waiter_grant_points(identity, key, 50, 'Reintento'),
                         {'tarjeta': card.id, 'puntos': 30, 'otorgados': 0})
        grant = self.env['waiter.benefit.grant'].search([('config_id', '=', self.config.id), ('key', '=', key)])
        self.assertEqual((len(grant), grant.points), (1, 30))
        history = self.env['loyalty.history'].search([('order_model', '=', 'waiter.benefit.grant'), ('order_id', '=', grant.id)])
        self.assertEqual((len(history), history.card_id, history.issued, history.used), (1, card, 30, 0))
        self.config.waiter_grant_points(identity, 'opinion:%s:pedido' % identity['id'], 10, 'Premio por opinar')
        self.assertEqual(self.config.waiter_diner_benefits(identity)['puntos'], 40)
        other, _ = self._member()
        with self.assertRaises(ValidationError):
            self.config.waiter_grant_points(other, key, 30, 'Otra cuenta')

    def test_grant_requires_positive_integer_points_and_program(self):
        # Falla si el administrador acredita cantidades inválidas o sin programa de puntos.
        identity, card = self._member()
        for points in (0, -1, 1.5, True):
            with self.assertRaises(ValidationError):
                self.config.waiter_grant_points(identity, 'invalido', points, 'Premio')
        self.config._get_program_ids().filtered(lambda p: p.program_type == 'loyalty').write({'active': False})
        with self.assertRaises(UserError):
            self.config.waiter_grant_points(identity, 'sin-programa', 10, 'Premio')
        self.assertEqual(card.points, 0)

    def test_cashier_only_reads_actions_and_grants(self):
        # Falla si el cajero cambia acciones o se otorga puntos mediante RPC o acceso directo al modelo.
        self._action()
        user = new_test_user(self.env, login='actions-cashier', groups='point_of_sale.group_pos_user',
                             waiter_config_ids=[(6, 0, self.config.ids)])
        self.assertTrue(self.config.with_user(user).waiter_benefit_actions())
        with self.assertRaises(AccessError):
            self.config.with_user(user).waiter_benefits_settings(action={'action': 'opinion'})
        with self.assertRaises(AccessError):
            self.config.with_user(user).waiter_grant_points({'id': str(uuid.uuid4())}, 'clave', 100, 'Premio')
        for model in ('waiter.benefit.action', 'waiter.benefit.grant'):
            with self.assertRaises(AccessError):
                self.env[model].with_user(user).check_access('create')

    def test_action_migration_preserves_enabled_disabled_and_existing_settings(self):
        # Falla si actualizar el addon cambia el porcentaje, activa un descuento apagado o duplica una acción.
        import runpy
        from pathlib import Path
        migrate = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'migrations/19.0.2.4.0/post-migrate.py'))['migrate']
        Action = self.env['waiter.benefit.action'].with_context(active_test=False)
        Action.search([('company_id', '=', self.config.company_id.id), ('action', '=', 'cuenta')]).unlink()
        self.config.signup_discount_percent = 9
        migrate(self.env.cr, '19.0.2.3.0')
        migrate(self.env.cr, '19.0.2.3.0')
        row = Action.search([('company_id', '=', self.config.company_id.id), ('action', '=', 'cuenta')])
        self.assertEqual((len(row), row.active, row.percent), (1, True, 9))
        row.unlink()
        self.config.signup_discount_percent = 0
        migrate(self.env.cr, '19.0.2.3.0')
        row = Action.search([('company_id', '=', self.config.company_id.id), ('action', '=', 'cuenta')])
        self.assertEqual((row.active, row.percent, self.config.signup_discount_percent), (False, 5, 0))
        self._action('cuenta', reward='puntos', points=25)
        migrate(self.env.cr, '19.0.2.3.0')
        self.assertEqual(row.reward, 'puntos')
