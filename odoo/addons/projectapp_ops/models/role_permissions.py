"""Política de roles de la organización, compartida por la navegación y las acciones."""
import json
from odoo import models
from odoo.exceptions import AccessError, ValidationError

ROLES = ('waiter', 'cashier', 'admin')
VIEWS = ('dashboard', 'tables', 'orders', 'reservations', 'history', 'inventory', 'kitchen', 'sales', 'customers', 'billing')
ACTIONS = ('create_orders', 'charge_orders', 'serve_orders', 'edit_inventory')
DEFAULTS = {
    'waiter': {'views': ['tables'], 'actions': ['create_orders', 'serve_orders']},
    'cashier': {'views': ['orders'], 'actions': ['create_orders', 'charge_orders']},
    'admin': {'views': list(VIEWS), 'actions': list(ACTIONS)},
}


def employee_role(env, employee_id, token):
    employee = env['hr.employee'].sudo().browse(employee_id).exists() if type(employee_id) is int else None
    if (not employee or not employee.active or employee.company_id not in env.companies or
            not employee._waiter_session_ok(token)):
        raise AccessError('Inicia sesión con el PIN de tu empleado para continuar.')
    ranks = ROLES + ('owner',)
    role = min(ranks.index(env.user.waiter_role or 'waiter'), ranks.index(employee.waiter_role or 'waiter'))
    return employee, ranks[role]


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def _waiter_role_policy(self):
        self.ensure_one()
        raw = self.env['ir.config_parameter'].sudo().get_param('waiter.role_permissions')
        raw = raw or self.env['ir.config_parameter'].sudo().get_param('waiter.role_permissions.%s' % self.id)
        return json.loads(raw) if raw else json.loads(json.dumps(DEFAULTS))

    def waiter_role_policy(self, employee_id=None, token=None, policy=None):
        self.ensure_one()
        self.check_access('read')
        employee, role = employee_role(self.env, employee_id, token)
        if self.company_id != employee.company_id or (employee.waiter_role != 'owner' and self not in employee.waiter_config_ids):
            raise AccessError('El empleado no pertenece a este restaurante.')
        if policy is not None:
            if role not in ('admin', 'owner'):
                raise AccessError('Solo un administrador puede cambiar los permisos por rol.')
            self.check_access('write')
            if not isinstance(policy, dict) or set(policy) != set(ROLES):
                raise ValidationError('Debes configurar los tres roles del restaurante.')
            for key in ROLES:
                row = policy[key]
                if not isinstance(row, dict) or set(row) != {'views', 'actions'}:
                    raise ValidationError('Configuración de permisos inválida.')
                for field, allowed in [('views', VIEWS), ('actions', ACTIONS)]:
                    if not isinstance(row[field], list) or any(value not in allowed for value in row[field]):
                        raise ValidationError('Permiso desconocido.')
                    row[field] = list(dict.fromkeys(row[field]))
                if not row['views']:
                    raise ValidationError('Cada rol necesita al menos una vista.')
                if 'create_orders' in row['actions'] and not set(row['views']) & {'tables', 'orders'}:
                    raise ValidationError('Crear pedidos requiere Mesas o Pedidos.')
                if 'charge_orders' in row['actions'] and not set(row['views']) & {'tables', 'orders'}:
                    raise ValidationError('Cobrar requiere Mesas o Pedidos.')
                if 'serve_orders' in row['actions'] and 'tables' not in row['views']:
                    raise ValidationError('Entregar y atender mesas requiere la vista Mesas.')
            policy['admin'] = json.loads(json.dumps(DEFAULTS['admin']))
            self.env['ir.config_parameter'].sudo().set_param('waiter.role_permissions', json.dumps(policy))
            # Compatibilidad con los formularios antiguos: una sola decisión de cobro e inventario.
            self.env['pos.config'].sudo().search([('company_id', '=', self.company_id.id)]).write({
                'waiter_can_charge': 'charge_orders' in policy['waiter']['actions'],
                'waiter_can_edit_inventory': 'edit_inventory' in policy['waiter']['actions']})
        return self._waiter_role_policy()

    def _waiter_require_permission(self, role, permission):
        self.ensure_one()
        if role in ('admin', 'owner'):
            return
        policy = self._waiter_role_policy()[role]
        if permission not in policy['views'] + policy['actions']:
            raise AccessError('Tu rol no tiene permiso para esta acción. Consulta al administrador.')

    def _waiter_check_rpc(self, employee_id, token, model, method, args):
        """Autoriza ambos endpoints de datos sin confiar en el rol enviado por el navegador."""
        employee, role = employee_role(self.env, employee_id, token)
        self.ensure_one()
        if employee.company_id != self.company_id or (employee.waiter_role != 'owner' and self not in employee.waiter_config_ids):
            raise AccessError('El empleado no pertenece a este restaurante.')
        self.check_access('read')
        if method == 'waiter_create_restaurant' and role != 'owner':
            raise AccessError('Solo el dueño puede crear restaurantes.')
        permission = None
        values = args[1] if len(args) > 1 and isinstance(args[1], dict) else {}
        mutation = method in ('create', 'write', 'unlink', 'copy')
        if model == 'pos.order':
            if method in ('sync_from_ui', 'create', 'copy', 'action_pos_order_cancel'):
                permission = 'create_orders'
                if method in ('sync_from_ui', 'create'):
                    rows = args[0] if args and isinstance(args[0], list) else [args[0]] if args else []
                    for row in rows:
                        if row.get('state', 'draft') != 'draft' or row.get('payment_ids') or row.get('amount_paid'):
                            self._waiter_require_permission(role, 'charge_orders')
            elif method in ('add_payment', 'action_pos_order_paid', 'waiter_gateway_paid', 'waiter_gateway_check'):
                permission = 'charge_orders'
            elif method.startswith('waiter_billing') or method in ('waiter_account_invoice', 'action_pos_order_invoice'):
                permission = 'billing'
            elif method == 'write':
                if set(values) & {'payment_ids', 'amount_paid', 'amount_return', 'is_tipped', 'tip_amount', 'state'}:
                    permission = 'charge_orders'
                elif 'lines' in values:
                    permission = 'create_orders'
        elif model == 'pos.payment' and mutation:
            permission = 'charge_orders'
        elif model == 'pos.order.line':
            if method == 'action_kitchen_line_served':
                permission = 'serve_orders'
            elif method == 'action_kitchen_line_ready':
                permission = 'kitchen'
            elif mutation or method == 'waiter_cancel_lines':
                permission = 'create_orders'
        elif model == 'restaurant.order.course':
            if method == 'kitchen_fire':
                permission = 'create_orders'
            elif method == 'action_kitchen_served':
                permission = 'serve_orders'
            elif method in ('action_kitchen_start', 'action_kitchen_ready'):
                permission = 'kitchen'
        elif model == 'restaurant.table' and method == 'set_waiter_call':
            permission = 'serve_orders'
        elif model in ('product.template', 'product.product', 'stock.quant') and (mutation or method == 'waiter_set_availability'):
            permission = 'edit_inventory'
        elif model == 'account.move':
            permission = 'billing'
        elif mutation and model in ('res.users', 'hr.employee', 'res.company', 'pos.config', 'restaurant.floor', 'restaurant.table', 'ir.config_parameter'):
            permission = 'admin'
        if permission:
            self._waiter_require_permission(role, permission)
