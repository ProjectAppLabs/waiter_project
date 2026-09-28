"""Menu promotions and paid-order loyalty, using the POS's native programs/cards.

All monetary decisions run here. Experience supplies authenticated account keys;
only a POS manager may provision those identities or change program settings.
"""
import math
import re
import uuid
from collections import defaultdict

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


def manager(env):
    if not env.user.has_group('point_of_sale.group_pos_manager'):
        raise AccessError('Solo un administrador puede administrar los beneficios del menú.')


def number(value, minimum, maximum):
    if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValidationError('Revisa los importes y porcentajes.')
    return value


class Partner(models.Model):
    _inherit = 'res.partner'
    waiter_diner_key = fields.Char(copy=False, index=True, groups='point_of_sale.group_pos_manager')
    _waiter_diner_key_unique = models.Constraint('UNIQUE(waiter_diner_key)', 'Esta cuenta ya está vinculada.')


class Program(models.Model):
    _inherit = 'loyalty.program'
    waiter_menu_coupon = fields.Boolean(copy=False)


class Config(models.Model):
    _inherit = 'pos.config'

    def waiter_benefits_settings(self, coupon=None, loyalty=None):
        manager(self.env)
        self.ensure_one()
        self.check_access('read')
        if coupon is not None:
            if not isinstance(coupon, dict):
                raise ValidationError('Cupón inválido.')
            code = str(coupon.get('code', '')).strip().upper()
            if not re.fullmatch(r'[A-Z0-9_-]{3,32}', code):
                raise ValidationError('Usa un código de 3 a 32 letras, números, guiones o guiones bajos.')
            percent = number(coupon.get('percent'), 0.01, 100)
            minimum = number(coupon.get('minimum'), 0, 1000000000)
            start, end = coupon.get('start') or False, coupon.get('end') or False
            try:
                start = fields.Date.to_date(start) if start else False
                end = fields.Date.to_date(end) if end else False
            except (ValueError, TypeError):
                raise ValidationError('Revisa las fechas del cupón.')
            if start and end and start > end:
                raise ValidationError('La fecha final debe ser posterior a la inicial.')
            vals = {'name': str(coupon.get('name') or code)[:80], 'active': bool(coupon.get('active', True)),
                    'program_type': 'promo_code', 'pos_ok': True, 'pos_config_ids': [(6, 0, self._waiter_validate_restriction(coupon.get('configs', [])))],
                    'company_id': self.company_id.id, 'currency_id': self.currency_id.id,
                    'waiter_menu_coupon': True, 'date_from': start, 'date_to': end, 'limit_usage': False}
            program = self.env['loyalty.program'].with_context(active_test=False).browse(coupon.get('id') or []).exists()
            if program and (not program.waiter_menu_coupon or program.company_id != self.company_id):
                raise AccessError('Este cupón no pertenece a este POS.')
            rule_vals = {'code': code, 'mode': 'with_code', 'minimum_amount': minimum, 'minimum_amount_tax_mode': 'incl',
                         'minimum_qty': 1, 'reward_point_mode': 'order', 'reward_point_amount': 1}
            reward_vals = {'reward_type': 'discount', 'discount_mode': 'percent', 'discount': percent,
                           'discount_applicability': 'order', 'required_points': 1}
            if program:
                program.write(vals)
                program.rule_ids.write(rule_vals)
                program.reward_ids.write(reward_vals)
            else:
                program = self.env['loyalty.program'].create(vals)
                program.write({'rule_ids': [(5, 0, 0), (0, 0, rule_vals)], 'reward_ids': [(5, 0, 0), (0, 0, reward_vals)]})
        program = self._waiter_points_program()
        if loyalty is not None:
            if not program:
                raise UserError('Configura primero un programa de fidelización del POS.')
            spend = number(loyalty.get('spendPerPoint'), 0.01, 1000000000)
            value = number(loyalty.get('valuePerPoint'), 0.01, 1000000000)
            required = number(loyalty.get('minimumPoints'), 1, 1000000000)
            if len(program.rule_ids) != 1 or len(program.reward_ids) != 1:
                raise UserError('Este programa tiene reglas avanzadas. Edítalo desde Odoo.')
            program.rule_ids.write({'reward_point_mode': 'money', 'reward_point_amount': 1 / spend, 'minimum_amount': spend, 'minimum_amount_tax_mode': 'incl'})
            program.reward_ids.write({'discount_mode': 'per_point', 'discount': value, 'required_points': required})
        coupons = self.env['loyalty.program'].with_context(active_test=False).search([
            ('waiter_menu_coupon', '=', True), ('company_id', '=', self.company_id.id)])
        return {'coupons': [{'id': p.id, 'name': p.name, 'active': p.active, 'code': p.rule_ids[:1].code,
                             'configs': p.pos_config_ids.ids, 'percent': p.reward_ids[:1].discount, 'minimum': p.rule_ids[:1].minimum_amount,
                             'start': str(p.date_from) if p.date_from else '', 'end': str(p.date_to) if p.date_to else ''} for p in coupons],
                'loyalty': {'name': program.name, 'spendPerPoint': 1 / program.rule_ids[:1].reward_point_amount,
                            'valuePerPoint': program.reward_ids[:1].discount, 'minimumPoints': program.reward_ids[:1].required_points} if program else None}

    def _waiter_points_program(self):
        self.ensure_one()
        return self._get_program_ids().filtered(lambda p: p.program_type == 'loyalty')[:1]

    def waiter_coupon_quote(self, code, subtotal):
        self.ensure_one()
        self.check_access('read')
        subtotal = number(subtotal, 0, 1000000000)
        code = str(code).strip().upper()
        programs = self._get_program_ids().filtered('waiter_menu_coupon')
        rule = programs.rule_ids.filtered(lambda r: r.active and r.code == code)[:1]
        if not rule:
            raise UserError('Este cupón no existe, está inactivo o no está vigente.')
        reward = rule.program_id.reward_ids
        if (len(reward) != 1 or reward.reward_type != 'discount' or reward.discount_mode != 'percent'
                or reward.discount_applicability != 'order' or reward.discount_max_amount
                or rule.product_ids or rule.product_category_id or rule.product_tag_id
                or rule.product_domain not in (False, '', '[]') or rule.minimum_qty != 1
                or rule.program_id.limit_usage):
            raise UserError('Este cupón tiene condiciones avanzadas. Consulta al administrador.')
        if subtotal < rule.minimum_amount:
            raise UserError('Este cupón requiere un consumo mínimo de %s.' % rule.minimum_amount)
        return {'codigo': code, 'nombre': rule.program_id.name, 'porcentaje': reward.discount,
                'monto': self.currency_id.round(subtotal * reward.discount / 100)}

    def waiter_diner_benefits(self, identity, order_uuid=None):
        manager(self.env)
        self.ensure_one()
        try:
            key = str(uuid.UUID(identity['id']))
        except (ValueError, KeyError, TypeError):
            raise ValidationError('Cuenta inválida.')
        # Serialize provision of partner and card even across distinct table visits.
        self.env.cr.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ['diner-benefits:' + key])
        partner = self.env['res.partner'].search([('waiter_diner_key', '=', key)], limit=1)
        if not partner:
            partner = self.env['res.partner'].create({'waiter_diner_key': key, 'name': str(identity.get('name') or 'Comensal')[:80],
                                                       'email': str(identity.get('email') or '')[:254], 'phone': str(identity.get('phone') or '')[:30]})
        program = self._waiter_points_program()
        card = self._waiter_card(partner, program) if program else self.env['loyalty.card']
        earned = 0
        if card and order_uuid:
            order = self.env['pos.order'].search([('uuid', '=', str(order_uuid)), ('config_id', '=', self.id)], limit=1)
            if order.state in ('paid', 'done', 'invoiced'):
                history = self.env['loyalty.history'].search([('card_id', '=', card.id), ('order_model', '=', 'pos.order'), ('order_id', '=', order.id)])
                earned = sum(history.mapped('issued'))
        return {'tarjeta': card.id or None, 'codigo': card.code or '', 'puntos': card.points or 0,
                'ganados': earned, 'programa': program.name or '',
                'valorPunto': program.reward_ids[:1].discount if program else 0,
                'minimoCanje': program.reward_ids[:1].required_points if program else 0}

    def _waiter_card(self, partner, program):
        self.env.cr.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ['loyalty-card:%s:%s' % (partner.id, program.id)])
        card = self.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id), ('program_id', '=', program.id)], limit=1)
        if not card:
            card = self.env['loyalty.card'].sudo().with_context(action_no_send_mail=True).create({'partner_id': partner.id, 'program_id': program.id, 'points': 0})
        return card


class OrderLine(models.Model):
    _inherit = 'pos.order.line'
    waiter_loyalty_card_id = fields.Many2one('loyalty.card', copy=False)
    waiter_earned_points = fields.Float(copy=False, readonly=True)
    waiter_coupon_code = fields.Char(copy=False)
    waiter_points_redemption = fields.Boolean(default=False)


class Order(models.Model):
    _inherit = 'pos.order'
    waiter_loyalty_settled = fields.Boolean(copy=False, readonly=True)

    def write(self, vals):
        result = super().write(vals)
        if vals.get('state') in ('paid', 'done', 'invoiced'):
            self._waiter_settle_points()
        return result

    def _compute_line_price(self, line):
        # pos_self_order otherwise replaces every line price by its product's
        # list price (zero for a loyalty reward), erasing an actual POS redemption.
        if line.waiter_points_redemption and line.is_reward_line and line.reward_id.discount_mode == 'per_point':
            # Keep the amount quoted when the reservation was created, even if
            # the administrator changes the point value before this bill is paid.
            line.tax_ids = False
            self._compute_line_subtotals(line)
            return
        return super()._compute_line_price(line)

    def waiter_redeem_points(self, card_id):
        self.ensure_one()
        self.check_access('write')
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError('Necesitas acceso al POS para canjear puntos.')
        self.env.cr.execute('SELECT id FROM pos_order WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()
        if self.state != 'draft' or self.amount_paid:
            raise UserError('Solo puedes canjear antes de comenzar el cobro.')
        card = self.env['loyalty.card'].sudo().browse(int(card_id)).exists()
        if not card or card.program_id != self.config_id._waiter_points_program():
            raise UserError('La tarjeta no pertenece al programa de este POS.')
        if card.expiration_date and card.expiration_date < fields.Date.context_today(self):
            raise UserError('La tarjeta está vencida.')
        existing = self.lines.filtered(lambda l: l.is_reward_line and l.points_cost > 0)
        if existing:
            if existing.coupon_id != card:
                raise UserError('El pedido ya tiene un canje de otra tarjeta.')
            return {'amount': -sum(existing.mapped('price_subtotal_incl')), 'points': sum(existing.mapped('points_cost'))}
        self.env.cr.execute('SELECT id FROM loyalty_card WHERE id = %s FOR UPDATE', [card.id])
        card.invalidate_recordset(['points'])
        reward = card.program_id.reward_ids.filtered(lambda r: r.reward_type == 'discount' and r.discount_mode == 'per_point')[:1]
        reserved = sum(self.env['pos.order.line'].sudo().search([
            ('coupon_id', '=', card.id), ('is_reward_line', '=', True), ('order_id.state', '=', 'draft')]).mapped('points_cost'))
        available = card.points - reserved
        if not reward or reward.discount <= 0 or available < reward.required_points:
            raise UserError('No tienes suficientes puntos disponibles para este canje.')
        points = min(math.floor(available), math.floor(self.amount_total / reward.discount))
        if points < reward.required_points:
            raise UserError('El importe del pedido no alcanza el mínimo de canje.')
        amount = self.currency_id.round(points * reward.discount)
        self.write({'lines': [(0, 0, {'product_id': reward.discount_line_product_id.id, 'qty': 1,
            'price_unit': -amount, 'price_type': 'manual', 'price_subtotal': -amount, 'price_subtotal_incl': -amount, 'tax_ids': [(6, 0, [])],
            'full_product_name': card.program_id.name, 'is_reward_line': True, 'reward_id': reward.id,
            'coupon_id': card.id, 'points_cost': points, 'waiter_points_redemption': True, 'uuid': str(uuid.uuid4())})]})
        if not self.partner_id:
            self.partner_id = card.partner_id
        self.recompute_prices()
        return {'amount': amount, 'points': points}

    def _waiter_settle_points(self):
        for order in self.sorted('id'):
            if order.state not in ('paid', 'done', 'invoiced'):
                continue
            self.env.cr.execute('SELECT id FROM pos_order WHERE id = %s FOR UPDATE', [order.id])
            order.invalidate_recordset(['waiter_loyalty_settled'])
            if order.waiter_loyalty_settled:
                continue
            changes = defaultdict(float)
            program = order.config_id._waiter_points_program()
            default_card = order.config_id._waiter_card(order.partner_id, program) if order.partner_id and program else self.env['loyalty.card']
            for line in order.lines.filtered(lambda l: not l.is_reward_line):
                original = line.refunded_orderline_id
                if original:
                    card = original.waiter_loyalty_card_id
                    earned = original.waiter_earned_points * line.qty / original.qty if original.qty else 0
                else:
                    card = line.waiter_loyalty_card_id or default_card
                    earned = 0
                    if card and card.program_id in order.config_id._get_program_ids() and line.qty > 0:
                        for rule in card.program_id.rule_ids.filtered(lambda r: r.mode == 'auto' and r.reward_point_mode == 'money'):
                            eligible = order.lines.filtered(lambda l: l.waiter_loyalty_card_id == card or (not l.waiter_loyalty_card_id and card == default_card))
                            eligible = eligible.filtered(lambda l: not l.is_reward_line and l.qty > 0 and l.product_id != order.config_id.tip_product_id and l.product_id.filtered_domain(rule._get_valid_product_domain()))
                            field = 'price_subtotal_incl' if rule.minimum_amount_tax_mode == 'incl' else 'price_subtotal'
                            subtotal = sum(eligible.mapped(field))
                            redemption = max(0, -sum(order.lines.filtered(lambda l: l.is_reward_line and l.coupon_id == card).mapped(field)))
                            net = max(0, subtotal - redemption)
                            if line in eligible and subtotal > 0 and sum(eligible.mapped('qty')) >= rule.minimum_qty and net >= rule.minimum_amount:
                                earned += max(0, line[field]) * net / subtotal * rule.reward_point_amount
                if card:
                    line.write({'waiter_loyalty_card_id': card.id, 'waiter_earned_points': round(earned, 2)})
                    changes[card.id] += round(earned, 2)
            earned_changes = dict(changes)
            for reward_line in order.lines.filtered(lambda l: l.is_reward_line and l.coupon_id and l.points_cost):
                changes[reward_line.coupon_id.id] -= reward_line.points_cost * reward_line.qty
            for card_id, amount in sorted(changes.items()):
                self.env.cr.execute('SELECT id FROM loyalty_card WHERE id = %s FOR UPDATE', [card_id])
                card = self.env['loyalty.card'].sudo().browse(card_id)
                card.invalidate_recordset(['points'])
                # Standard POS may already have posted this same program/order.
                if self.env['loyalty.history'].sudo().search_count([('card_id', '=', card_id), ('order_model', '=', 'pos.order'), ('order_id', '=', order.id)]):
                    continue
                card.points += amount
                if amount:
                    self.env['loyalty.history'].sudo().create({'card_id': card_id, 'order_model': 'pos.order', 'order_id': order.id,
                        'description': 'Compra %s' % order.pos_reference, 'issued': max(0, earned_changes.get(card_id, 0), amount), 'used': max(0, earned_changes.get(card_id, 0), amount) - amount})
            order.waiter_loyalty_settled = True
