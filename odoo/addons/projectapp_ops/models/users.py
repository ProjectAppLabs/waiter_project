"""Rol de Waiter en el usuario de Odoo, sincronizado con los grupos de POS.

El rol decide qué pantallas ve la app (`pos/`); los grupos deciden qué acepta la
API de Odoo. Se mantienen juntos para que nunca se contradigan.
"""
import json

from odoo import api, fields, models

ROLES = [("waiter", "Mesero"), ("cashier", "Cajero"), ("admin", "Encargado"), ("owner", "Dueño")]
GROUPS_BY_ROLE = {
    "waiter": ["base.group_user", "point_of_sale.group_pos_user"],
    "cashier": ["base.group_user", "point_of_sale.group_pos_user", "account.group_account_invoice"],
    "admin": ["base.group_user", "point_of_sale.group_pos_manager", "product.group_product_manager", "stock.group_stock_manager",
              "account.group_account_invoice"],
}
GROUPS_BY_ROLE["owner"] = GROUPS_BY_ROLE["admin"] + ["projectapp_ops.group_waiter_owner"]
MANAGED = sorted({g for gs in GROUPS_BY_ROLE.values() for g in gs} - {"base.group_user"})

# Preferencias de notificación del kit (pantalla "Notification Settings"): tipo × canal. Todas encendidas al inicio.
NOTIFY_KEYS = ["kitchen_popup", "kitchen_sound", "inventory_popup", "inventory_sound", "system_popup", "system_sound"]
DEFAULT_NOTIFY = {key: True for key in NOTIFY_KEYS}


class ResUsers(models.Model):
    _inherit = "res.users"

    waiter_role = fields.Selection(ROLES, string="Rol en Waiter", default="waiter")
    waiter_notify = fields.Char(
        string="Preferencias de notificación (JSON)", default=lambda self: json.dumps(DEFAULT_NOTIFY),
        help="Objeto JSON con seis booleanos: kitchen_popup, kitchen_sound, inventory_popup, inventory_sound, "
             "system_popup, system_sound. Lo escribe el POS con set_waiter_notify.")

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ["waiter_role", "waiter_notify", "waiter_config_ids"]

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + ["waiter_notify"]

    @api.model
    def _load_pos_data_fields(self, *args, **kwargs):
        return super()._load_pos_data_fields(*args, **kwargs) + ["waiter_role", "waiter_notify", "waiter_config_ids"]

    def get_waiter_notify(self):
        """Preferencias como dict, completando con el valor por defecto lo que falte o esté mal formado."""
        self.ensure_one()
        try:
            raw = json.loads(self.waiter_notify or "{}")
        except ValueError:
            raw = {}
        if not isinstance(raw, dict):
            raw = {}
        return {key: bool(raw.get(key, True)) for key in NOTIFY_KEYS}

    def set_waiter_notify(self, notify):
        """Guarda las seis preferencias. Acepta un dict o una cadena JSON; las claves desconocidas se ignoran y
        las que faltan conservan su valor actual. Cada usuario solo cambia las suyas (SELF_WRITEABLE_FIELDS)."""
        self.ensure_one()
        if isinstance(notify, str):
            notify = json.loads(notify or "{}")
        if not isinstance(notify, dict):
            raise ValueError("waiter_notify debe ser un objeto JSON")
        current = self.get_waiter_notify()
        current.update({key: bool(notify[key]) for key in NOTIFY_KEYS if key in notify})
        self.write({"waiter_notify": json.dumps(current)})
        return current

    def _group_commands_for(self, role):
        wanted = set(GROUPS_BY_ROLE.get(role, GROUPS_BY_ROLE["waiter"]))
        commands = []
        for xid in MANAGED + ["base.group_user"]:
            group = self.env.ref(xid, raise_if_not_found=False)
            if group:
                commands.append((4 if xid in wanted else 3, group.id))
        return commands

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        for user in users:
            user.sudo().write({"group_ids": user._group_commands_for(user.waiter_role)})
        return users

    def write(self, vals):
        result = super().write(vals)
        if "waiter_role" in vals:
            for user in self:
                super(ResUsers, user.sudo()).write({"group_ids": user._group_commands_for(vals["waiter_role"])})
        return result


# ---------------------------------------------------------------------------
# Invitaciones y códigos (activar cuenta / recuperar contraseña) — sin vistas.
# El administrador crea el usuario; el usuario recibe un código de 6 dígitos por
# correo (team@projectapp.co) y con él fija su contraseña desde el login propio.
# ---------------------------------------------------------------------------
import hashlib
import secrets
from datetime import timedelta

from odoo import _
from odoo.exceptions import AccessError, UserError

INVITE_HOURS = 48
MAX_ATTEMPTS = 5          # intentos fallidos por código antes de invalidarlo (6 dígitos no se fuerzan en 5)
RESEND_SECONDS = 60       # mínimo entre envíos: frena el abuso del endpoint público


class ResUsersInvite(models.Model):
    _inherit = "res.users"

    waiter_invite_code = fields.Char(string="Código de invitación (hash)", copy=False)
    waiter_invite_expires = fields.Datetime(string="Vence el código", copy=False)
    waiter_activated = fields.Boolean(string="Cuenta activada", default=False, copy=False)
    waiter_invite_attempts = fields.Integer(string="Intentos fallidos del código", default=0, copy=False)
    waiter_invite_sent_at = fields.Datetime(string="Último envío del código", copy=False)

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ["waiter_activated"]

    @staticmethod
    def _waiter_hash(login, code):
        return hashlib.sha256(f"{login.lower().strip()}:{code}".encode()).hexdigest()

    def send_waiter_invite(self, dry_run=False):
        """Genera y envía el código. dry_run (solo administrador de POS) devuelve el código sin enviar: para pruebas."""
        self.ensure_one()
        if dry_run and not self.env.user.has_group("point_of_sale.group_pos_manager"):
            raise AccessError(_("Solo un administrador puede pedir un código sin enviarlo."))
        now = fields.Datetime.now()
        if not dry_run and self.waiter_invite_sent_at and (now - self.waiter_invite_sent_at).total_seconds() < RESEND_SECONDS:
            return False  # demasiado seguido: se ignora en silencio (el cliente ve la misma respuesta)
        code = f"{secrets.randbelow(1_000_000):06d}"
        self.sudo().write({"waiter_invite_code": self._waiter_hash(self.login, code), "waiter_invite_attempts": 0,
                           "waiter_invite_expires": now + timedelta(hours=INVITE_HOURS), "waiter_invite_sent_at": now})
        if dry_run:
            return code
        to = self.email or (self.login if "@" in self.login else False)
        if not to:
            raise UserError(_("El usuario %s no tiene correo.", self.name))
        sender = self.env["ir.config_parameter"].sudo().get_param("mail.default.from") or "team@projectapp.co"
        body = (
            f"<p>Hola {self.name},</p>"
            f"<p>Tu código para entrar a <strong>Waiter</strong> es:</p>"
            f"<p style='font-size:28px;font-family:monospace;letter-spacing:0.2em'><strong>{code}</strong></p>"
            f"<p>Escríbelo en la pantalla de entrada junto con tu correo y elige tu contraseña. "
            f"Vence en {INVITE_HOURS} horas.</p><p>— Equipo ProjectApp</p>"
        )
        self.env["mail.mail"].sudo().create({
            "subject": "Tu código de acceso a Waiter", "email_from": sender, "email_to": to, "body_html": body, "auto_delete": True,
        }).send(raise_exception=True)
        return True

    def waiter_check_code(self, code):
        """Un solo uso, vence a las 48 h y se invalida tras MAX_ATTEMPTS fallos: no se puede forzar."""
        self.ensure_one()
        if not self.waiter_invite_code or not self.waiter_invite_expires or fields.Datetime.now() > self.waiter_invite_expires:
            return False
        if secrets.compare_digest(self.waiter_invite_code, self._waiter_hash(self.login, str(code or ""))):
            return True
        attempts = self.waiter_invite_attempts + 1
        values = {"waiter_invite_attempts": attempts}
        if attempts >= MAX_ATTEMPTS:
            values.update({"waiter_invite_code": False, "waiter_invite_expires": False})
        self.sudo().write(values)
        self.env.cr.commit()  # el fallo debe quedar contado aunque la petición termine en error
        return False
