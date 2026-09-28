"""Acciones del menú y concesiones de puntos con una clave persistente por premio."""
import uuid

from odoo import api, fields, models
from odoo.exceptions import ValidationError, UserError

from .menu_benefits import manager, number


ACTIONS = [('cuenta', 'Crear y verificar la cuenta'), ('opinion', 'Dejar una opinión'),
           ('novedades', 'Suscribirse a novedades'), ('pago_en_linea', 'Pagar en línea')]
REWARDS = [('descuento', 'Descuento'), ('cupon', 'Cupón'), ('puntos', 'Puntos')]


class BenefitAction(models.Model):
    _name = 'waiter.benefit.action'
    _description = 'Acción que concede un beneficio al comensal'

    config_id = fields.Many2one('pos.config', ondelete='set null', index=True)
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company, index=True)
    pos_config_ids = fields.Many2many('pos.config', string='Restaurantes permitidos')
    action = fields.Selection(ACTIONS, required=True)
    active = fields.Boolean(default=False)
    reward = fields.Selection(REWARDS, required=True, default='descuento')
    percent = fields.Float(default=5)
    coupon_id = fields.Many2one('loyalty.program', ondelete='restrict')
    points = fields.Integer(default=10)
    _company_action_unique = models.Constraint('UNIQUE(company_id, action)', 'La acción ya existe en esta organización.')

    @api.constrains('company_id', 'pos_config_ids', 'reward', 'percent', 'coupon_id', 'points')
    def _check_reward(self):
        for row in self:
            if any(c.company_id != row.company_id for c in row.pos_config_ids):
                raise ValidationError('La restricción debe pertenecer a la organización de la acción.')
            if row.reward == 'descuento':
                number(row.percent, 0, 100)
                if row.percent <= 0:
                    raise ValidationError('El porcentaje debe ser mayor que cero y hasta 100.')
            elif row.reward == 'cupon':
                coupon = row.coupon_id.exists()
                if not coupon or not coupon.waiter_menu_coupon or coupon.company_id != row.company_id:
                    raise ValidationError('Elige un cupón del menú de este POS.')
            # La fila se lee con active_test=False (para ver las inactivas) y ese contexto no debe colarse aquí: con él,
            # un programa de puntos desactivado contaría como disponible.
            elif row.points < 1 or not self.env['loyalty.program'].with_context(active_test=True).search_count([('company_id', 'in', [False, row.company_id.id]), ('pos_ok', '=', True), ('program_type', '=', 'loyalty')]):
                raise ValidationError('Los puntos deben ser positivos y requieren un programa de fidelización del POS.')

    def _sync_signup_discount(self):
        for row in self.filtered(lambda r: r.action == 'cuenta'):
            row.company_id.sudo().signup_discount_percent = row.percent if row.active and row.reward == 'descuento' else 0
        self.env['pos.config'].invalidate_model(['signup_discount_percent'])

    @api.model_create_multi
    def create(self, vals_list):
        rows = super().create(vals_list)
        rows._sync_signup_discount()
        return rows

    def write(self, vals):
        result = super().write(vals)
        self._sync_signup_discount()
        return result


class BenefitGrant(models.Model):
    _name = 'waiter.benefit.grant'
    _description = 'Concesión de puntos por una acción del comensal'

    config_id = fields.Many2one('pos.config', required=True, ondelete='cascade', index=True)
    card_id = fields.Many2one('loyalty.card', required=True, ondelete='restrict')
    key = fields.Char(required=True)
    points = fields.Integer(required=True)
    company_id = fields.Many2one(related='config_id.company_id', store=True, index=True)
    _company_key_unique = models.Constraint('UNIQUE(company_id, key)', 'Este premio ya se concedió.')
    _positive_points = models.Constraint('CHECK(points > 0)', 'Los puntos deben ser positivos.')


class Config(models.Model):
    _inherit = 'pos.config'

    def _waiter_action_settings(self):
        rows = self.env['waiter.benefit.action'].with_context(active_test=False).search([('company_id', '=', self.company_id.id)])
        by_action = {row.action: row for row in rows}
        result = []
        for action, _label in ACTIONS:
            row = by_action.get(action)
            data = {'action': action, 'active': False, 'reward': 'descuento', 'percent': 5, 'couponId': None, 'points': 10, 'configs': []}
            if row:
                data.update(active=row.active, reward=row.reward, percent=row.percent, couponId=row.coupon_id.id or None, points=row.points, configs=row.pos_config_ids.ids)
            elif action == 'cuenta':
                data.update(active=self.signup_discount_percent > 0, percent=self.signup_discount_percent if self.signup_discount_percent > 0 else 5)
            result.append(data)
        return result

    def waiter_benefits_settings(self, coupon=None, loyalty=None, action=None):
        result = super().waiter_benefits_settings(coupon=coupon, loyalty=loyalty)
        if action is not None:
            if (not isinstance(action, dict) or action.get('action') not in dict(ACTIONS)
                    or action.get('reward') not in dict(REWARDS) or type(action.get('active')) is not bool):
                raise ValidationError('Revisa la acción y su premio.')
            percent = number(action.get('percent', 5), 0, 100)
            points = action.get('points', 10)
            coupon_id = action.get('couponId') or False
            if type(points) is not int or not 0 <= points <= 2147483647 or (coupon_id and type(coupon_id) is not int):
                raise ValidationError('Revisa los puntos y el cupón.')
            if coupon_id and not self.env['loyalty.program'].browse(coupon_id).exists():
                raise ValidationError('El cupón indicado no existe.')
            vals = {'company_id': self.company_id.id, 'config_id': False,
                    'pos_config_ids': [(6, 0, self._waiter_validate_restriction(action.get('configs', [])))], 'action': action['action'], 'active': action['active'],
                    'reward': action['reward'], 'percent': percent, 'coupon_id': coupon_id, 'points': points}
            # Serializa también el primer guardado, cuando todavía no existe una fila que bloquear.
            self.env.cr.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ['benefit-action:%s:%s' % (self.company_id.id, action['action'])])
            row = self.env['waiter.benefit.action'].with_context(active_test=False).search([
                ('company_id', '=', self.company_id.id), ('action', '=', action['action'])], limit=1)
            if row:
                row.write(vals)
            else:
                self.env['waiter.benefit.action'].create(vals)
        return {**result, 'actions': self._waiter_action_settings()}

    def waiter_benefit_actions(self):
        self.ensure_one()
        self.check_access('read')
        result = []
        for action in self._waiter_action_settings():
            if not action['active'] or (action['configs'] and self.id not in action['configs']):
                continue
            if action['reward'] == 'descuento':
                prize = {'tipo': 'descuento', 'porcentaje': action['percent']}
            elif action['reward'] == 'cupon':
                program = self.env['loyalty.program'].browse(action['couponId']).exists()
                today = fields.Date.context_today(self)
                if (not program or not program.active or not program.waiter_menu_coupon or (program.pos_config_ids and self not in program.pos_config_ids)
                        or (program.date_from and program.date_from > today) or (program.date_to and program.date_to < today)):
                    continue
                rule = program.rule_ids[:1]
                try:
                    quote = self.waiter_coupon_quote(rule.code, rule.minimum_amount)
                except UserError:
                    continue
                prize = {'tipo': 'cupon', 'codigo': quote['codigo'], 'nombre': quote['nombre'],
                         'porcentaje': quote['porcentaje'], 'minimo': rule.minimum_amount}
            else:
                program = self._waiter_points_program()
                if not program:
                    continue
                prize = {'tipo': 'puntos', 'puntos': action['points'], 'programa': program.name}
            if action['configs']:
                prize['configs'] = action['configs']
            result.append({'accion': action['action'], 'premio': prize})
        return result

    def waiter_grant_points(self, identity, key, points, description):
        manager(self.env)
        self.ensure_one()
        if not isinstance(key, str) or not key or type(points) is not int or not 1 <= points <= 2147483647:
            raise ValidationError('Revisa la clave y los puntos del premio.')
        try:
            account_key = str(uuid.UUID(identity['id']))
        except (ValueError, KeyError, TypeError, AttributeError):
            raise ValidationError('Cuenta inválida.')
        self.env.cr.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ['benefit-grant:%s:%s' % (self.company_id.id, key)])
        grant = self.env['waiter.benefit.grant'].search([('company_id', '=', self.company_id.id), ('key', '=', key)], limit=1)
        if grant:
            if grant.card_id.partner_id.waiter_diner_key != account_key:
                raise ValidationError('La clave de este premio pertenece a otra cuenta.')
            return {'tarjeta': grant.card_id.id, 'puntos': grant.card_id.points, 'otorgados': 0}
        data = self.waiter_diner_benefits(identity)
        if not data['tarjeta']:
            raise UserError('Configura primero un programa de fidelización del POS.')
        card = self.env['loyalty.card'].sudo().browse(data['tarjeta'])
        self.env.cr.execute('SELECT id FROM loyalty_card WHERE id = %s FOR UPDATE', [card.id])
        card.invalidate_recordset(['points'])
        grant = self.env['waiter.benefit.grant'].create({'config_id': self.id, 'card_id': card.id, 'key': key, 'points': points})
        card.points += points
        self.env['loyalty.history'].sudo().create({'card_id': card.id, 'order_model': 'waiter.benefit.grant',
            'order_id': grant.id, 'description': str(description or 'Premio del menú'), 'issued': points, 'used': 0})
        return {'tarjeta': card.id, 'puntos': card.points, 'otorgados': points}
