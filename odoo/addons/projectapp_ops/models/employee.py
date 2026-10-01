"""Identidad del empleado y asistencia sobre pos_hr + hr_attendance.

El Plan P vincula cada persona a su cuenta y abre la identidad con waiter_start_my_shift.
El PIN se conserva por compatibilidad; ambos accesos emiten el mismo token y respetan el horario.
"""
import secrets
from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

ROLES = [("waiter", "Mesero"), ("cashier", "Cajero"), ("admin", "Encargado"), ("owner", "Dueño")]
EMPLOYMENT = [("full_time", "Tiempo completo"), ("part_time", "Medio tiempo"), ("contract", "Contrato")]
PIN_MAX_ATTEMPTS = 5
PIN_LOCK_MINUTES = 10
PIN_RESET_SECONDS = 60      # mínimo entre correos de «olvidé mi PIN» por empleado
SESSION_HOURS = 16          # vida del token de sesión de empleado (un turno largo)
MANAGER_GROUPS = ("point_of_sale.group_pos_manager", "hr.group_hr_manager")
# Todos llevan `groups="hr.group_hr_user"`, como el `pin` de Odoo: hr.employee considera privado
# cualquier campo que no exista en hr.employee.public y, al leerlo, en vez de omitirlo lanza AccessError.
# Sin el grupo, la lectura de empleados dentro de `pos.session.load_data` reventaba y el mesero se
# quedaba sin carta.
# Estos campos NO se añaden a `_load_pos_data_fields`: viven en hr.employee, que reserva sus datos a
# `hr.group_hr_user`. Pedirlos en `pos.session.load_data` hacía que Odoo lanzara AccessError para quien
# atiende, la carga se quedaba sin `pos.config` y pos_loyalty terminaba reventando con un IndexError:
# el mesero validaba su PIN y el POS no podía abrir la carta. El selector los recibe por `waiter_login_list`,
# que va con sudo y no expone el PIN.
WAITER_EMPLOYEE_FIELDS = ["waiter_role", "employee_code", "joining_date", "shift_start", "shift_end", "employment_status"]


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    waiter_role = fields.Selection(ROLES, string="Rol en Waiter", default="waiter", required=True, groups="hr.group_hr_user")
    employee_code = fields.Char(string="Código de empleado", copy=False, readonly=True, index=True,
                                help="Secuencia WT-0001, WT-0002… (kit: Employee ID). Se asigna al crear.", groups="hr.group_hr_user")
    joining_date = fields.Date(string="Fecha de ingreso", groups="hr.group_hr_user")
    shift_start = fields.Float(string="Inicio del turno (h)", help="Hora decimal, p. ej. 8.5 = 08:30. Vacío: sin turno fijo.", groups="hr.group_hr_user")
    shift_end = fields.Float(string="Fin del turno (h)", groups="hr.group_hr_user")
    employment_status = fields.Selection(EMPLOYMENT, string="Tipo de vinculación", groups="hr.group_hr_user")
    waiter_pin_attempts = fields.Integer(string="Intentos fallidos del PIN", default=0, copy=False, groups="hr.group_hr_user")
    waiter_pin_locked_until = fields.Datetime(string="PIN bloqueado hasta", copy=False, groups="hr.group_hr_user")
    waiter_pin_reset_at = fields.Datetime(string="Último envío de PIN nuevo", copy=False, groups="hr.group_hr_user")
    waiter_session_token = fields.Char(string="Token de sesión de empleado", copy=False, groups="hr.group_hr_user")
    waiter_session_expires = fields.Datetime(string="El token caduca", copy=False, groups="hr.group_hr_user")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get("employee_code"):
                vals["employee_code"] = self.env["ir.sequence"].sudo().next_by_code("waiter.employee.code")
        return super().create(vals_list)

    # --- Helpers ----------------------------------------------------------------------------------

    @staticmethod
    def _waiter_valid_pin(pin):
        return isinstance(pin, str) and len(pin) == 6 and pin.isascii() and pin.isdigit()

    def _waiter_employee_dict(self):
        """Lo que el POS guarda en `authStore.employee` tras validar el PIN."""
        self.ensure_one()
        return {
            "id": self.id, "name": self.name, "waiter_role": self.waiter_role, "employee_code": self.employee_code,
            "joining_date": fields.Date.to_string(self.joining_date) if self.joining_date else False,
            "shift_start": self.shift_start, "shift_end": self.shift_end, "employment_status": self.employment_status,
            "work_email": self.work_email or False, "job_title": self.job_title or False,
            "user_id": self.user_id.id or False, "waiter_config_ids": self.waiter_config_ids.ids,
        }

    def _waiter_open_attendance(self):
        return self.env["hr.attendance"].sudo().search(
            [("employee_id", "=", self.id), ("check_out", "=", False)], order="check_in desc", limit=1)

    def _waiter_require_pos_user(self):
        if not self.env.user.has_group("point_of_sale.group_pos_user"):
            raise AccessError(_("Solo un usuario del punto de venta puede operar con el PIN de los empleados."))

    def _waiter_is_manager(self):
        """Ojo: llámalo SIN sudo. Bajo sudo `self.env.user` es el superusuario y no responde por los grupos."""
        return any(self.env.user.has_group(group) for group in MANAGER_GROUPS)

    def _waiter_new_session(self, expires=None):
        """Emite el token que prueba «soy este empleado» durante el turno."""
        self.ensure_one()
        # Un segundo acceso con PIN no debe expulsar las otras pantallas del turno.
        self.env.cr.execute("SELECT id FROM hr_employee WHERE id = %s FOR UPDATE", [self.id])
        self.invalidate_recordset(["waiter_session_token", "waiter_session_expires"])
        if self._waiter_session_ok(self.waiter_session_token):
            if expires and self.waiter_session_expires != expires:
                self.write({"waiter_session_expires": expires})
            return self.waiter_session_token
        token = secrets.token_urlsafe(32)
        self.write({"waiter_session_token": token,
                    "waiter_session_expires": expires or fields.Datetime.now() + timedelta(hours=SESSION_HOURS)})
        return token

    def _waiter_session_ok(self, token):
        """El token identifica a este empleado y no ha caducado. Comparación en tiempo constante."""
        self.ensure_one()
        if not token or not self.waiter_session_token or not self.waiter_session_expires:
            return False
        if self.waiter_session_expires <= fields.Datetime.now():
            return False
        if not self.active or (self.user_id and not self.user_id.active) or not self._waiter_access_window()['allowed']:
            return False
        return secrets.compare_digest(self.waiter_session_token, str(token))

    def _waiter_authorize(self, token=None, current_pin=None, is_manager=False):
        """Autoriza una acción sensible sobre este empleado: su token de sesión, su PIN actual, o un
        encargado (`is_manager` lo calcula el llamador sin sudo). Un PIN actual equivocado cuenta como
        intento fallido: si no, el campo sería un oráculo para adivinar el PIN a fuerza bruta."""
        self.ensure_one()
        if self._waiter_session_ok(token):
            return True
        if current_pin is not None:
            if self.pin and secrets.compare_digest(self.pin, str(current_pin)):
                return True
            self._waiter_register_failure()
            raise AccessError(_("El PIN actual no coincide."))
        if is_manager:
            return True
        raise AccessError(_("Vuelve a identificarte con tu PIN para hacer este cambio."))

    def _waiter_register_failure(self):
        """Suma un intento fallido y bloquea al llegar al máximo. Devuelve el resultado para el POS."""
        self.ensure_one()
        now = fields.Datetime.now()
        attempts = self.waiter_pin_attempts + 1
        if attempts >= PIN_MAX_ATTEMPTS:
            locked_until = now + timedelta(minutes=PIN_LOCK_MINUTES)
            self.write({"waiter_pin_attempts": 0, "waiter_pin_locked_until": locked_until})
            return {"ok": False, "reason": "locked", "locked_until": fields.Datetime.to_string(locked_until)}
        self.write({"waiter_pin_attempts": attempts})
        return {"ok": False, "reason": "wrong", "attempts_left": PIN_MAX_ATTEMPTS - attempts}

    # --- API que consume el POS (RPC sobre hr.employee) -------------------------------------------

    @api.model
    def waiter_login_list(self, config_id=None):
        """Empleados que puede elegir el terminal para identificarse, con lo justo para pintar el selector.

        Va con sudo a propósito: `employee_code`, `waiter_role` y el turno son campos de RR. HH. y un mesero
        no los puede leer por `search_read` (Odoo responde «no están disponibles para los perfiles públicos»),
        así que sin esto la lista llegaba vacía y nadie sin permisos de RR. HH. podía entrar. No expone el PIN.
        """
        self._waiter_require_pos_user()
        config = self.env["pos.config"]._waiter_selected_config(config_id)
        employees = self.sudo().search(config._employee_domain(self.env.uid))
        return [{
            "id": e.id, "name": e.name, "employee_code": e.employee_code or False,
            "waiter_role": e.waiter_role or False, "waiter_config_ids": e.waiter_config_ids.ids, "shift_start": e.shift_start, "shift_end": e.shift_end,
        } for e in employees.sorted("name")]

    @api.model
    def waiter_check_pin(self, employee_id, pin):
        """Valida el PIN en el servidor y abre la asistencia del día.

        Devuelve `{ok: True, employee: {...}, attendance_id, token}` o `{ok: False, reason: 'wrong'|'locked'|
        'unknown', attempts_left, locked_until}`. Tras PIN_MAX_ATTEMPTS fallos el PIN queda bloqueado
        PIN_LOCK_MINUTES. El `token` prueba la identidad del empleado en las acciones sensibles: guárdalo
        en el dispositivo y no lo muestres.
        """
        self._waiter_require_pos_user()
        owner = self.env.user.has_group('projectapp_ops.group_waiter_owner')
        allowed_ids = self.env.user.waiter_config_ids.ids
        employee = self.sudo().browse(int(employee_id)).exists()
        if (not employee or not employee.active or employee.company_id not in self.env.companies or
                (not owner and employee.waiter_role != 'owner' and not set(employee.waiter_config_ids.ids) & set(allowed_ids))):
            return {"ok": False, "reason": "unknown"}
        if self.env.context.get('waiter_config_id'):
            config = self.env['pos.config']._waiter_selected_config()
            if employee.waiter_role != 'owner' and config.id not in employee.waiter_config_ids.ids:
                return {'ok': False, 'reason': 'unknown'}
        now = fields.Datetime.now()
        if employee.waiter_pin_locked_until and employee.waiter_pin_locked_until > now:
            return {"ok": False, "reason": "locked", "locked_until": fields.Datetime.to_string(employee.waiter_pin_locked_until)}
        pin = str(pin or "")
        if employee.pin and secrets.compare_digest(employee.pin, pin):
            window = employee._waiter_access_window()
            if not window['allowed']:
                employee._waiter_notify_outside_hours(window)
                return {'ok': False, 'reason': 'outside_hours', 'window': window['label']}
            employee.write({"waiter_pin_attempts": 0, "waiter_pin_locked_until": False})
            attendance = employee._waiter_open_attendance()
            if not attendance:
                attendance = self.env["hr.attendance"].sudo().create({"employee_id": employee.id, "check_in": now})
            return {"ok": True, "employee": employee._waiter_employee_dict(), "attendance_id": attendance.id,
                    "token": employee._waiter_new_session(expires=window['end'])}
        return employee._waiter_register_failure()

    @api.model
    def waiter_change_pin(self, employee_id, new_pin, token=None, current_pin=None):
        """Cambia el PIN: exactamente 6 dígitos ASCII. Devuelve True.

        Exige probar que quien llama es ese empleado: el `token` de `waiter_check_pin`, o el `current_pin`.
        Un encargado (POS o RR. HH.) puede cambiarlo sin nada de eso. Sin prueba, `AccessError`: si no,
        cualquier tablet con la sesión del terminal podría cambiarle el PIN al administrador.
        """
        self._waiter_require_pos_user()
        if not self._waiter_valid_pin(str(new_pin) if isinstance(new_pin, int) else new_pin):
            raise UserError(_("El PIN debe tener exactamente 6 dígitos."))
        is_manager = self._waiter_is_manager()
        employee = self.sudo().browse(int(employee_id)).exists()
        if not employee:
            raise UserError(_("El empleado no existe."))
        employee._waiter_authorize(token=token, current_pin=current_pin, is_manager=is_manager)
        employee.write({"pin": str(new_pin), "waiter_pin_attempts": 0, "waiter_pin_locked_until": False})
        return True

    @api.model
    def waiter_forgot_pin(self, email):
        """Genera un PIN nuevo y lo envía al correo de trabajo del empleado. Siempre devuelve True: nunca
        revela si el correo existe. Un envío por minuto por empleado."""
        self._waiter_require_pos_user()
        email = (email or "").strip().lower()
        if not email:
            return True
        employee = self.sudo().search([("work_email", "=ilike", email), ("active", "=", True)], limit=1)
        now = fields.Datetime.now()
        if not employee or (employee.waiter_pin_reset_at and (now - employee.waiter_pin_reset_at).total_seconds() < PIN_RESET_SECONDS):
            return True
        pin = f"{secrets.randbelow(1_000_000):06d}"
        employee.write({"pin": pin, "waiter_pin_attempts": 0, "waiter_pin_locked_until": False, "waiter_pin_reset_at": now})
        sender = self.env["ir.config_parameter"].sudo().get_param("mail.default.from") or "team@projectapp.co"
        body = (
            f"<p>Hola {employee.name},</p>"
            f"<p>Tu PIN nuevo para entrar a <strong>Waiter</strong> es:</p>"
            f"<p style='font-size:28px;font-family:monospace;letter-spacing:0.2em'><strong>{pin}</strong></p>"
            f"<p>Escríbelo en la pantalla de empleados y cámbialo desde tu cuenta cuando quieras.</p>"
            f"<p>— Equipo ProjectApp</p>"
        )
        self.env["mail.mail"].sudo().create({
            "subject": "Tu PIN nuevo de Waiter", "email_from": sender, "email_to": employee.work_email,
            "body_html": body, "auto_delete": True,
        }).send(raise_exception=False)
        return True

    @api.model
    def waiter_end_shift(self, employee_id, token=None, current_pin=None):
        """Cierra la asistencia abierta (check-out). Devuelve `{ok, attendance_id, worked_hours}`;
        `ok: False` si no había asistencia abierta. Exige el `token` del empleado, su PIN actual, o un
        encargado: el turno ajeno no se cierra desde otra tablet. Al cerrar, el token deja de valer."""
        self._waiter_require_pos_user()
        is_manager = self._waiter_is_manager()
        employee = self.sudo().browse(int(employee_id)).exists()
        if not employee:
            return {"ok": False, "attendance_id": False, "worked_hours": 0.0}
        # Al vencer session_ends, el token ya no autoriza operar, pero la cuenta propia aún puede cerrar su asistencia.
        employee._waiter_authorize(token=token, current_pin=current_pin,
                                   is_manager=is_manager or employee.user_id.id == self.env.uid)
        attendance = employee._waiter_open_attendance()
        employee.write({"waiter_session_token": False, "waiter_session_expires": False})
        if not attendance:
            return {"ok": False, "attendance_id": False, "worked_hours": 0.0}
        attendance.write({"check_out": fields.Datetime.now()})
        return {"ok": True, "attendance_id": attendance.id, "worked_hours": attendance.worked_hours}
