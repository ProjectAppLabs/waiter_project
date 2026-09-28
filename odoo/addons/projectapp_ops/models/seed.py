"""Siembra idempotente de lo que el kit CloudPos da por hecho y Community no trae configurado.

Se ejecuta en el `post_init_hook` de `projectapp_ops` (instalación) y a mano con
`odoo/provisioning/seed-kit.sh` (un Odoo ya instalado: `-u` no vuelve a correr el hook). Cada paso busca
antes de crear, así que repetirla no duplica nada.

- Presets Dine In (`service_at` table), Takeout (counter, identificación por nombre) y Delivery (delivery,
  identificación por dirección), activos en el `pos.config` demo.
- Programa de fidelización «Puntos Waiter»: 1 punto por cada 1.000 COP; 100 puntos = 1.000 COP de descuento.
- Empleados demo «Sofía Mesera» (PIN 123456, mesera), «Carlos Cajero» (PIN 654321, cajero) y «Laura Encargada»
  (PIN 112233, administradora) ligados al
  `pos.config` demo (`module_pos_hr` encendido para que viajen en `load_data`).
"""
from odoo import api, fields, models

# Los tres presets los trae Odoo (pos_restaurant). Se reutilizan por su identificador interno, que no depende del idioma:
# buscarlos por nombre fallaba en una base en español (allí se llaman «Comer en el local», «Para llevar», «Entrega») y la
# siembra creaba duplicados. El nombre en inglés queda solo para crearlos si faltara pos_restaurant.
PRESETS = [
    # (nombre en inglés, service_at, identification, identificador interno de Odoo)
    ("Dine In", "table", "none", "pos_restaurant.pos_takein_preset"),
    ("Takeout", "counter", "name", "pos_restaurant.pos_takeout_preset"),
    ("Delivery", "delivery", "address", "pos_restaurant.pos_delivery_preset"),
]
LOYALTY_NAME = "Puntos Waiter"
COP_PER_POINT = 1000.0          # 1 punto por cada 1.000 COP
REDEEM_POINTS = 100.0           # 100 puntos…
REDEEM_COP = 1000.0             # …valen 1.000 COP
DEMO_EMPLOYEES = [
    # (nombre, PIN, rol, correo, vinculación)
    ("Sofía Mesera", "123456", "waiter", "sofia.mesera@example.com", "full_time"),
    ("Carlos Cajero", "654321", "cashier", "carlos.cajero@example.com", "full_time"),
    # Sin un empleado administrador nadie puede abrir Cocina ni Administración desde la tablet: el rol de la
    # pantalla es el del PIN marcado, no el de la credencial con la que se abrió el terminal.
    ("Laura Encargada", "112233", "admin", "laura.encargada@example.com", "full_time"),
]


class WaiterSeed(models.AbstractModel):
    _name = "waiter.seed"
    _description = "Siembra del kit CloudPos (presets, fidelización, empleados demo)"

    @api.model
    def _prepare_first_restaurant(self):
        """Las instalaciones nuevas reciben la misma identidad y asignaciones que la migración."""
        config = self._demo_config()
        if not config.waiter_slug:
            company = config.company_id
            config.write({'waiter_slug': self.env['ir.config_parameter'].sudo().get_param('projectapp.venue_slug') or 'poblado',
                          'waiter_street': company.street, 'waiter_city': company.city, 'waiter_phone': company.phone,
                          'waiter_latitude': company.waiter_latitude, 'waiter_longitude': company.waiter_longitude})
        users = self.env['res.users'].with_context(active_test=False).search([
            ('company_id', '=', config.company_id.id), ('waiter_config_ids', '=', False),
        ])
        users.write({'waiter_config_ids': [(6, 0, config.ids)]})
        employees = self.env['hr.employee'].with_context(active_test=False).search([
            ('company_id', '=', config.company_id.id), ('waiter_config_ids', '=', False), ('waiter_role', '!=', 'owner'),
        ])
        employees.write({'waiter_config_ids': [(6, 0, config.ids)]})
        self.env['res.users'].search([('login', '=', 'admin')]).write({'waiter_role': 'owner'})
        config._waiter_sync_employee_lists()

    @api.model
    def _demo_config(self):
        return self.env['pos.config']._waiter_selected_config()

    @api.model
    def seed_presets(self, config_id=None):
        self = self.with_context(waiter_config_id=config_id or self.env.context.get("waiter_config_id"))
        preset_model = self.env["pos.preset"].with_context(lang="en_US")
        presets = self.env["pos.preset"].browse()
        for name, service_at, identification, xml_id in PRESETS:
            preset = self.env.ref(xml_id, raise_if_not_found=False) or preset_model.search([("name", "=", name)], limit=1)
            if not preset:
                preset = preset_model.create({"name": name, "service_at": service_at, "identification": identification})
            elif preset.service_at != service_at or preset.identification != identification:
                preset.write({"service_at": service_at, "identification": identification})
            self._merge_duplicate_presets(preset, name)
            presets |= preset
        config = self._demo_config()
        if config:
            values = {"use_presets": True, "available_preset_ids": [(4, p.id) for p in presets]}
            if not config.default_preset_id:
                values["default_preset_id"] = presets[0].id
            config.write(values)
        return presets

    @api.model
    def _merge_duplicate_presets(self, canonical, name):
        """Funde en `canonical` los presets que una siembra anterior creó con el mismo nombre en inglés (los que no tienen
        identificador interno): repunta pedidos y terminales y los borra. Nunca toca un preset que traiga otro módulo.

        Los pedidos conservan su prefijo y su número: el prefijo sale del tipo de servicio, que es el mismo, y el número se
        asigna una sola vez al crear el pedido (ya está impreso en comandas)."""
        duplicates = self.env["pos.preset"].with_context(lang="en_US").search([("name", "=", name), ("id", "!=", canonical.id)])
        external = duplicates.get_external_id()
        duplicates = duplicates.filtered(lambda preset: not external.get(preset.id))
        if not duplicates:
            return
        self.env["pos.order"].sudo().search([("preset_id", "in", duplicates.ids)]).write({"preset_id": canonical.id})
        configs = self.env["pos.config"].sudo().search(["|", ("available_preset_ids", "in", duplicates.ids), ("default_preset_id", "in", duplicates.ids)])
        for config in configs:
            values = {"available_preset_ids": [(3, dup.id) for dup in duplicates] + [(4, canonical.id)]}
            if config.default_preset_id in duplicates:
                values["default_preset_id"] = canonical.id
            config.write(values)
        duplicates.sudo().unlink()

    @api.model
    def _loyalty_configured(self, program):
        rule, reward = program.rule_ids, program.reward_ids
        return (len(rule) == 1 and rule.reward_point_mode == "money" and abs(rule.reward_point_amount - 1.0 / COP_PER_POINT) < 1e-9
                and len(reward) == 1 and reward.discount_mode == "per_point" and reward.required_points == REDEEM_POINTS
                and reward.discount == REDEEM_COP / REDEEM_POINTS)

    @api.model
    def seed_loyalty(self):
        program_model = self.env["loyalty.program"]
        program = program_model.search([("name", "=", LOYALTY_NAME), ("company_id", "in", [False, self.env.company.id])], limit=1)
        if program and self._loyalty_configured(program):
            return program
        # Dos pasos: `_compute_from_program_type` reescribe reglas y recompensas al fijar el tipo, así que primero
        # el tipo y después las nuestras (reemplazando las que Odoo puso por defecto).
        if not program:
            program = program_model.create({"name": LOYALTY_NAME, "company_id": self.env.company.id, "program_type": "loyalty", "pos_ok": True})
        program.write({
            "applies_on": "both", "trigger": "auto", "portal_visible": True, "portal_point_name": "Puntos",
            "rule_ids": [(5, 0, 0), (0, 0, {"reward_point_mode": "money", "reward_point_amount": 1.0 / COP_PER_POINT,
                                            "minimum_amount": COP_PER_POINT, "minimum_amount_tax_mode": "incl"})],
            "reward_ids": [(5, 0, 0), (0, 0, {"reward_type": "discount", "discount_mode": "per_point",
                                              "discount": REDEEM_COP / REDEEM_POINTS, "required_points": REDEEM_POINTS,
                                              "discount_applicability": "order",
                                              "description": "1.000 COP de descuento por cada 100 puntos"})],
        })
        return program

    @api.model
    def seed_employees(self, config_id=None):
        self = self.with_context(waiter_config_id=config_id or self.env.context.get("waiter_config_id"))
        config = self._demo_config()
        employee_model = self.env["hr.employee"]
        employees = employee_model.browse()
        for name, pin, role, email, status in DEMO_EMPLOYEES:
            employee = employee_model.search([("name", "=", name), ("waiter_config_ids", "in", config.ids)], limit=1)
            if not employee:
                employee = employee_model.create({
                    "name": name, "pin": pin, "waiter_role": role, "waiter_config_ids": [(6, 0, config.ids)], "work_email": email, "employment_status": status,
                    "joining_date": fields.Date.today(), "shift_start": 8.0, "shift_end": 16.0,
                })
            employees |= employee
        config.write({'module_pos_hr': True})
        config._waiter_sync_employee_lists()
        return employees

    @api.model
    def seed_kit(self, config_id=None):
        """Todo lo anterior, en orden. Devuelve un resumen para el log de provisioning."""
        presets = self.seed_presets(config_id)
        program = self.seed_loyalty()
        employees = self.seed_employees(config_id)
        return {"presets": presets.mapped("name"), "loyalty": program.name, "employees": employees.mapped("name")}
