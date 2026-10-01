"""Acceso personal y ventanas de turno del Plan P, también para autenticación fuera del POS."""
from datetime import datetime, time, timedelta

import pytz

from odoo import api, fields, models, SUPERUSER_ID
from odoo.exceptions import AccessDenied, AccessError, ValidationError
from odoo.fields import Domain
from odoo.tools import escape_psql


class PosConfig(models.Model):
    _inherit = 'pos.config'

    waiter_access_margin_minutes = fields.Integer(string='Margen de acceso al turno (minutos)', default=30)

    def _waiter_management_recipients(self):
        """Destinatarios compartidos de acceso y caja: dueños y encargados de esta sede."""
        self.ensure_one()
        users = self.env['res.users'].sudo().search([
            ('active', '=', True), ('share', '=', False), ('company_ids', 'in', self.company_id.ids),
        ])
        return users.filtered(lambda u: u.has_group('projectapp_ops.group_waiter_owner')
                              or u.has_group('base.group_system')
                              or u.waiter_role == 'admin' and self in u.waiter_config_ids)

    @api.constrains('waiter_access_margin_minutes')
    def _check_waiter_access_margin(self):
        if any(config.waiter_access_margin_minutes < 0 for config in self):
            raise ValidationError('El margen de acceso no puede ser negativo.')


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def _waiter_find_login(self, login):
        """Usuario o correo exactos; los comodines son literales y una identidad ambigua se rechaza."""
        if not isinstance(login, str) or not login.strip():
            return self.browse()
        value = escape_psql(login.strip())
        users = self.sudo().with_context(active_test=True).search([
            ('active', '=', True), '|', ('login', '=ilike', value), ('email', '=ilike', value),
        ], limit=2)
        return users if len(users) == 1 else self.browse()

    @api.model
    def _get_login_domain(self, login):
        # Odoo 19: _login(credential, user_agent_env) busca con este método antes de verificar credenciales.
        return Domain('id', 'in', self._waiter_find_login(login).ids)

    def _check_credentials(self, credential, env):
        # Sobrescribe res.users._check_credentials(self, credential, env) de Odoo 19.
        # Conserva auth_info y solo avisa después de probar la contraseña o la clave de API.
        auth_info = super()._check_credentials(credential, env)
        self.env['res.users'].browse(auth_info['uid'])._waiter_check_access_hours()
        return auth_info

    @api.model
    def _check_uid_passwd(self, uid, passwd):
        # El padre guarda el resultado en ormcache: la ventana debe verificarse también en los aciertos de caché.
        result = super()._check_uid_passwd(uid, passwd)
        self.browse(uid)._waiter_check_access_hours()
        return result

    def _waiter_check_access_hours(self):
        self.ensure_one()
        user = self.sudo()
        if user.waiter_role not in ('waiter', 'cashier'):
            return
        employees = self.env['hr.employee'].sudo().search([('user_id', '=', user.id)])
        for employee in employees:
            window = employee._waiter_access_window()
            if not window['allowed']:
                employee._waiter_notify_outside_hours(window, durable=True)
                raise AccessDenied('Estás fuera de tu horario de acceso. Tu turno es %s.' % window['label'])


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    @staticmethod
    def _waiter_hour_label(hour):
        minutes = round(hour * 60)
        return '%02d:%02d' % (minutes // 60, minutes % 60)

    def _waiter_access_window(self, now=None):
        """Ventana diaria en la zona de la empresa; el inicio se incluye y el fin se excluye.

        Los Float de Odoo convierten un valor vacío en cero. Dos extremos iguales significan sin turno;
        un único extremo en cero sí representa medianoche. Nunca se usa la zona enviada por el navegador.
        """
        self.ensure_one()
        now = now or fields.Datetime.now()
        zone = pytz.timezone(self.company_id.resource_calendar_id.tz or self.company_id.partner_id.tz or 'UTC')
        local = pytz.utc.localize(now).astimezone(zone)
        label = '%s–%s' % (self._waiter_hour_label(self.shift_start), self._waiter_hour_label(self.shift_end))
        result = {'allowed': True, 'end': None, 'label': label, 'local_time': local.strftime('%H:%M')}
        if self.waiter_role not in ('waiter', 'cashier') or self.shift_start == self.shift_end:
            return result
        config = self.waiter_config_ids[:1]
        margin = timedelta(minutes=config.waiter_access_margin_minutes if config else 30)
        ends = []
        # Incluye el turno de ayer que cruza medianoche y el de mañana cuyo margen empieza hoy.
        for offset in (-1, 0, 1):
            midnight = datetime.combine(local.date() + timedelta(days=offset), time.min)
            start = midnight + timedelta(hours=self.shift_start)
            end = midnight + timedelta(hours=self.shift_end)
            if self.shift_end < self.shift_start:
                end += timedelta(days=1)
            start = zone.localize(start).astimezone(pytz.utc).replace(tzinfo=None) - margin
            end = zone.localize(end).astimezone(pytz.utc).replace(tzinfo=None) + margin
            if start <= now < end:
                ends.append(end)
        result.update(allowed=bool(ends), end=max(ends) if ends else None)
        return result

    def _waiter_notify_outside_hours(self, window, durable=False):
        """Un aviso por destinatario. El rechazo de credenciales no revierte el aviso ni confirma la petición."""
        self.ensure_one()
        if 'waiter.notification' not in self.env.registry:
            return  # projectapp_notify depende de ops; no se introduce una dependencia circular.
        config = self.waiter_config_ids[:1]
        if not config:
            return
        recipients = config._waiter_management_recipients()
        values = [{
            'kind': 'access', 'config_id': config.id, 'user_id': user.id,
            'title': 'Intento de acceso fuera de turno',
            'body': '%s intentó entrar a las %s, fuera de su turno (%s)' % (
                self.name, window['local_time'], window['label']),
            'res_model': 'hr.employee', 'res_id': self.id,
        } for user in recipients]
        if not values:
            return
        self.env['waiter.notification'].sudo().create(values)
        if durable:
            # La autenticación rechazada revierte su transacción, y con ella este aviso. Si se revierte, se vuelve a crear
            # en una transacción propia justo después (postrollback); si no, queda el de arriba y nunca hay dos.
            registry = self.env.registry

            def persist():
                with registry.cursor() as cr:
                    api.Environment(cr, SUPERUSER_ID, {})['waiter.notification'].create(values)

            self.env.cr.postrollback.add(persist)

    @api.model
    def waiter_start_my_shift(self, config_id=None):
        """Abre la asistencia del usuario conectado y entrega la misma identidad que usaba el PIN."""
        employee = self.sudo().search([
            ('user_id', '=', self.env.uid), ('company_id', '=', self.env.company.id), ('active', '=', True),
        ], limit=1)
        if not employee or not self.env.user.active:
            return {'ok': False, 'reason': 'no_employee'}
        self._waiter_require_pos_user()
        configs = employee.waiter_config_ids.filtered('active')
        if employee.waiter_role == 'owner':
            configs = self.env['pos.config'].sudo().search([('company_id', '=', employee.company_id.id)])
        if config_id is not None and (type(config_id) is not int or config_id not in configs.ids):
            raise AccessError('El restaurante no está asignado a esta persona.')
        window = employee._waiter_access_window()
        if not window['allowed']:
            employee._waiter_notify_outside_hours(window)
            return {'ok': False, 'reason': 'outside_hours', 'window': window['label']}
        # La fila bloqueada serializa tanto la emisión del token como la apertura de asistencia.
        token = employee._waiter_new_session(expires=window['end'])
        attendance = employee._waiter_open_attendance()
        if not attendance:
            attendance = self.env['hr.attendance'].sudo().create({
                'employee_id': employee.id, 'check_in': fields.Datetime.now(),
            })
        return {
            'ok': True, 'employee': employee._waiter_employee_dict(), 'attendance_id': attendance.id,
            'token': token, 'session_ends': employee.waiter_session_expires.isoformat() + 'Z',
            'config_ids': configs.ids,
        }
