"""Plano versionado y reparto de zonas por sesión; guardar nunca abre una caja."""
import base64
import binascii
import math
import re
from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError


def authorize(env, employee_id, token):
    employee = env['hr.employee'].sudo().browse(employee_id).exists()
    if (env.user.waiter_role != 'admin' or not employee or not employee.active or
            employee.company_id not in env.companies or employee.waiter_role != 'admin' or
            not employee._waiter_session_ok(token)):
        raise AccessError(env._('Valida el PIN de un administrador para modificar el plano o las zonas.'))


def rectangle(item):
    for key in ('x', 'y', 'width', 'height'):
        v = item.get(key)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 or v > 20000:
            raise UserError(_('Las dimensiones del plano no son válidas.'))
    if item['width'] < 20 or item['height'] < 20 or item['x'] + item['width'] > 20000 or item['y'] + item['height'] > 20000:
        raise UserError(_('Los elementos deben medir al menos una celda.'))


def image_bytes(image):
    """Valida una imagen en base64: PNG o JPG de hasta 10 MB. Devuelve el mismo base64 si es válida."""
    try:
        if not isinstance(image, str) or len(image) > 14 * 1024 * 1024:
            raise ValueError()
        decoded = base64.b64decode(image, validate=True)
        if len(decoded) > 10 * 1024 * 1024 or not (decoded.startswith(b'\x89PNG\r\n\x1a\n') or decoded.startswith(b'\xff\xd8\xff')):
            raise ValueError()
    except (ValueError, binascii.Error):
        raise UserError(_('Usa una imagen PNG o JPG de hasta 10 MB.'))
    return image


MAX_EXTRA_IMAGES = 8
# Piezas de la galería del editor (cocina, salón, baños, estructura). Misma lista que pos/lib/domain/decor.ts.
DECOR_ASSETS = ('stove', 'range', 'fridge', 'sink', 'counter', 'island', 'bar', 'stool', 'register', 'sofa', 'plant',
                'toilet', 'washbasin', 'door', 'window', 'stairs', 'spiral', 'column')
DECOR_ROTATIONS = (0, 90, 180, 270)


def checked_decor(items):
    """Valida las piezas de decoración y devuelve solo sus campos conocidos. No chocan con las mesas: solo dibujan."""
    if not isinstance(items, list) or len(items) > 500:
        raise UserError(_('El plano tiene demasiadas piezas de decoración.'))
    clean, seen = [], set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not item['id'] or len(item['id']) > 80 or item['id'] in seen:
            raise UserError(_('Cada pieza de decoración necesita un identificador único.'))
        seen.add(item['id'])
        rectangle(item)
        rotation = item.get('rotation', 0)
        if item.get('asset') not in DECOR_ASSETS or type(rotation) is not int or rotation not in DECOR_ROTATIONS:
            raise UserError(_('Una pieza de decoración no es válida.'))
        clean.append({'id': item['id'], 'asset': item['asset'], 'rotation': rotation,
                      **{k: item[k] for k in ('x', 'y', 'width', 'height')}})
    return clean
# Lo que el POS llama «caja abierta» (pos/lib/services/session.ts, OPEN_STATES): recién creada o ya con efectivo inicial.
OPEN_STATES = ('opened', 'opening_control')


def reservation_tables_field(Reservation):
    """Una reserva puede apartar varias mesas (`table_ids`); las versiones anteriores del addon solo tenían `table_id`.
    Retirar una mesa secundaria de un grupo es tan grave como retirar la principal."""
    return 'table_ids' if 'table_ids' in Reservation._fields else 'table_id'


def checked_staff(env, floor, assignments, company):
    """Valida {zona: [empleados]} contra las zonas del plano y los empleados activos del restaurante."""
    zone_ids = {z['id'] for z in (floor.waiter_plan or {}).get('zones', [])}
    if not isinstance(assignments, dict) or not set(assignments) <= zone_ids:
        raise UserError(_('La zona ya no existe.'))
    for ids in assignments.values():
        if not isinstance(ids, list) or any(type(i) is not int for i in ids):
            raise UserError(_('La asignación de empleados no es válida.'))
        employees = env['hr.employee'].sudo().browse(ids).exists()
        if len(employees) != len(set(ids)) or any(not e.active or e.company_id != company for e in employees):
            raise UserError(_('Selecciona empleados activos de este restaurante.'))
    return {zone: ids for zone, ids in assignments.items() if ids}


def overlap(a, b, gap=0):
    return (a['x'] < b['x'] + b['width'] + gap and a['x'] + a['width'] + gap > b['x'] and
            a['y'] < b['y'] + b['height'] + gap and a['y'] + a['height'] + gap > b['y'])


class Floor(models.Model):
    _inherit = 'restaurant.floor'
    waiter_plan = fields.Json(default=lambda self: {'walls': [], 'zones': []})
    waiter_plan_revision = fields.Integer(default=0)
    # Reparto habitual de meseros por zona: {zona: [empleados]}. Se prepara con la caja cerrada y cada turno lo hereda;
    # un turno puede ajustarlo solo para sí (pos.session.waiter_zone_assignments) sin tocar este.
    waiter_zone_staff = fields.Json(default=dict)

    def waiter_read_plan(self):
        self.ensure_one()
        self.check_access('read')
        return {'id': self.id, 'name': self.name, 'revision': self.waiter_plan_revision,
                'backgroundSize': (self.waiter_plan or {}).get('backgroundSize'),
                'images': (self.waiter_plan or {}).get('images', []),
                'walls': (self.waiter_plan or {}).get('walls', []), 'zones': (self.waiter_plan or {}).get('zones', []),
                'decor': (self.waiter_plan or {}).get('decor', []),
                'tables': [{'id': t.id, 'key': str(t.id), 'number': t.table_number, 'seats': t.seats,
                            'x': t.position_h, 'y': t.position_v, 'width': t.width, 'height': t.height,
                            'zone': t.waiter_zone or ''} for t in self.table_ids.filtered('active')]}

    @api.model
    def waiter_save_plan(self, config_id, floor_id, plan, employee_id, token):
        authorize(self.env, employee_id, token)
        config = self.env['pos.config'].browse(config_id).exists()
        config.check_access('write')
        if not config:
            raise UserError(_('No existe el terminal.'))
        self.env.cr.execute('SELECT id FROM pos_config WHERE id = %s FOR UPDATE', [config.id])
        if self.env['pos.session'].search_count([('config_id', '=', config.id), ('state', '!=', 'closed')]):
            raise UserError(_('Cierra la caja antes de modificar el plano.'))
        floor = self.browse(floor_id).exists() if floor_id else self.browse()
        if floor_id and (not floor or config not in floor.pos_config_ids):
            raise UserError(_('El piso no pertenece a este terminal.'))
        if floor:
            floor.check_access('write')
            self.env.cr.execute('SELECT id FROM restaurant_floor WHERE id = %s FOR UPDATE', [floor.id])
            floor.invalidate_recordset()
            if plan.get('revision') != floor.waiter_plan_revision:
                raise UserError(_('Otra persona cambió el plano. Cancela y vuelve a abrirlo para cargar sus cambios.'))
        name = str(plan.get('name', '')).strip()
        if not name or len(name) > 100:
            raise UserError(_('Escribe un nombre de piso de hasta 100 caracteres.'))
        tables, walls, zones = (plan.get(k, []) for k in ('tables', 'walls', 'zones'))
        if not all(isinstance(v, list) and len(v) <= 500 for v in (tables, walls, zones)):
            raise UserError(_('El plano tiene demasiados elementos.'))
        zone_ids = set()
        for z in zones:
            rectangle(z)
            if not isinstance(z.get('id'), str) or not z['id'] or z['id'] in zone_ids or len(z['id']) > 80:
                raise UserError(_('Cada zona necesita un identificador único.'))
            if not str(z.get('name', '')).strip() or len(str(z['name'])) > 80 or not re.fullmatch(r'#[0-9a-fA-F]{6}', str(z.get('color', ''))):
                raise UserError(_('Escribe un nombre y un color válido para cada zona.'))
            zone_ids.add(z['id'])
        for wall in walls:
            rectangle(wall)
            # El color es opcional (los planos anteriores no lo traen); si viene, debe ser un hexadecimal de seis cifras.
            if wall.get('color') is not None and not re.fullmatch(r'#[0-9a-fA-F]{6}', str(wall['color'])):
                raise UserError(_('El color de una pared no es válido.'))
        # Sin la clave `decor` (clientes anteriores) se conservan las piezas que hubiera.
        decor = checked_decor(plan['decor']) if 'decor' in plan else ((floor.waiter_plan or {}).get('decor', []) if floor else [])
        ids, numbers = set(), set()
        for i, table in enumerate(tables):
            rectangle(table)
            for k in ('number', 'seats'):
                if type(table.get(k)) is not int or not 1 <= table[k] <= (9999 if k == 'number' else 100):
                    raise UserError(_('Revisa el número y la capacidad de cada mesa.'))
            if table['number'] in numbers or (table.get('zone') and table['zone'] not in zone_ids):
                raise UserError(_('Hay números de mesa repetidos o zonas inexistentes.'))
            numbers.add(table['number'])
            if table.get('id'):
                if type(table['id']) is not int or table['id'] in ids or table['id'] not in floor.table_ids.ids:
                    raise UserError(_('Una mesa no pertenece a este piso o está repetida.'))
                ids.add(table['id'])
            if any(overlap(table, other, 16) for other in tables[:i]) or any(overlap(table, w, 16) for w in walls):
                raise UserError(_('Separa las mesas entre sí y de las paredes antes de guardar.'))
        removed = floor.table_ids.filtered('active').filtered(lambda t: t.id not in ids) if floor else self.env['restaurant.table']
        if removed and self.env['pos.order'].search_count([('table_id', 'in', removed.ids), ('state', '=', 'draft')]):
            raise UserError(_('No puedes retirar mesas con pedidos pendientes.'))
        if removed and 'waiter.reservation' in self.env:
            # Una reserva futura debe reasignarse antes de retirar su mesa.
            R = self.env['waiter.reservation']
            if R.search_count([(reservation_tables_field(R), 'in', removed.ids), ('state', '=', 'confirmed'), ('date', '>=', fields.Date.context_today(self))]):
                raise UserError(_('Reasigna las reservas de estas mesas antes de retirarlas.'))
        background_size = plan.get('backgroundSize', (floor.waiter_plan or {}).get('backgroundSize') if floor else None)
        if background_size is not None:
            if not isinstance(background_size, dict):
                raise UserError(_('El tamaño de la imagen no es válido.'))
            background_size = {k: background_size.get(k, 0) for k in ('x', 'y', 'width', 'height')}
            rectangle(background_size)
        image_values = {}
        if 'background' in plan:
            image = plan['background']
            if image is not None:
                image_bytes(image)
            image_values['floor_background_image'] = image or False
        # Imágenes adicionales: adjuntos del piso con su rectángulo en el plano. Sin la clave `images` (clientes anteriores)
        # se conservan las que hubiera. Una existente se reconoce por su adjunto, que debe ser de este piso.
        previous = (floor.waiter_plan or {}).get('images', []) if floor else []
        owned = {i['attachmentId'] for i in previous}
        images, fresh = previous, []
        if 'images' in plan:
            incoming = plan['images']
            if not isinstance(incoming, list) or len(incoming) > MAX_EXTRA_IMAGES:
                raise UserError(_('Puedes tener hasta %s imágenes adicionales por piso.', MAX_EXTRA_IMAGES))
            images, seen = [], set()
            for item in incoming:
                if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not item['id'] or len(item['id']) > 80 or item['id'] in seen:
                    raise UserError(_('Cada imagen necesita un identificador único.'))
                seen.add(item['id'])
                rectangle(item)
                entry = {k: item[k] for k in ('id', 'x', 'y', 'width', 'height')}
                if item.get('data') is not None:
                    fresh.append((entry, image_bytes(item['data'])))
                elif type(item.get('attachmentId')) is int and item['attachmentId'] in owned:
                    entry['attachmentId'] = item['attachmentId']
                else:
                    raise UserError(_('Una imagen del plano no pertenece a este piso.'))
                images.append(entry)
        if not floor:
            floor = self.create({'name': name, 'pos_config_ids': [(4, config.id)]})
        for entry, data in fresh:
            entry['attachmentId'] = self.env['ir.attachment'].create({
                'name': 'plano-%s' % entry['id'], 'type': 'binary', 'datas': data, 'res_model': 'restaurant.floor', 'res_id': floor.id}).id
        dropped = owned - {i['attachmentId'] for i in images}
        if dropped:
            self.env['ir.attachment'].browse(list(dropped)).exists().unlink()
        floor.write({**image_values, 'name': name, 'waiter_plan': {'walls': walls, 'zones': zones, 'decor': decor, 'backgroundSize': background_size, 'images': images}, 'waiter_plan_revision': floor.waiter_plan_revision + 1})
        removed.write({'active': False})
        staff = floor.waiter_zone_staff or {}
        if set(staff) - zone_ids:
            floor.waiter_zone_staff = {zone: ids for zone, ids in staff.items() if zone in zone_ids}
        for table in tables:
            values = {'table_number': table['number'], 'seats': table['seats'], 'position_h': table['x'], 'position_v': table['y'],
                      'width': table['width'], 'height': table['height'], 'waiter_zone': table.get('zone', ''), 'shape': 'square'}
            if table.get('id'):
                self.env['restaurant.table'].browse(table['id']).write(values)
            else:
                self.env['restaurant.table'].create(dict(values, floor_id=floor.id))
        return floor.waiter_read_plan()

    def waiter_zone_staff_for(self, session_id=None):
        """Quién atiende cada zona ahora. `source` dice de dónde sale: 'shift' si el turno abierto tiene su propio reparto
        para este piso, 'plan' si usa el habitual. Lo lee cualquier empleado del POS; solo un administrador lo cambia."""
        self.ensure_one()
        self.check_access('read')
        session = self.env['pos.session'].browse(session_id).exists() if session_id else self.env['pos.session']
        own = (session.waiter_zone_assignments or {}) if session and session.state in OPEN_STATES else {}
        key = str(self.id)
        return {'assignments': own[key] if key in own else (self.waiter_zone_staff or {}),
                'source': 'shift' if key in own else 'plan', 'plan': self.waiter_zone_staff or {}}

    @api.model
    def waiter_assign_zone_staff(self, config_id, floor_id, assignments, employee_id, token):
        """Guarda el reparto habitual del piso. No necesita caja abierta: es preparación, como dibujar el plano."""
        authorize(self.env, employee_id, token)
        config = self.env['pos.config'].browse(config_id).exists()
        floor = self.browse(floor_id).exists()
        if not config or not floor or config not in floor.pos_config_ids:
            raise UserError(_('El piso no pertenece a este terminal.'))
        floor.check_access('write')
        floor.write({'waiter_zone_staff': checked_staff(self.env, floor, assignments, config.company_id)})
        return floor.waiter_zone_staff

    @api.model
    def waiter_delete_floor(self, config_id, floor_id, employee_id, token):
        """Quita un piso del terminal. Si otro terminal también lo usa, solo se desvincula de este ('detached'). Si no:
        sin historial se borra de verdad, con sus mesas. Con pedidos ya cobrados en sus
        mesas no se puede borrar sin dejar el historial huérfano: se archiva y se desvincula del terminal, así que para el
        restaurante desaparece igual. Mismas llaves que guardar el plano: PIN de administrador y caja cerrada."""
        authorize(self.env, employee_id, token)
        config = self.env['pos.config'].browse(config_id).exists()
        if not config:
            raise UserError(_('No existe el terminal.'))
        config.check_access('write')
        self.env.cr.execute('SELECT id FROM pos_config WHERE id = %s FOR UPDATE', [config.id])
        if self.env['pos.session'].search_count([('config_id', '=', config.id), ('state', '!=', 'closed')]):
            raise UserError(_('Cierra la caja antes de eliminar un piso.'))
        floor = self.with_context(active_test=False).browse(floor_id).exists()
        if not floor or config not in floor.pos_config_ids:
            raise UserError(_('El piso no pertenece a este terminal.'))
        floor.check_access('unlink')
        self.env.cr.execute('SELECT id FROM restaurant_floor WHERE id = %s FOR UPDATE', [floor.id])
        if floor.active and not self.search_count([('pos_config_ids', 'in', [config.id]), ('id', '!=', floor.id)]):
            raise UserError(_('Deja al menos un piso activo: activa o crea otro antes de eliminar este.'))
        # Un piso compartido con otro terminal no se destruye: este terminal solo lo suelta. Archivarlo o borrarlo se lo
        # quitaría también al otro, que puede tener su caja abierta con esas mesas.
        if floor.pos_config_ids - config:
            floor.write({'pos_config_ids': [(3, config.id)]})
            return {'id': floor_id, 'result': 'detached'}
        tables = self.env['restaurant.table'].with_context(active_test=False).search([('floor_id', '=', floor.id)])
        if tables and self.env['pos.order'].search_count([('table_id', 'in', tables.ids), ('state', '=', 'draft')]):
            raise UserError(_('Este piso tiene mesas con pedidos pendientes. Ciérralos antes de eliminarlo.'))
        if tables and 'waiter.reservation' in self.env:
            R = self.env['waiter.reservation']
            if R.search_count([(reservation_tables_field(R), 'in', tables.ids), ('state', '=', 'confirmed'), ('date', '>=', fields.Date.context_today(self))]):
                raise UserError(_('Reasigna las reservas de las mesas de este piso antes de eliminarlo.'))
        if tables and self.env['pos.order'].search_count([('table_id', 'in', tables.ids)]):
            tables.write({'active': False})
            floor.write({'active': False, 'pos_config_ids': [(3, config.id)]})
            return {'id': floor_id, 'result': 'archived'}
        tables.unlink()
        floor.unlink()
        return {'id': floor_id, 'result': 'removed'}


class Table(models.Model):
    _inherit = 'restaurant.table'
    waiter_zone = fields.Char(string='Zona del plano')


class Session(models.Model):
    _inherit = 'pos.session'
    waiter_zone_assignments = fields.Json(default=dict)

    @api.model_create_multi
    def create(self, vals_list):
        ids = sorted({v['config_id'] for v in vals_list if v.get('config_id')})
        if ids:
            self.env.cr.execute('SELECT id FROM pos_config WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(ids)])
        return super().create(vals_list)

    def waiter_assign_zones(self, floor_id, assignments, employee_id, token):
        self.ensure_one()
        authorize(self.env, employee_id, token)
        self.check_access('write')
        self.env.cr.execute('SELECT id FROM pos_session WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()
        floor = self.env['restaurant.floor'].browse(floor_id).exists()
        if self.state not in OPEN_STATES or not floor or self.config_id not in floor.pos_config_ids:
            raise UserError(_('La asignación necesita una caja abierta y un piso de este terminal.'))
        # `None` borra el ajuste de este turno y vuelve al reparto habitual del piso.
        clean = None if assignments is None else checked_staff(self.env, floor, assignments, self.company_id)
        data = dict(self.waiter_zone_assignments or {})
        if clean is None:
            data.pop(str(floor_id), None)
        else:
            data[str(floor_id)] = clean
        self.write({'waiter_zone_assignments': data})
        return data


class Order(models.Model):
    _inherit = 'pos.order'

    @api.model
    def waiter_zone_targets(self, order_ids):
        orders = self.browse(order_ids).exists()
        orders.check_access('read')
        result = {}
        for order in orders:
            floor = order.table_id.floor_id
            staff = floor.waiter_zone_staff_for(order.session_id.id)['assignments'] if floor else {}
            result[str(order.id)] = staff.get(order.table_id.waiter_zone, [])
        return result
