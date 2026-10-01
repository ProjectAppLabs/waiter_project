"""Una cuenta por empleado, sin contraseñas de demostración salvo habilitación explícita."""
import re
import unicodedata

from odoo import api, Command, SUPERUSER_ID
from odoo.exceptions import ValidationError
from odoo.tools import escape_psql

from odoo.addons.projectapp_ops.models.users import GROUPS_BY_ROLE


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    # DINER_DEMO_ENABLED pertenece a otro servicio. En Odoo se exige este parámetro, apagado por defecto.
    demo = env['ir.config_parameter'].sudo().get_param('projectapp.demo_mode') == 'true'
    users = env['res.users'].with_context(active_test=False, no_reset_password=True)
    employees = env['hr.employee'].with_context(active_test=False).search([('user_id', '=', False)], order='id')
    admin = users.search([('login', '=', 'admin')], limit=1)
    for employee in employees:
        if employee.name == 'Administrator' and admin:
            # Conserva el rol dueño que Plan O dio a admin, y nunca cambia su contraseña.
            employee.write({'user_id': admin.id, 'waiter_role': admin.waiter_role,
                            'waiter_config_ids': [Command.set(admin.waiter_config_ids.ids)]})
            continue
        base = unicodedata.normalize('NFKD', employee.name or '').encode('ascii', 'ignore').decode().lower()
        base = re.sub(r'[^a-z0-9]+', '.', base).strip('.')[:32].rstrip('.')
        if len(base) < 3:
            base = 'persona.' + (base or str(employee.id))
        login, suffix = base, 1
        while users.search_count(['|', ('login', '=ilike', escape_psql(login)), ('email', '=ilike', escape_psql(login))]):
            tail = '.%s' % suffix
            login = base[:32 - len(tail)].rstrip('.') + tail
            suffix += 1
        email = (employee.work_email or '').strip().lower()
        if email and users.search_count(['|', ('email', '=ilike', escape_psql(email)), ('login', '=ilike', escape_psql(email))]):
            raise ValidationError('El correo de %s ya pertenece a otra cuenta. Corrígelo antes de migrar.' % employee.name)
        values = {
            'name': employee.name, 'login': login, 'email': email or False,
            'company_id': employee.company_id.id, 'company_ids': [Command.set(employee.company_id.ids)],
            'waiter_role': employee.waiter_role, 'waiter_config_ids': [Command.set(employee.waiter_config_ids.ids)],
            'group_ids': [Command.set([env.ref(xid).id for xid in GROUPS_BY_ROLE[employee.waiter_role]])],
            'waiter_activated': demo,
        }
        if demo:
            values['password'] = 'waiter-demo-2026'
        user = users.create(values)
        employee.write({'user_id': user.id})
        # Odoo no deja crear una cuenta ya archivada (archiva el contacto antes que la cuenta): se archiva después.
        if not employee.active:
            user.active = False
