"""Alta y mantenimiento de personas desde la consola de la organización."""
import math
import re

from odoo import api, Command, fields, models, SUPERUSER_ID
from odoo.exceptions import AccessError, ValidationError
from odoo.tools import escape_psql

from .restaurants import assignment_authority, check_count
from .users import ROLES, GROUPS_BY_ROLE


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def _waiter_people_authority(self, employee_id=None):
        user = self.env.user
        owner = user.has_group('projectapp_ops.group_waiter_owner')
        if not owner and user.waiter_role != 'admin':
            raise AccessError('Solo el dueño o un encargado puede administrar personas.')
        employee = self.browse()
        if employee_id is not None:
            if type(employee_id) is not int:
                raise ValidationError('Indica la persona que vas a modificar.')
            employee = self.sudo().with_context(active_test=False).browse(employee_id).exists()
            if not employee or employee.company_id not in self.env.companies or not employee.user_id:
                raise AccessError('La persona no está disponible o no tiene cuenta vinculada.')
        # Se evalúa antes de sudo para conservar el alcance del encargado.
        assignment_authority(employee.with_env(self.env))
        # Los permisos técnicos del backend no amplían el alcance del encargado en esta API de la consola.
        allowed = None if owner else set(user.waiter_config_ids.ids)
        if allowed is not None and any(row.waiter_role == 'owner' or not set(row.waiter_config_ids.ids) <= allowed for row in employee):
            raise AccessError('El encargado solo puede administrar personas de sus restaurantes.')
        return employee, allowed

    @api.model
    def _waiter_person_values(self, values, employee, allowed):
        keys = {'name', 'username', 'email', 'role', 'config_ids', 'shift_start', 'shift_end'}
        if not isinstance(values, dict) or set(values) - keys:
            raise ValidationError('Los datos de la persona no son válidos.')
        if not employee and not {'name', 'username', 'email', 'role', 'config_ids'} <= values.keys():
            raise ValidationError('Completa nombre, usuario, correo, rol y restaurantes.')
        if employee and 'username' in values:
            raise ValidationError('El usuario no se cambia al editar la persona.')
        clean = {}
        for key in ('name', 'username', 'email'):
            if key in values:
                value = values[key]
                if not isinstance(value, str) or not value.strip():
                    raise ValidationError('Completa el nombre, el usuario y el correo.')
                clean[key] = value.strip() if key == 'name' else value.strip().lower()
        if 'username' in clean and not re.fullmatch(r'[a-z0-9.]{3,32}', clean['username']):
            raise ValidationError('El usuario debe tener de 3 a 32 letras minúsculas, números o puntos.')
        if 'email' in clean and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', clean['email']):
            raise ValidationError('Indica un correo válido.')
        role = values.get('role', employee.waiter_role if employee else None)
        if not isinstance(role, str) or role not in dict(ROLES):
            raise ValidationError('El rol no es válido.')
        config_ids = values.get('config_ids', employee.waiter_config_ids.ids if employee else [])
        if not isinstance(config_ids, list) or any(type(i) is not int or i <= 0 for i in config_ids):
            raise ValidationError('Indica una lista de restaurantes.')
        config_ids = sorted(set(config_ids))
        if allowed is not None and (role == 'owner' or not set(config_ids) <= allowed):
            raise AccessError('El encargado solo puede asignar sus restaurantes y no puede conceder el rol de dueño.')
        configs = self.env['pos.config'].browse(config_ids).exists()
        configs.check_access('read')
        company = employee.company_id if employee else self.env.company
        if len(configs) != len(config_ids) or any(not c.active or c.company_id != company for c in configs):
            raise ValidationError('Los restaurantes deben estar activos y pertenecer a esta organización.')
        if ((role in ('waiter', 'cashier') and len(configs) != 1) or (role == 'admin' and not configs)):
            raise ValidationError('Meseros y cajeros necesitan exactamente un restaurante; encargados, uno o más.')
        clean.update(role=role, config_ids=configs.ids)
        for key in ('shift_start', 'shift_end'):
            if key in values:
                value = values[key]
                if value is None or value is False:
                    value = 0.0
                if (type(value) not in (int, float) or not math.isfinite(value) or
                        value < 0 or value > 24 or (key == 'shift_start' and value == 24)):
                    raise ValidationError('Las horas del turno deben estar entre 00:00 y 24:00.')
                clean[key] = value
        # Odoo usa REPEATABLE READ: un bloqueo asesor no renueva una foto anterior de los datos.
        # Esta escritura neutra en una fila común obliga al alta concurrente a reintentarse con una foto nueva.
        # No modifica los datos ni la fecha del superusuario, y cubre la unicidad en toda la base.
        self.env.cr.execute('UPDATE res_users SET write_date = write_date WHERE id = %s', [SUPERUSER_ID])
        users = self.env['res.users'].sudo().with_context(active_test=False)
        for key in ('username', 'email'):
            if key in clean and users.search_count([
                ('id', '!=', employee.user_id.id if employee else 0),
                '|', ('login', '=ilike', escape_psql(clean[key])), ('email', '=ilike', escape_psql(clean[key])),
            ]):
                raise ValidationError('El usuario o el correo ya pertenece a otra persona.')
        return clean

    @api.model
    def waiter_invite_person(self, values):
        employee, allowed = self._waiter_people_authority()
        with self.env.cr.savepoint():
            clean = self._waiter_person_values(values, employee, allowed)
            # No hereda permisos administrativos de la plantilla de usuarios de la base.
            groups = [self.env.ref(xid).id for xid in GROUPS_BY_ROLE[clean['role']]]
            user = self.env['res.users'].sudo().with_context(no_reset_password=True).create({
                'name': clean['name'], 'login': clean['username'], 'email': clean['email'],
                'waiter_role': clean['role'], 'waiter_config_ids': [Command.set(clean['config_ids'])],
                'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
                'group_ids': [Command.set(groups)], 'waiter_activated': False,
            })
            employee = self.sudo().create({
                'name': clean['name'], 'user_id': user.id, 'work_email': clean['email'],
                'company_id': self.env.company.id, 'waiter_role': clean['role'],
                'waiter_config_ids': [Command.set(clean['config_ids'])],
                'shift_start': clean.get('shift_start', 0), 'shift_end': clean.get('shift_end', 0),
            })
            check_count(employee, strict=True)
        # El alta no depende del correo: si no sale (servidor de correo caído), la persona queda creada con su
        # invitación pendiente y se reenvía desde Equipo.
        try:
            with self.env.cr.savepoint():
                sent = bool(user.send_waiter_invite())
        except Exception:  # noqa: BLE001 — se informa al cliente con invite_sent
            sent = False
        return {'employee_id': employee.id, 'user_id': user.id, 'invite_sent': sent}

    @api.model
    def waiter_update_person(self, employee_id, values):
        employee, allowed = self._waiter_people_authority(employee_id)
        with self.env.cr.savepoint():
            clean = self._waiter_person_values(values, employee, allowed)
            changes = {'waiter_role': clean['role'], 'waiter_config_ids': [Command.set(clean['config_ids'])]}
            changes.update({key: clean[key] for key in ('shift_start', 'shift_end', 'name') if key in clean})
            if 'email' in clean:
                changes['work_email'] = clean['email']
                employee.user_id.write({'email': clean['email'], 'waiter_invite_code': False,
                                        'waiter_invite_expires': False, 'waiter_invite_sent_at': False})
            if 'name' in clean:
                employee.user_id.write({'name': clean['name']})
            # Un cambio de rol, local o turno exige emitir una identidad nueva.
            changes.update(waiter_session_token=False, waiter_session_expires=False)
            employee.write(changes)
            check_count(employee, strict=True)
        return True

    @api.model
    def waiter_resend_invite(self, employee_id):
        employee, _allowed = self._waiter_people_authority(employee_id)
        if not employee.active or not employee.user_id.active:
            raise ValidationError('No se puede invitar a una persona desactivada.')
        return employee.user_id.send_waiter_invite()

    @api.model
    def waiter_deactivate_person(self, employee_id):
        employee, _allowed = self._waiter_people_authority(employee_id)
        if employee.user_id.id == self.env.uid:
            raise ValidationError('No puedes desactivar tu propia cuenta.')
        with self.env.cr.savepoint():
            attendance = employee._waiter_open_attendance()
            if attendance:
                attendance.write({'check_out': fields.Datetime.now()})
            employee.write({'active': False, 'waiter_session_token': False, 'waiter_session_expires': False})
            employee.user_id.write({'active': False, 'waiter_invite_code': False, 'waiter_invite_expires': False})
        return True
