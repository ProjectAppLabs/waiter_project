"""Un turno caducado no puede dejar el terminal sin salida: volver a entrar con el correo lo libera.

Corren con el runner de Odoo (`scripts/odoo-test.sh projectapp_ops TestTerminalLogin`), nunca contra el
Odoo compartido.
"""
import json
from datetime import timedelta

from odoo import fields
from odoo.tests import HttpCase, tagged
from odoo.tests.common import new_test_user
from odoo.addons.projectapp_ops.tests.common_waiter import single_restaurant


@tagged("post_install", "-at_install")
class TestTerminalLogin(HttpCase):
    def setUp(self):
        super().setUp()
        single_restaurant(self.env)
        self.password = "Waiter-2026-terminal"
        self.user = new_test_user(self.env, login="terminal_prueba", password=self.password, waiter_role="admin",
                                  groups="base.group_user,point_of_sale.group_pos_manager")
        self.employee = self.env["hr.employee"].create({"name": "Turno Caducado", "pin": "445566",
                                                        "waiter_role": "waiter", "company_id": self.env.company.id})
        self.env.flush_all()

    def _rpc(self, path, params):
        response = self.url_open(path, data=json.dumps({"jsonrpc": "2.0", "method": "call", "params": params}),
                                 headers={"Content-Type": "application/json"})
        return response.json()

    def _terminal_login(self):
        return self._rpc("/web/session/authenticate",
                         {"db": self.env.cr.dbname, "login": self.user.login, "password": self.password})

    def _read_own_role(self):
        """Lo primero que hace el POS tras autenticar (`pos/lib/services/session.ts`)."""
        return self._rpc("/web/dataset/call_kw",
                         {"model": "res.users", "method": "read", "args": [[self.user.id], ["waiter_role"]], "kwargs": {}})

    def _validate_pin(self):
        return self._rpc("/web/dataset/call_kw",
                         {"model": "hr.employee", "method": "waiter_check_pin", "args": [self.employee.id, "445566"], "kwargs": {}})

    def test_expired_shift_does_not_lock_the_terminal(self):
        """Regresión: con el turno caducado el guardia rechazaba hasta la lectura del rol, y la pantalla de
        acceso respondía «correo o contraseña incorrectos» aunque la contraseña fuera correcta."""
        self._terminal_login()
        self.assertTrue(self._validate_pin()["result"]["ok"], "el PIN de la demo debería validar")
        self.employee.write({"waiter_session_expires": fields.Datetime.now() - timedelta(hours=1)})
        self.env.flush_all()

        # Con la identidad caducada en la sesión de Odoo, cualquier llamada muere.
        self.assertIn("error", self._read_own_role())

        # Volver a entrar con el correo del terminal devuelve el dispositivo a un estado usable.
        self.assertNotIn("error", self._terminal_login())
        self.assertEqual(self._read_own_role()["result"][0]["waiter_role"], "admin")
