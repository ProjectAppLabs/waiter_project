"""Vincula el empleado verificado a la sesión HTTP y exige permisos del POS en el servidor."""
from odoo import http
from odoo.http import request
from odoo.exceptions import AccessError
from odoo.addons.web.controllers.dataset import DataSet
from odoo.addons.web.controllers.session import Session
from ..models.role_permissions import employee_role


class WaiterDataSet(DataSet):
    def _waiter_guard(self, model, method, args, kwargs):
        context = dict(kwargs.get('context') or {})
        supplied = context.pop('waiter_pos_identity', None)
        kwargs = {**kwargs, 'context': context}
        # El intercambio del PIN y el cierre del turno ya verifican sus propias credenciales.
        if model == 'hr.employee' and method in ('waiter_start_my_shift', 'waiter_check_pin', 'waiter_end_shift', 'waiter_forgot_pin', 'waiter_login_list'):
            return kwargs
        identity = supplied or request.session.get('waiter_pos_identity')
        if not identity:
            return kwargs
        if not isinstance(identity, dict):
            raise AccessError('Sesión de empleado inválida.')
        try:
            employee, role = employee_role(request.env, identity.get('id'), identity.get('token'))
        except AccessError:
            request.session.pop('waiter_pos_identity', None)
            raise
        if supplied:
            request.session['waiter_pos_identity'] = {'id': employee.id, 'token': identity['token'], 'config_id': identity.get('config_id')}
        if model == 'hr.employee' and method in (
                'waiter_invite_person', 'waiter_update_person', 'waiter_resend_invite', 'waiter_deactivate_person'):
            if role not in ('admin', 'owner'):
                raise AccessError('Tu rol no puede administrar personas.')
            if role == 'admin':
                # También limita la identidad antigua por PIN cuando la cuenta del terminal era dueña.
                values = args[0] if args and method == 'waiter_invite_person' else (
                    args[1] if len(args) > 1 and method == 'waiter_update_person' else kwargs.get('values', {}))
                target = request.env['hr.employee'].sudo().browse()
                if method != 'waiter_invite_person':
                    target_id = args[0] if args else kwargs.get('employee_id')
                    if type(target_id) is not int:
                        raise AccessError('Indica la persona.')
                    target = target.with_context(active_test=False).browse(target_id).exists()
                if (not isinstance(values, dict) or values.get('role') == 'owner' or
                        any(row.waiter_role == 'owner' for row in target) or
                        not isinstance(values.get('config_ids', []), list) or
                        any(type(i) is not int for i in values.get('config_ids', [])) or
                        not (set(target.waiter_config_ids.ids) | set(values.get('config_ids', []))) <= set(employee.waiter_config_ids.ids)):
                    raise AccessError('El encargado solo puede administrar personas de sus restaurantes.')
            return kwargs
        # La consola puede listar o crear locales antes de seleccionar uno para operar.
        if model == 'pos.config' and method in ('waiter_restaurants', 'waiter_create_restaurant'):
            if role not in ('admin', 'owner') or (method == 'waiter_create_restaurant' and role != 'owner'):
                raise AccessError('Tu rol no puede administrar los restaurantes.')
            if role != 'owner':
                context['waiter_restaurant_ids'] = employee.waiter_config_ids.ids
            return kwargs
        if model in ('hr.employee', 'res.users') and method == 'waiter_set_restaurants':
            if role not in ('admin', 'owner'):
                raise AccessError('Tu rol no puede asignar restaurantes.')
            if role != 'owner':
                record_id = args[0] if args else kwargs.get('employee_id', kwargs.get('user_id'))
                ids = args[1] if len(args) > 1 else kwargs.get('config_ids')
                if type(record_id) is not int or not isinstance(ids, list) or any(type(i) is not int for i in ids):
                    raise AccessError('Indica el operador y sus restaurantes.')
                target = request.env[model].sudo().browse(record_id).exists()
                if (not target or target.waiter_role == 'owner' or
                        not (set(target.waiter_config_ids.ids) | set(ids)) <= set(employee.waiter_config_ids.ids)):
                    raise AccessError('El encargado solo puede asignar sus propios restaurantes.')
            return kwargs
        configs = request.env['pos.config']
        if model == 'pos.config' and args and isinstance(args[0], list) and all(type(value) is int for value in args[0]):
            configs = configs.browse(args[0]).exists()
        elif model == 'pos.order' and method == 'sync_from_ui':
            sessions = request.env['pos.session'].browse([row['session_id'] for row in args[0]])
            configs = sessions.config_id
        elif model == 'pos.order' and args and isinstance(args[0], list) and all(type(value) is int for value in args[0]):
            configs = request.env['pos.order'].browse(args[0]).exists().session_id.config_id
        elif model == 'pos.order.line' and args and isinstance(args[0], list) and method != 'create':
            if all(type(value) is int for value in args[0]):
                configs = request.env['pos.order.line'].browse(args[0]).exists().order_id.session_id.config_id
        if model == 'restaurant.order.course':
            if method == 'kitchen_fire' and args and type(args[0]) is int:
                configs = request.env['pos.order'].browse(args[0]).exists().session_id.config_id
            elif args and isinstance(args[0], list) and all(type(value) is int for value in args[0]):
                configs = request.env[model].browse(args[0]).exists().order_id.session_id.config_id
        if model == 'pos.payment':
            if method == 'create' and args:
                values = args[0] if isinstance(args[0], list) else [args[0]]
                configs = request.env['pos.order'].browse([value['pos_order_id'] for value in values if value.get('pos_order_id')]).exists().session_id.config_id
            elif args and isinstance(args[0], list) and all(type(value) is int for value in args[0]):
                configs = request.env[model].browse(args[0]).exists().pos_order_id.session_id.config_id
        if not configs:
            config_id = identity.get('config_id')
            configs = request.env['pos.config'].browse(config_id).exists() if type(config_id) is int else request.env['pos.config']._waiter_selected_config(context.get('waiter_config_id'))
        if not configs:
            raise AccessError('No hay un punto de venta autorizado.')
        selected = context.get('waiter_config_id') or identity.get('config_id')
        if selected and (type(selected) is not int or any(c.id != selected for c in configs)):
            raise AccessError('La operación pertenece a otro restaurante.')
        if len(configs) == 1:
            context['waiter_config_id'] = configs.id
            context['warehouse_id'] = configs.warehouse_id.id
        for config in configs:
            config._waiter_check_rpc(employee.id, identity['token'], model, method, args)
        # El terminal puede usar una credencial técnica de dueño: el PIN sigue limitando sus lecturas.
        fields = {'pos.config': 'id', 'pos.session': 'config_id', 'pos.order': 'config_id',
                  'pos.payment': 'config_id', 'report.pos.order': 'config_id',
                  'pos.order.line': 'order_id.config_id', 'restaurant.order.course': 'order_id.config_id',
                  'waiter.reservation': 'config_id', 'waiter.notification': 'config_id',
                  'restaurant.floor': 'pos_config_ids', 'restaurant.table': 'floor_id.pos_config_ids'}
        if model in fields:
            from odoo.fields import Domain
            scope = [(fields[model], 'in', configs.ids)]
            if method in ('search', 'search_read', 'search_count', 'search_fetch', 'read_group', 'web_search_read'):
                if args:
                    args[0] = list(Domain.AND([args[0], scope]))
                else:
                    kwargs['domain'] = list(Domain.AND([kwargs.get('domain', []), scope]))
            elif method == 'read':
                ids = args[0] if args else []
                if request.env[model].search_count([('id', 'in', ids)] + scope) != len(set(ids)):
                    raise AccessError('La lectura incluye registros de otro restaurante.')
        return kwargs

    @http.route()
    def call_kw(self, model, method, args, kwargs, path=None):
        kwargs = self._waiter_guard(model, method, args, kwargs)
        result = super().call_kw(model, method, args, kwargs, path)
        if model == 'hr.employee' and method in ('waiter_check_pin', 'waiter_start_my_shift') and result.get('ok'):
            request.session['waiter_pos_identity'] = {'id': result['employee']['id'], 'token': result['token']}
            if method == 'waiter_start_my_shift':
                config_id = args[0] if args else kwargs.get('config_id')
                if config_id is None and len(result['config_ids']) == 1:
                    config_id = result['config_ids'][0]
                request.session['waiter_pos_identity']['config_id'] = config_id
        if model == 'hr.employee' and method == 'waiter_end_shift':
            request.session.pop('waiter_pos_identity', None)
        return result

    @http.route()
    def call_button(self, model, method, args, kwargs, path=None):
        return super().call_button(model, method, args, self._waiter_guard(model, method, args, kwargs), path)


class WaiterSession(Session):
    @http.route()
    def authenticate(self, db, login, password, base_location=None):
        """Entrar con el correo del terminal empieza un dispositivo sin empleado validado.

        `Session.authenticate` conserva las claves propias de la sesión, así que la identidad de un turno
        anterior sobrevivía al nuevo acceso; con su token ya caducado el guardia rechazaba cada llamada
        —incluida la lectura del rol que el POS hace al entrar— y el terminal se quedaba sin salida por
        la interfaz, diciendo «correo o contraseña incorrectos» con la contraseña correcta.
        """
        result = super().authenticate(db, login, password, base_location)
        request.session.pop('waiter_pos_identity', None)
        return result
