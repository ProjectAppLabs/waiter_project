"""One atomic, idempotent POS settlement for a verified external payment."""
import re
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

_POLICY_WRITE = object()
_ROLES = ('waiter', 'cashier', 'admin', 'owner')


class PosConfig(models.Model):
    _inherit = 'pos.config'
    waiter_kitchen_prepay_roles = fields.Json(default=list, copy=False)

    def write(self, vals):
        if 'waiter_kitchen_prepay_roles' in vals and self.env.context.get('_policy_write') is not _POLICY_WRITE:
            raise AccessError('Configura el cobro previo desde el administrador con tu sesión de empleado.')
        return super().write(vals)

    def waiter_kitchen_policy(self, employee_id=None, token=None, roles=None):
        self.ensure_one()
        self.check_access('read')
        if self.company_id not in self.env.companies:
            raise AccessError('El terminal no pertenece a la compañía activa.')
        if roles is not None:
            from .floor_plan import authorize
            authorize(self.env, employee_id, token)
            self.check_access('write')
            if not isinstance(roles, list) or any(r not in _ROLES for r in roles):
                raise ValidationError('Rol de restaurante inválido.')
            self.with_context(_policy_write=_POLICY_WRITE).write({'waiter_kitchen_prepay_roles': list(dict.fromkeys(roles))})
        return {'require_payment_roles': self.waiter_kitchen_prepay_roles or []}



class PosPayment(models.Model):
    _inherit = 'pos.payment'
    waiter_gateway_reference = fields.Char(copy=False, index=True)
    _gateway_reference_unique = models.Constraint('UNIQUE(waiter_gateway_reference)', 'Este pago de pasarela ya fue registrado.')


class PosOrder(models.Model):
    _inherit = 'pos.order'
    waiter_requires_payment = fields.Boolean(default=False, copy=False)

    def action_pos_order_paid(self):
        result = super().action_pos_order_paid()
        for order in self.filtered(lambda o: o.state in ('paid', 'done', 'invoiced')):
            lines = order.lines.filtered(lambda line: not line.course_id and not line.is_reward_line and not line.waiter_cancelled)
            if lines:
                self.env['restaurant.order.course'].kitchen_fire(order.id, lines.ids)
        return result

    def waiter_gateway_check(self, payment_method_id, amount_in_cents):
        self.ensure_one()
        self.check_access('write')
        if not self.env.user.has_group('point_of_sale.group_pos_manager'):
            raise AccessError('La conciliación de pasarelas requiere un administrador del POS.')
        if type(amount_in_cents) is not int or amount_in_cents <= 0:
            raise ValidationError('Monto de pasarela inválido.')
        if self.company_id not in self.env.companies:
            raise ValidationError('La cuenta no pertenece a la compañía activa.')
        method = self.env['pos.payment.method'].browse(payment_method_id).exists()
        if not method or method not in self.session_id.config_id.payment_method_ids or method.type != 'bank':
            raise UserError('Configura un medio de pago bancario del POS para Wompi.')
        if self.session_id.state != 'opened' or self.state not in ('draft',):
            raise UserError('La cuenta o la caja ya no está abierta.')
        if round((self.amount_total - self.amount_paid) * 100) != amount_in_cents:
            raise UserError('El saldo cambió. Revisa el pago antes de conciliar.')
        return True

    def waiter_gateway_paid(self, payment_method_id, amount_in_cents, reference):
        self.ensure_one()
        self.check_access('write')
        if not self.env.user.has_group('point_of_sale.group_pos_manager'):
            raise AccessError('La conciliación de pasarelas requiere un administrador del POS.')
        if not isinstance(reference, str) or not re.fullmatch(r'waiter-[0-9a-f]{32}', reference):
            raise ValidationError('Referencia de pasarela inválida.')
        self.env.cr.execute('SELECT id FROM pos_order WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()
        existing = self.env['pos.payment'].search([('waiter_gateway_reference', '=', reference)], limit=1)
        if existing:
            if existing.pos_order_id != self or existing.payment_method_id.id != payment_method_id or round(existing.amount * 100) != amount_in_cents:
                raise ValidationError('La referencia pertenece a otro pago.')
            return {'paid': self.state in ('paid', 'done', 'invoiced'), 'payment_id': existing.id}
        self.waiter_gateway_check(payment_method_id, amount_in_cents)
        before = self.payment_ids
        self.add_payment({'pos_order_id': self.id, 'payment_method_id': payment_method_id, 'amount': amount_in_cents / 100})
        payment = self.payment_ids - before
        payment.ensure_one()
        payment.waiter_gateway_reference = reference
        self.action_pos_order_paid()
        return {'paid': self.state in ('paid', 'done', 'invoiced'), 'payment_id': payment.id}


class RestaurantOrderCourse(models.Model):
    _inherit = 'restaurant.order.course'

    @api.model
    def kitchen_fire(self, order_id, line_ids, employee_id=None, token=None):
        order = self.env['pos.order'].browse(order_id).exists()
        order.check_access('write')
        if order and order.state not in ('paid', 'done', 'invoiced'):
            config = order.session_id.config_id
            required = config.waiter_kitchen_prepay_roles or []
            employee = self.env['hr.employee'].sudo().browse(employee_id).exists() if type(employee_id) is int else None
            if employee_id is not None or token is not None:
                if (not employee or not employee.active or employee.company_id != order.company_id or
                        order.company_id not in self.env.companies or not employee._waiter_session_ok(token)):
                    raise AccessError('Inicia sesión con el PIN del empleado para enviar a cocina.')
                user_role = self.env.user.waiter_role or 'waiter'
                role = _ROLES[min(_ROLES.index(user_role), _ROLES.index(employee.waiter_role))]
                if role in required:
                    raise UserError('Tu rol debe cobrar el pedido antes de enviarlo a cocina.')
            elif order.waiter_requires_payment or required:
                raise UserError('Este pedido debe pagarse antes de enviarlo a cocina. La excepción requiere un empleado autorizado.')
        return super().kitchen_fire(order_id, line_ids)
