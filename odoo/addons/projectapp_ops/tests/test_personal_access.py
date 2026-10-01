"""Contrato P1: credenciales propias, horario, identidad y administración de personas."""
import importlib.util
import json
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessDenied, AccessError, ValidationError
from odoo.tests import HttpCase, TransactionCase, tagged

from ..models.employee import SESSION_HOURS
from ..models.floor_plan import authorize
from ..models.role_permissions import employee_role
from ..models.users import GROUPS_BY_ROLE


INSIDE = datetime(2026, 10, 1, 20, 0)  # 15:00 en Bogotá.
OUTSIDE = datetime(2026, 10, 2, 4, 40)  # 23:40 en Bogotá.
PASSWORD = 'Prueba-personal-2026'


class PersonalFixtures:
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.resource_calendar_id.tz = 'America/Bogota'
        cls.env.company.partner_id.tz = 'America/Bogota'
        cls.env.user.waiter_role = 'owner'
        configs = cls.env['pos.config'].search([('company_id', '=', cls.env.company.id)], order='id', limit=2)
        while len(configs) < 2:
            result = cls.env['pos.config'].waiter_create_restaurant('Local prueba P%s' % len(configs), 'local-prueba-p%s' % len(configs))
            configs |= cls.env['pos.config'].browse(result['id'])
        cls.first, cls.second = configs[0], configs[1]
        configs.write({'waiter_access_margin_minutes': 30})
        cls.owner, cls.owner_employee = cls._person('dueno', 'owner', cls.env['pos.config'])
        cls.manager, cls.manager_employee = cls._person('encargado', 'admin', cls.first)
        cls.other_manager, cls.other_manager_employee = cls._person('encargado.otro', 'admin', cls.second)
        cls.waiter, cls.waiter_employee = cls._person('mesero', 'waiter', cls.first)
        cls.cashier, cls.cashier_employee = cls._person('cajero', 'cashier', cls.first)
        cls.staff = cls.env['hr.employee'].with_user(cls.owner)

    @classmethod
    def _person(cls, suffix, role, configs):
        user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Persona P ' + suffix, 'login': 'prueba.p.' + suffix, 'email': suffix + '_p@example.test',
            'password': PASSWORD, 'waiter_role': role, 'waiter_config_ids': [Command.set(configs.ids)],
            'company_id': cls.env.company.id, 'company_ids': [Command.set(cls.env.company.ids)],
            'group_ids': [Command.set([cls.env.ref(xid).id for xid in GROUPS_BY_ROLE[role]])],
        })
        employee = cls.env['hr.employee'].create({
            'name': user.name, 'user_id': user.id, 'work_email': user.email, 'pin': '789456',
            'company_id': cls.env.company.id, 'shift_start': 14, 'shift_end': 22,
        })
        return user, employee

    def _values(self, **changes):
        return {
            'name': 'Mateo Persona', 'username': 'mateo.persona', 'email': 'mateo_p@example.test',
            'role': 'waiter', 'config_ids': self.first.ids, 'shift_start': 14, 'shift_end': 22, **changes,
        }

    def _credentials(self, user, login=None, password=PASSWORD):
        return {'type': 'password', 'login': login or user.login, 'password': password}


@tagged('post_install', '-at_install')
class TestPersonalAccess(PersonalFixtures, TransactionCase):
    def test_username_and_email_authenticate_case_insensitively(self):
        # Falla si el login con puntos o el correo con guion bajo no identifica a la misma persona.
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            for login in (self.waiter.login.upper(), self.waiter.email.upper(), ' ' + self.waiter.email + ' '):
                result = self.env['res.users']._login(self._credentials(self.waiter, login), {'interactive': True})
                self.assertEqual(result['uid'], self.waiter.id)

    def test_login_matches_literal_characters_and_rejects_ambiguity(self):
        # Falla si %, _ o una coincidencia parcial suplantan otra cuenta, o se elige un correo ambiguo.
        users = self.env['res.users']
        for login in ('%', 'prueba.p.%', 'mesero%@example.test', 'mesero_p@example.tes', 'prueba_p_mesero'):
            self.assertFalse(users._waiter_find_login(login))
        self.assertEqual(users._waiter_find_login(self.waiter.email.upper()).id, self.waiter.id)
        self.cashier.email = self.waiter.email.upper()
        self.assertFalse(users._waiter_find_login(self.waiter.email))
        self.assertEqual(users._waiter_find_login(self.waiter.login).id, self.waiter.id)

    def test_password_and_noninteractive_authentication_reject_outside_hours(self):
        # Falla si una vía de autenticación omite la ventana de meseros o cajeros.
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            for user in (self.waiter, self.cashier):
                for interactive in (True, False):
                    with self.assertRaisesRegex(AccessDenied, '14:00–22:00'):
                        user.with_user(user)._check_credentials(self._credentials(user), {'interactive': interactive})

    def test_rpc_credential_cache_does_not_bypass_the_window(self):
        # Falla si unas credenciales cacheadas durante el turno siguen autorizando al terminarlo.
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            self.env['res.users']._check_uid_passwd(self.waiter.id, PASSWORD)
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            with self.assertRaises(AccessDenied):
                self.env['res.users']._check_uid_passwd(self.waiter.id, PASSWORD)

    def test_margin_and_end_exclusion_use_company_timezone(self):
        # Falla si se usa la zona del dispositivo o se permite entrar en el instante exacto de caducidad.
        self.env.company.partner_id.tz = 'Europe/Paris'
        employee = self.waiter_employee.with_context(tz='Asia/Tokyo')
        for instant, expected in (
                (datetime(2026, 10, 1, 18, 29, 59), False),
                (datetime(2026, 10, 1, 18, 30), True),
                (datetime(2026, 10, 2, 3, 29, 59), True),
                (datetime(2026, 10, 2, 3, 30), False)):
            self.assertEqual(employee._waiter_access_window(instant)['allowed'], expected)
        self.first.waiter_access_margin_minutes = 0
        self.assertFalse(employee._waiter_access_window(datetime(2026, 10, 1, 18, 30))['allowed'])
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self.first.waiter_access_margin_minutes = -1

    def test_overnight_shift_and_margin_before_midnight(self):
        # Falla si la madrugada se atribuye al día equivocado o se pierde el margen anterior a medianoche.
        self.waiter_employee.write({'shift_start': 22, 'shift_end': 6})
        for instant, expected in (
                (datetime(2026, 10, 2, 2, 29), False),
                (datetime(2026, 10, 2, 2, 30), True),
                (datetime(2026, 10, 2, 8), True),
                (datetime(2026, 10, 2, 11, 30), False)):
            self.assertEqual(self.waiter_employee._waiter_access_window(instant)['allowed'], expected)
        self.waiter_employee.write({'shift_start': 0, 'shift_end': 6})
        window = self.waiter_employee._waiter_access_window(datetime(2026, 10, 2, 4, 45))
        self.assertTrue(window['allowed'])
        self.assertEqual(window['end'], datetime(2026, 10, 2, 11, 30))

    def test_no_schedule_owner_and_manager_have_no_hour_restriction(self):
        # Falla si omitir el turno bloquea una cuenta o si dueño y encargado heredan el límite horario.
        self.waiter_employee.write({'shift_start': 0, 'shift_end': 0})
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            for user in (self.waiter, self.owner, self.manager):
                result = user.with_user(user)._check_credentials(self._credentials(user), {'interactive': True})
                self.assertEqual(result['uid'], user.id)
                shift = self.env['hr.employee'].with_user(user).waiter_start_my_shift()
                self.assertEqual(shift['session_ends'], (OUTSIDE + timedelta(hours=SESSION_HOURS)).isoformat() + 'Z')

    def test_start_my_shift_contract_attendance_and_expiry(self):
        # Falla si el token no sirve para la política de roles, duplica asistencia o supera el fin de la ventana.
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            result = self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift(self.first.id)
            self.assertEqual(set(result), {'ok', 'employee', 'attendance_id', 'token', 'session_ends', 'config_ids'})
            self.assertTrue(result['ok'])
            self.assertEqual(result['employee']['id'], self.waiter_employee.id)
            self.assertEqual(result['config_ids'], self.first.ids)
            self.assertEqual(result['session_ends'], '2026-10-02T03:30:00Z')
            again = self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift()
            self.assertEqual((again['token'], again['attendance_id']), (result['token'], result['attendance_id']))
            _employee, role = employee_role(self.waiter.with_user(self.waiter).env, self.waiter_employee.id, result['token'])
            self.assertEqual(role, 'waiter')
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 2, 3, 30)):
            self.assertFalse(self.waiter_employee._waiter_session_ok(result['token']))

    def test_manager_token_authorizes_floor_and_end_shift_revokes_it(self):
        # Falla si authorize no acepta el token nuevo o cerrar el turno deja viva la identidad.
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            model = self.env['hr.employee'].with_user(self.manager)
            result = model.waiter_start_my_shift(self.first.id)
            authorize(self.manager.with_user(self.manager).env, self.manager_employee.id, result['token'])
            self.assertTrue(model.waiter_end_shift(self.manager_employee.id, token=result['token'])['ok'])
            with self.assertRaises(AccessError):
                authorize(self.manager.with_user(self.manager).env, self.manager_employee.id, result['token'])

    def test_person_can_close_own_attendance_when_token_expires(self):
        # Falla si el cierre automático al fin de la ventana deja la asistencia abierta o permite cerrar una ajena.
        model = self.env['hr.employee'].with_user(self.waiter)
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            shift = model.waiter_start_my_shift()
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 2, 3, 30)):
            self.assertFalse(self.waiter_employee._waiter_session_ok(shift['token']))
            self.assertTrue(model.waiter_end_shift(self.waiter_employee.id, token=shift['token'])['ok'])
            with self.assertRaises(AccessError):
                model.waiter_end_shift(self.cashier_employee.id, token=shift['token'])

    def test_start_errors_and_restaurant_scope(self):
        # Falla si se abre asistencia fuera del turno, sin empleado o para un restaurante ajeno.
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            result = self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift()
            self.assertEqual(result, {'ok': False, 'reason': 'outside_hours', 'window': '14:00–22:00'})
            self.assertFalse(self.waiter_employee._waiter_open_attendance())
        with self.assertRaises(AccessError):
            self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift(self.second.id)
        self.waiter_employee.write({'user_id': False})
        self.assertEqual(self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift(),
                         {'ok': False, 'reason': 'no_employee'})

    def test_legacy_pin_cannot_bypass_access_hours(self):
        # Falla si el PIN conservado permite abrir otra identidad fuera de la ventana.
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            result = self.staff.waiter_check_pin(self.waiter_employee.id, '789456')
            self.assertEqual(result['reason'], 'outside_hours')
            self.assertFalse(self.waiter_employee._waiter_open_attendance())

    def test_invite_creates_linked_person_with_exact_contract(self):
        # Falla si el alta pierde rol, local o turno, hereda permisos administrativos o no envía el código.
        with patch.object(type(self.env['mail.mail']), 'send', return_value=True):
            result = self.staff.waiter_invite_person(self._values(username='Mateo.Persona', email='Mateo_P@example.test'))
        self.assertEqual(set(result), {'employee_id', 'user_id', 'invite_sent'})
        self.assertTrue(result['invite_sent'])
        employee = self.env['hr.employee'].browse(result['employee_id'])
        user = employee.user_id
        self.assertEqual(user.id, result['user_id'])
        self.assertEqual((user.login, user.email), ('mateo.persona', 'mateo_p@example.test'))
        self.assertEqual((employee.waiter_role, user.waiter_role), ('waiter', 'waiter'))
        self.assertEqual(employee.waiter_config_ids, self.first)
        self.assertEqual(user.waiter_config_ids, self.first)
        self.assertEqual((employee.shift_start, employee.shift_end), (14, 22))
        self.assertTrue(user.waiter_invite_code)
        self.assertFalse(user.waiter_activated)
        self.assertFalse(user.has_group('base.group_system'))
        self.assertFalse(user.has_group('projectapp_ops.group_waiter_owner'))

    def test_invite_keeps_the_person_when_the_mail_server_fails(self):
        # Falla si un servidor de correo caído deshace el alta en vez de dejar la invitación pendiente para reenviarla.
        with patch.object(type(self.env['mail.mail']), 'send', side_effect=OSError('SMTP caído')):
            result = self.staff.waiter_invite_person(self._values(username='sin.correo', email='sin.correo@example.test'))
        self.assertFalse(result['invite_sent'])
        user = self.env['res.users'].browse(result['user_id'])
        self.assertEqual(user.login, 'sin.correo')
        self.assertFalse(user.waiter_activated)
        self.assertEqual(self.env['hr.employee'].browse(result['employee_id']).user_id, user)

    def test_invite_validates_identity_and_number_of_restaurants(self):
        # Falla si se aceptan identidades duplicadas, formatos inválidos o meseros/cajeros sin un único restaurante.
        invalid = [
            {'username': self.waiter.login.upper()}, {'email': self.waiter.email.upper()},
            {'username': 'ab'}, {'username': 'a' * 33}, {'username': 'mateo_persona'}, {'username': 'mateo%persona'},
            {'email': 'sin-correo'}, {'role': 'superusuario'}, {'name': ''}, {'config_ids': [True]},
            {'shift_start': -1}, {'shift_end': float('nan')}, {'shift_end': 25}, {'password': 'inyectada'},
        ]
        for role in ('waiter', 'cashier'):
            invalid.extend([{'role': role, 'config_ids': []}, {'role': role, 'config_ids': (self.first | self.second).ids}])
        for values in invalid:
            with self.subTest(values=values), self.assertRaises(ValidationError):
                self.staff.waiter_invite_person(self._values(**values))
        self.waiter.active = False
        with self.assertRaises(ValidationError):
            self.staff.waiter_invite_person(self._values(username=self.waiter.login))

    def test_manager_invites_only_inside_scope_without_granting_owner(self):
        # Falla si un encargado concede dueño, añade otro restaurante o administra un operador ajeno.
        model = self.env['hr.employee'].with_user(self.manager)
        for values in ({'role': 'owner'}, {'config_ids': self.second.ids}, {'role': 'admin', 'config_ids': (self.first | self.second).ids}):
            with self.assertRaises(AccessError):
                model.waiter_invite_person(self._values(**values))
        with patch.object(type(self.env['mail.mail']), 'send', return_value=True):
            result = model.waiter_invite_person(self._values(role='admin'))
        employee = self.env['hr.employee'].browse(result['employee_id'])
        self.assertEqual(employee.waiter_config_ids, self.first)
        with self.assertRaises(AccessError):
            model.waiter_update_person(self.other_manager_employee.id, {'email': 'ajeno@example.test'})
        with self.assertRaises(AccessError):
            model.waiter_update_person(self.waiter_employee.id, {'role': 'owner'})
        with self.assertRaises(AccessError):
            self.env['hr.employee'].with_user(self.waiter).waiter_invite_person(self._values())
        self.manager.group_ids |= self.env.ref('base.group_erp_manager')
        with self.assertRaises(AccessError):
            model.waiter_invite_person(self._values(role='owner'))
        with self.assertRaises(AccessError):
            model.waiter_deactivate_person(self.other_manager_employee.id)

    def test_update_syncs_account_and_revokes_old_identity(self):
        # Falla si editar deja diferentes rol/correo/local en cuenta y empleado o conserva un token anterior.
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift()
        self.assertTrue(self.staff.waiter_update_person(self.waiter_employee.id, {
            'role': 'admin', 'config_ids': (self.first | self.second).ids, 'email': 'editada_p@example.test',
            'shift_start': 22, 'shift_end': 6,
        }))
        self.assertEqual(self.waiter.waiter_role, 'admin')
        self.assertEqual(self.waiter.waiter_config_ids, self.first | self.second)
        self.assertEqual(self.waiter_employee.waiter_config_ids, self.waiter.waiter_config_ids)
        self.assertEqual(self.waiter.email, self.waiter_employee.work_email)
        self.assertEqual((self.waiter_employee.shift_start, self.waiter_employee.shift_end), (22, 6))
        self.assertFalse(self.waiter_employee.waiter_session_token)
        with self.assertRaises(ValidationError):
            self.staff.waiter_update_person(self.waiter_employee.id, {'email': self.cashier.email.upper()})
        with self.assertRaises(ValidationError):
            self.staff.waiter_update_person(self.waiter_employee.id, {'role': 'cashier'})
        self.assertEqual(self.waiter.waiter_role, 'admin')

    def test_invite_and_reset_codes_expire_and_say_how_to_use_them(self):
        # Falla si el código de «olvidé mi contraseña» dura lo mismo que la invitación, si la invitación no lleva el
        # usuario y el enlace que abre el POS en «escribe el código», o si el código sirve dos veces.
        self.env['ir.config_parameter'].set_param('projectapp.pos_url', 'https://pos.example.test/')
        mails = []
        create = type(self.env['mail.mail']).create

        def capture(model, values):
            mails.append(values)
            return create(model, values)
        with patch.object(type(self.env['mail.mail']), 'send', return_value=True), \
                patch.object(type(self.env['mail.mail']), 'create', capture), \
                patch.object(fields.Datetime, 'now', return_value=INSIDE):
            self.waiter.write({'waiter_activated': False, 'waiter_invite_sent_at': False})
            self.waiter.send_waiter_invite()
            self.assertEqual(self.waiter.waiter_invite_expires, INSIDE + timedelta(hours=48))
            self.assertIn(self.waiter.login, mails[-1]['body_html'])
            self.assertIn('https://pos.example.test/login?codigo=' + self.waiter.login, mails[-1]['body_html'])
            self.waiter.waiter_invite_sent_at = False
            self.waiter.send_waiter_invite(purpose='reset')
            self.assertEqual(self.waiter.waiter_invite_expires, INSIDE + timedelta(minutes=30))
            self.assertIn('30 minutos', mails[-1]['body_html'])
        self.waiter.waiter_invite_sent_at = False
        code = self.waiter.with_user(self.owner).send_waiter_invite(dry_run=True, purpose='reset')
        self.assertTrue(self.waiter.waiter_check_code(code))
        self.waiter.write({'waiter_invite_code': False})  # lo que hace /waiter/auth/activate al usarlo
        self.assertFalse(self.waiter.waiter_check_code(code))

    def test_resend_rotates_code_and_preserves_activated_account(self):
        # Falla si restablecer no renueva el código, salta el límite de reenvío o archiva una cuenta activada.
        self.waiter.waiter_activated = True
        with patch.object(type(self.env['mail.mail']), 'send', return_value=True), patch.object(fields.Datetime, 'now', return_value=INSIDE), \
                patch('odoo.addons.projectapp_ops.models.users.secrets.randbelow', return_value=123456):
            self.assertTrue(self.staff.waiter_resend_invite(self.waiter_employee.id))
            first = self.waiter.waiter_invite_code
            self.assertFalse(self.staff.waiter_resend_invite(self.waiter_employee.id))
        with patch.object(type(self.env['mail.mail']), 'send', return_value=True), patch.object(fields.Datetime, 'now', return_value=INSIDE + timedelta(minutes=2)), \
                patch('odoo.addons.projectapp_ops.models.users.secrets.randbelow', return_value=654321):
            self.assertTrue(self.staff.waiter_resend_invite(self.waiter_employee.id))
        self.assertNotEqual(self.waiter.waiter_invite_code, first)
        self.assertTrue(self.waiter.waiter_activated)
        with self.assertRaises(AccessError):
            self.env['hr.employee'].with_user(self.other_manager).waiter_resend_invite(self.waiter_employee.id)

    def test_deactivation_preserves_history_and_denies_access(self):
        # Falla si desactivar borra el historial o deja usable la cuenta, el token o la invitación.
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            shift = self.env['hr.employee'].with_user(self.waiter).waiter_start_my_shift()
            self.assertTrue(self.staff.waiter_deactivate_person(self.waiter_employee.id))
        attendance = self.env['hr.attendance'].browse(shift['attendance_id']).exists()
        self.assertTrue(attendance.check_out)
        self.assertFalse(self.waiter_employee.active)
        self.assertFalse(self.waiter.active)
        self.assertFalse(self.waiter_employee._waiter_session_ok(shift['token']))
        self.assertFalse(self.env['res.users']._waiter_find_login(self.waiter.login))
        self.assertFalse(self.waiter.waiter_invite_code)
        with self.assertRaises(ValidationError):
            self.staff.waiter_resend_invite(self.waiter_employee.id)
        with self.assertRaises(AccessError):
            self.env['hr.employee'].with_user(self.manager).waiter_deactivate_person(self.other_manager_employee.id)


@tagged('post_install', '-at_install')
class TestPersonalLogin(PersonalFixtures, HttpCase):
    def _rpc(self, path, params):
        self.env.flush_all()
        response = self.url_open(path, data=json.dumps({'jsonrpc': '2.0', 'method': 'call', 'params': params}),
                                 headers={'Content-Type': 'application/json'})
        return response.json()

    def _login(self, login):
        return self._rpc('/web/session/authenticate', {'db': self.env.cr.dbname, 'login': login, 'password': PASSWORD})

    def test_http_username_email_and_pos_identity(self):
        # Falla si el acceso HTTP no admite correo o si waiter_pos_identity rechaza el token de inicio sin PIN.
        with patch.object(fields.Datetime, 'now', return_value=INSIDE):
            for login in (self.manager.login.upper(), self.manager.email.upper()):
                self.assertEqual(self._login(login)['result']['uid'], self.manager.id)
                shift = self._rpc('/web/dataset/call_kw', {
                    'model': 'hr.employee', 'method': 'waiter_start_my_shift', 'args': [self.first.id], 'kwargs': {},
                })['result']
                policy = self._rpc('/web/dataset/call_kw', {
                    'model': 'pos.config', 'method': 'waiter_role_policy', 'args': [self.first.ids],
                    'kwargs': {'employee_id': self.manager_employee.id, 'token': shift['token'], 'context': {
                        'waiter_pos_identity': {'id': self.manager_employee.id, 'token': shift['token'], 'config_id': self.first.id},
                    }},
                })
                self.assertIn('admin', policy['result'])

    def test_request_and_activate_with_email_or_username(self):
        # Falla si los endpoints públicos no encuentran el correo con guion bajo o no activan la misma cuenta.
        with patch.object(type(self.env['mail.mail']), 'send', return_value=True):
            self.assertEqual(self._rpc('/waiter/auth/request_code', {'login': self.waiter.email.upper()})['result'], {'ok': True})
        self.waiter.invalidate_recordset()
        self.assertTrue(self.waiter.waiter_invite_code)
        for login in (self.waiter.login.upper(), self.waiter.email.upper()):
            code = self.waiter.with_user(self.owner).send_waiter_invite(dry_run=True)
            result = self._rpc('/waiter/auth/activate', {'login': login, 'code': code, 'password': PASSWORD})
            self.assertEqual(result['result'], {'ok': True})
            self.waiter.invalidate_recordset()
            self.assertTrue(self.waiter.waiter_activated)
            self.assertFalse(self.waiter.waiter_invite_code)

    def test_http_denial_persists_access_alert_for_local_manager_and_owner(self):
        # Falla si AccessDenied revierte el aviso o si lo reciben meseros y encargados de otro restaurante.
        if 'waiter.notification' not in self.env.registry:
            self.skipTest('Esta prueba necesita projectapp_notify instalado.')
        notifications = self.env['waiter.notification']
        domain = [('kind', '=', 'access'), ('res_model', '=', 'hr.employee'), ('res_id', '=', self.waiter_employee.id)]
        before = notifications.search(domain)
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            result = self._login(self.waiter.email)
        self.assertIn('error', result)
        self.assertIn('14:00–22:00', json.dumps(result, ensure_ascii=False))
        notices = notifications.search(domain) - before
        self.assertIn(self.manager, notices.user_id)
        self.assertIn(self.owner, notices.user_id)
        self.assertNotIn(self.other_manager, notices.user_id)
        self.assertNotIn(self.waiter, notices.user_id)
        self.assertEqual(notices.config_id, self.first)
        self.assertTrue(all('23:40' in row.body and '14:00–22:00' in row.body for row in notices))
        with patch.object(fields.Datetime, 'now', return_value=OUTSIDE):
            self._rpc('/web/session/authenticate', {'db': self.env.cr.dbname, 'login': self.waiter.login, 'password': 'incorrecta'})
        self.assertEqual(notifications.search(domain), before | notices)


@tagged('post_install', '-at_install')
class TestPersonalMigration(PersonalFixtures, TransactionCase):
    def _migrate(self):
        path = Path(__file__).resolve().parents[1] / 'migrations' / '19.0.2.6.0' / 'post-migrate.py'
        spec = importlib.util.spec_from_file_location('waiter_migrate_p', path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        self.env.flush_all()
        migration.migrate(self.cr, '19.0.2.5.0')
        self.env.invalidate_all()

    def _unlinked(self, **values):
        return self.env['hr.employee'].create({
            'name': 'Sofía Migración P', 'company_id': self.env.company.id, 'waiter_role': 'cashier',
            'waiter_config_ids': [Command.set(self.second.ids)], 'pin': '654321', **values,
        })

    def test_production_migration_is_idempotent_and_has_no_demo_password(self):
        # Falla si producción recibe contraseña demo, si se pierden datos o si repetir la migración duplica cuentas.
        self.env['ir.config_parameter'].search([('key', '=', 'projectapp.demo_mode')]).unlink()
        first = self._unlinked(work_email='sofia.migracion.p@example.test')
        second = self._unlinked()
        self._migrate()
        self.assertEqual(first.user_id.login, 'sofia.migracion.p')
        self.assertEqual(second.user_id.login, 'sofia.migracion.p.1')
        self.assertEqual(first.user_id.email, first.work_email)
        self.assertEqual(first.user_id.waiter_role, first.waiter_role)
        self.assertEqual(first.user_id.waiter_config_ids, first.waiter_config_ids)
        self.assertFalse(first.user_id.waiter_activated)
        self.assertEqual(first.pin, '654321')
        self.cr.execute('SELECT password FROM res_users WHERE id = %s', [first.user_id.id])
        self.assertFalse(self.cr.fetchone()[0])
        ids = (first.user_id.id, second.user_id.id)
        self.env['ir.config_parameter'].set_param('projectapp.demo_mode', 'true')
        self._migrate()
        self.assertEqual((first.user_id.id, second.user_id.id), ids)
        self.cr.execute('SELECT password FROM res_users WHERE id = %s', [first.user_id.id])
        self.assertFalse(self.cr.fetchone()[0])

    def test_migration_bounds_username_length_and_reserves_archived_logins(self):
        # Falla si quitar tildes excede los 32 caracteres o si se reutiliza el usuario de una cuenta archivada.
        self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Usuario reservado P', 'login': 'a' * 32, 'active': False,
            'waiter_config_ids': [Command.set(self.first.ids)],
        })
        first = self._unlinked(name='Á' * 40)
        second = self._unlinked(name='Á' * 40)
        self._migrate()
        self.assertEqual(first.user_id.login, 'a' * 30 + '.1')
        self.assertEqual(second.user_id.login, 'a' * 30 + '.2')

    def test_migration_reports_duplicate_email_without_linking_another_person(self):
        # Falla si un correo ya usado vincula dos personas a la misma cuenta o crea una identidad ambigua.
        employee = self._unlinked(work_email=self.waiter.email.upper())
        with self.assertRaisesRegex(ValidationError, 'correo'), self.cr.savepoint():
            self._migrate()
        self.assertFalse(employee.user_id)

    def test_demo_migration_and_archived_employee(self):
        # Falla si habilitar explícitamente la demo no fija su contraseña o si una persona archivada revive.
        self.env['ir.config_parameter'].set_param('projectapp.demo_mode', 'true')
        active = self._unlinked()
        archived = self._unlinked(name='Persona Archivada P', active=False)
        self._migrate()
        self.assertTrue(active.user_id.waiter_activated)
        result = active.user_id.with_user(active.user_id)._check_credentials(
            self._credentials(active.user_id, password='waiter-demo-2026'), {'interactive': True})
        self.assertEqual(result['uid'], active.user_id.id)
        self.assertTrue(archived.user_id)
        self.assertFalse(archived.user_id.active)
        self.assertFalse(archived.active)

    def test_administrator_links_to_admin_without_changing_password_or_role(self):
        # Falla si Administrator recibe otra cuenta, degrada al dueño admin o sustituye su contraseña.
        admin = self.env['res.users'].search([('login', '=', 'admin')], limit=1)
        self.assertTrue(admin)
        employee = self.env['hr.employee'].with_context(active_test=False).search([
            ('user_id', '=', admin.id), ('company_id', '=', self.env.company.id),
        ], limit=1)
        if employee:
            employee.write({'name': 'Administrator', 'user_id': False})
        else:
            employee = self._unlinked(name='Administrator')
        self.cr.execute('SELECT password FROM res_users WHERE id = %s', [admin.id])
        before = self.cr.fetchone()[0]
        role = admin.waiter_role
        self.env['ir.config_parameter'].set_param('projectapp.demo_mode', 'true')
        self._migrate()
        self.assertEqual(employee.user_id, admin)
        self.assertEqual(employee.waiter_role, role)
        self.assertEqual(employee.waiter_config_ids, admin.waiter_config_ids)
        self.cr.execute('SELECT password FROM res_users WHERE id = %s', [admin.id])
        self.assertEqual(self.cr.fetchone()[0], before)
