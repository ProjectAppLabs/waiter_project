"""Restaurantes de una organización y asignación explícita de sus operadores."""
import re
import uuid
import math

from odoo import api, fields, models, Command
from odoo.exceptions import AccessError, ValidationError
from odoo.fields import Domain


_OWNER_AUTO = object()
_SYNC = object()


def assignment_authority(records):
    """Una escritura ORM directa respeta el mismo límite que waiter_set_restaurants."""
    # El administrador de Odoo (permisos de acceso) también da de alta personal y roles desde el backend.
    if records.env.su or records.env.user.has_group('projectapp_ops.group_waiter_owner') or records.env.user.has_group('base.group_erp_manager'):
        return None
    if records.env.user.waiter_role != 'admin':
        raise AccessError('Solo el dueño o un encargado puede asignar restaurantes y roles.')
    allowed = set(records.env.user.waiter_config_ids.ids)
    if any(row.waiter_role == 'owner' or not set(row.waiter_config_ids.ids) <= allowed for row in records.sudo()):
        raise AccessError('El encargado solo puede administrar operadores de sus restaurantes.')
    return allowed


def check_assignment_result(records, allowed):
    if allowed is not None and any(row.waiter_role == 'owner' or not set(row.waiter_config_ids.ids) <= allowed for row in records.sudo()):
        raise AccessError('El encargado no puede asignar otros restaurantes ni conceder el rol de dueño.')


def default_configs(env):
    """Compatibilidad al dar de alta personal en una organización con un único local."""
    configs = env['pos.config'].search([('company_id', '=', env.company.id)], limit=2)
    return configs.ids if len(configs) == 1 else []


def check_count(records, strict=False):
    """Al guardar, un mesero o cajero nunca queda en dos restaurantes; sin ninguno no entra a ningún POS hasta que lo
    asignen (así se puede crear personal desde RR. HH. sin saber aún su local). Al asignar (`strict`, lo que usa la
    consola del dueño) se exige lo completo: exactamente uno para mesero y cajero, uno o más para el encargado, y que
    sean de la organización del operador."""
    for record in records:
        if record.waiter_role == 'owner':
            continue
        count = len(record.waiter_config_ids)
        if record.waiter_role in ('waiter', 'cashier') and count > 1:
            raise ValidationError('Meseros y cajeros trabajan en un solo restaurante.')
        if not strict:
            continue
        if (record.waiter_role in ('waiter', 'cashier') and count != 1) or (record.waiter_role == 'admin' and count < 1):
            raise ValidationError('Meseros y cajeros necesitan exactamente un restaurante; encargados, uno o más.')
        # Un usuario puede cambiar de empresa activa (`company_id`) sin perder sus restaurantes: cuenta a qué empresas
        # tiene acceso (`company_ids`). El empleado tiene una sola empresa.
        companies = record.company_ids if 'company_ids' in record._fields else record.company_id
        if any(config.company_id not in companies for config in record.waiter_config_ids):
            raise ValidationError('Todos los restaurantes deben pertenecer a la organización del operador.')


def set_restaurants(model, record_id, config_ids):
    """La elevación para RR. HH. ocurre después de validar al actor, al destino y ambas asignaciones."""
    user = model.env.user
    owner = user.has_group('projectapp_ops.group_waiter_owner')
    if not owner and user.waiter_role != 'admin':
        raise AccessError('Solo el dueño o un encargado puede asignar restaurantes.')
    if type(record_id) is not int or not isinstance(config_ids, list) or any(type(i) is not int for i in config_ids):
        raise ValidationError('Indica el operador y una lista de restaurantes.')
    record = model.sudo().browse(record_id).exists()
    configs = model.env['pos.config'].browse(list(set(config_ids))).exists()
    configs.check_access('read')
    if not record or record.company_id not in model.env.companies or len(configs) != len(set(config_ids)):
        raise AccessError('El operador o los restaurantes no están disponibles.')
    if not owner and (record.waiter_role == 'owner' or
                      (record.waiter_config_ids | configs) - user.waiter_config_ids):
        raise AccessError('El encargado solo puede administrar operadores de sus restaurantes.')
    record.write({'waiter_config_ids': [Command.set(configs.ids)]})
    check_count(record, strict=True)
    return True


class PosConfig(models.Model):
    _inherit = 'pos.config'

    waiter_slug = fields.Char(string='Slug del restaurante', copy=False, index=True)
    waiter_street = fields.Char(string='Dirección del restaurante')
    waiter_city = fields.Char(string='Ciudad del restaurante')
    waiter_phone = fields.Char(string='Teléfono del restaurante')
    waiter_latitude = fields.Char(string='Latitud del restaurante')
    waiter_longitude = fields.Char(string='Longitud del restaurante')
    _waiter_slug_unique = models.Constraint('UNIQUE(company_id, waiter_slug)', 'El slug ya existe en esta organización.')

    @api.constrains('waiter_slug')
    def _check_waiter_slug(self):
        for config in self:
            if config.waiter_slug and not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', config.waiter_slug):
                raise ValidationError('El slug solo admite minúsculas, números y guiones entre palabras.')

    @api.constrains('waiter_latitude', 'waiter_longitude')
    def _check_waiter_location(self):
        for config in self:
            pair = (config.waiter_latitude, config.waiter_longitude)
            if bool(pair[0]) != bool(pair[1]):
                raise ValidationError('Completa latitud y longitud, o deja ambas vacías.')
            for value, limit in zip(pair, (90, 180)):
                if value:
                    try:
                        valid = math.isfinite(float(value)) and abs(float(value)) <= limit
                    except ValueError:
                        valid = False
                    if not valid:
                        raise ValidationError('Las coordenadas del restaurante no son válidas.')

    def _get_group_pos_manager(self):
        # pos_hr usa este grupo para incorporar gerentes automáticamente durante write.
        if self.env.context.get('_waiter_owner_auto') is _OWNER_AUTO:
            return self.env.ref('projectapp_ops.group_waiter_owner')
        return super()._get_group_pos_manager()

    def write(self, vals):
        result = True
        for config in self:
            result = super(PosConfig, config.with_context(_waiter_owner_auto=_OWNER_AUTO)).write(dict(vals)) and result
        return result

    def _employee_domain(self, user_id):
        """Una lista vacía nunca da acceso a toda la empresa ni al empleado del terminal."""
        self.ensure_one()
        # El POS carga empleados también como `hr.employee.public`, que no tiene nuestros campos: se resuelven los ids con
        # el modelo completo y el dominio filtra por ellos.
        company = self._check_company_domain(self.company_id)
        allowed = self.env['hr.employee'].sudo().search(Domain.AND([company, [
            '|', ('waiter_role', '=', 'owner'), ('waiter_config_ids', 'in', self.ids)]])).ids
        return Domain.AND([company, [('id', 'in', allowed)]])

    @api.model
    def _waiter_selected_config(self, config_id=None, strict=False):
        """El restaurante que se opera: el pedido explícitamente o el del contexto (`waiter_config_id`, lo manda siempre
        el POS). Sin ninguno y con varios restaurantes, las lecturas (campos calculados, informes, el backend de Odoo)
        usan el primero de la organización; lo que escribe en un almacén o en dinero (`strict`) exige la selección."""
        config_id = config_id or self.env.context.get('waiter_config_id')
        if config_id:
            config = self.browse(int(config_id)).exists()
        else:
            config = self.search([('company_id', '=', self.env.company.id)], order='id', limit=2)
            if len(config) > 1 and not strict:
                config = config[:1]
        if len(config) != 1:
            raise ValidationError('Selecciona el restaurante que vas a operar.')
        config.check_access('read')
        if config.company_id not in self.env.companies:
            raise AccessError('El restaurante no pertenece a la organización activa.')
        return config

    @api.model
    def waiter_restaurants(self):
        if not self.env.user.has_group('point_of_sale.group_pos_manager'):
            raise AccessError('Solo el dueño o un encargado puede consultar los restaurantes.')
        start, end = self.env['pos.order']._waiter_day_bounds()
        rows = []
        domain = [('company_id', '=', self.env.company.id)]
        if 'waiter_restaurant_ids' in self.env.context:
            domain.append(('id', 'in', self.env.context['waiter_restaurant_ids']))
        for config in self.search(domain, order='name, id'):
            orders = self.env['pos.order'].search([
                ('config_id', '=', config.id), ('date_order', '>=', start), ('date_order', '<', end),
                ('state', 'in', ['paid', 'done', 'invoiced']),
            ])
            rows.append({'id': config.id, 'name': config.name, 'slug': config.waiter_slug or '',
                         'street': config.waiter_street or '', 'city': config.waiter_city or '',
                         'phone': config.waiter_phone or '',
                         'open': bool(self.env['pos.session'].search_count([
                             ('config_id', '=', config.id), ('state', 'in', ['opened', 'opening_control'])])),
                         'salesToday': sum(orders.mapped('amount_total')), 'ordersToday': len(orders)})
        return rows

    @api.model
    def waiter_create_restaurant(self, name, slug, copy_from_id=None):
        if not self.env.user.has_group('projectapp_ops.group_waiter_owner'):
            raise AccessError('Solo el dueño puede crear un restaurante.')
        if not isinstance(name, str) or not name.strip() or not isinstance(slug, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
            raise ValidationError('Indica un nombre y un slug válidos para el restaurante.')
        source = self._waiter_selected_config(copy_from_id) if copy_from_id else self.browse()
        if source and source.company_id != self.env.company:
            raise ValidationError('Solo puedes copiar ajustes de esta organización.')
        shared_methods = (source or self.search([('company_id', '=', self.env.company.id)])).payment_method_ids.filtered(
            lambda method: not method.is_cash_count)
        # La creación del conjunto es atómica incluso si el llamador captura el error de Odoo.
        with self.env.cr.savepoint():
            code = uuid.uuid4().hex[:5].upper()
            warehouse = self.env['stock.warehouse'].sudo().create({
                'name': name.strip(), 'code': code, 'company_id': self.env.company.id,
            })
            journal = self.env['account.journal'].sudo().create({
                'name': 'Efectivo · ' + name.strip(), 'code': code, 'type': 'cash', 'company_id': self.env.company.id,
            })
            cash = self.env['pos.payment.method'].sudo().create({
                'name': 'Efectivo · ' + name.strip(), 'journal_id': journal.id, 'company_id': self.env.company.id,
            })
            values = {'name': name.strip(), 'waiter_slug': slug, 'company_id': self.env.company.id,
                      'module_pos_restaurant': True, 'module_pos_hr': True, 'picking_type_id': warehouse.out_type_id.id,
                      'payment_method_ids': [Command.set((cash | shared_methods).ids)],
                      'floor_ids': [Command.clear()], 'basic_employee_ids': [Command.clear()],
                      'advanced_employee_ids': [Command.clear()], 'minimal_employee_ids': [Command.clear()]}
            if source:
                names = [name for name in self._fields if name.startswith(('alert_', 'roi_', 'reservation_'))]
                names += ['waiter_kitchen_prepay_roles', 'pricelist_id', 'available_pricelist_ids',
                          'use_pricelist', 'limit_categories', 'iface_available_categ_ids']
                for field_name in names:
                    field = self._fields.get(field_name)
                    if field and (not field.compute or not field.readonly) and field.type != 'one2many':
                        value = source[field_name]
                        values[field_name] = [Command.set(value.ids)] if field.type == 'many2many' else value.id if field.type == 'many2one' else value
            config = self.sudo().create(values)
            # pos_restaurant ya crea un piso al dar de alta un config sin pisos: se usa ese (llamado «Salón») en vez de
            # añadir un segundo.
            floor = config.floor_ids[:1]
            if floor:
                # Su mesa de ejemplo tampoco: el restaurante nuevo empieza con el piso vacío y se arma en Mesas.
                floor.sudo().table_ids.unlink()
                floor.sudo().write({'name': 'Salón'})
            else:
                self.env['restaurant.floor'].sudo().create({'name': 'Salón', 'pos_config_ids': [Command.set(config.ids)]})
            config._waiter_sync_employee_lists()
            return {'id': config.id, 'slug': config.waiter_slug}

    def _waiter_validate_restriction(self, config_ids):
        self.ensure_one()
        if not isinstance(config_ids, list) or any(type(i) is not int or i <= 0 for i in config_ids):
            raise ValidationError('La restricción necesita una lista de restaurantes.')
        configs = self.env['pos.config'].browse(list(set(config_ids))).exists()
        configs.check_access('read')
        if len(configs) != len(set(config_ids)) or any(c.company_id != self.company_id for c in configs):
            raise ValidationError('Los restaurantes de la restricción no pertenecen a esta organización.')
        return configs.ids

    def waiter_catalog_prices(self, product_ids):
        """Precios unitarios de la carta con la lista del restaurante, calculados por Odoo."""
        self.ensure_one()
        self.check_access('read')
        if not isinstance(product_ids, list) or any(type(i) is not int for i in product_ids):
            raise ValidationError('Indica una lista de productos.')
        products = self.env['product.product'].search([
            ('id', 'in', product_ids), ('company_id', 'in', [False, self.company_id.id]),
            ('sale_ok', '=', True), ('available_in_pos', '=', True),
        ])
        return {str(product.id): self.pricelist_id._get_product_price(product, 1.0)
                if self.pricelist_id else product.lst_price for product in products}

    def _waiter_sync_employee_lists(self):
        for config in self.sudo():
            employees = self.env['hr.employee'].sudo().search(config._employee_domain(self.env.uid))
            config.write({'basic_employee_ids': [Command.set(employees.ids)],
                          'advanced_employee_ids': [Command.set(employees.filtered(lambda e: e.waiter_role in ('admin', 'owner')).ids)],
                          'minimal_employee_ids': [Command.clear()]})


class ResUsers(models.Model):
    _inherit = 'res.users'

    waiter_config_ids = fields.Many2many('pos.config', 'waiter_user_config_rel', 'user_id', 'config_id',
                                       string='Restaurantes asignados', default=lambda self: default_configs(self.env))

    @api.constrains('waiter_config_ids', 'waiter_role')
    def _check_waiter_configs(self):
        check_count(self.filtered(lambda u: u.has_group('point_of_sale.group_pos_user')))

    @api.model
    def waiter_set_restaurants(self, user_id, config_ids):
        return set_restaurants(self, user_id, config_ids)

    @api.model_create_multi
    def create(self, vals_list):
        allowed = assignment_authority(self.browse())
        records = super().create(vals_list)
        check_assignment_result(records, allowed)
        records._check_waiter_configs()
        return records

    def write(self, vals):
        changed = bool({'waiter_config_ids', 'waiter_role'} & vals.keys())
        allowed = assignment_authority(self) if changed else None
        result = super().write(vals)
        if changed:
            check_assignment_result(self, allowed)
            self._check_waiter_configs()
            # ir.rule guarda el dominio evaluado por usuario; una reasignación debe invalidarlo.
            self.env.registry.clear_cache()
            if self.env.context.get('_waiter_assignment_sync') is not _SYNC:
                for user in self:
                    employees = self.env['hr.employee'].sudo().search([('user_id', '=', user.id)])
                    employees.with_context(_waiter_assignment_sync=_SYNC).write({
                        'waiter_config_ids': [Command.set(user.waiter_config_ids.ids)], 'waiter_role': user.waiter_role,
                    })
        return result


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    waiter_config_ids = fields.Many2many('pos.config', 'waiter_employee_config_rel', 'employee_id', 'config_id',
                                       string='Restaurantes asignados', groups='hr.group_hr_user',
                                       default=lambda self: default_configs(self.env))

    @api.constrains('waiter_config_ids', 'waiter_role')
    def _check_waiter_configs(self):
        check_count(self)

    @api.model
    def waiter_set_restaurants(self, employee_id, config_ids):
        return set_restaurants(self, employee_id, config_ids)

    @api.model_create_multi
    def create(self, vals_list):
        allowed = assignment_authority(self.browse())
        for vals in vals_list:
            if vals.get('user_id'):
                user = self.env['res.users'].sudo().browse(vals['user_id'])
                vals.setdefault('waiter_role', user.waiter_role)
                vals.setdefault('waiter_config_ids', [Command.set(user.waiter_config_ids.ids)])
        records = super().create(vals_list)
        check_assignment_result(records, allowed)
        records._waiter_sync_assignments()
        return records

    def write(self, vals):
        changed = bool({'waiter_config_ids', 'waiter_role', 'user_id'} & vals.keys())
        allowed = assignment_authority(self) if changed else None
        old = self.sudo().waiter_config_ids
        result = super().write(vals)
        if changed:
            check_assignment_result(self, allowed)
        if {'waiter_config_ids', 'waiter_role', 'user_id', 'active'} & vals.keys():
            self._waiter_sync_assignments(old)
        return result

    def _waiter_sync_assignments(self, old=None):
        configs = self.sudo().waiter_config_ids | (old or self.env['pos.config'])
        if any(e.waiter_role == 'owner' for e in self.sudo()):
            configs |= self.env['pos.config'].sudo().search([('company_id', 'in', self.company_id.ids)])
        configs._waiter_sync_employee_lists()
        if self.env.context.get('_waiter_assignment_sync') is not _SYNC:
            for employee in self.sudo().filtered('user_id'):
                employee.user_id.with_context(_waiter_assignment_sync=_SYNC).write({
                    'waiter_config_ids': [Command.set(employee.waiter_config_ids.ids)], 'waiter_role': employee.waiter_role,
                })


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    config_id = fields.Many2one(related='pos_order_id.config_id', store=True, index=True)
