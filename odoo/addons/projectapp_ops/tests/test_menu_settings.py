"""Plan H en el addon: los campos nuevos viajan en load_data y la pasarela /waiter/admin/menu_settings autoriza y reenvía.

Corren con el runner de Odoo (`-u projectapp_ops --test-enable`), nunca desde un worktree contra el Odoo compartido.
"""
import json
from unittest.mock import patch

from odoo.tests import HttpCase, TransactionCase, tagged
from odoo.tests.common import new_test_user
from odoo.addons.projectapp_ops.tests.common_waiter import single_restaurant

PARAMS = {"projectapp.experience_url": "http://experience.test", "projectapp.experience_internal_key": "k",
          "projectapp.restaurant_slug": "burger-house", "projectapp.venue_slug": "poblado", "projectapp.diner_url": "http://diner.test"}


@tagged("post_install", "-at_install")
class TestLoadData(TransactionCase):
    def test_load_data_carries_the_signup_discount_and_the_diner_attributes(self):
        """Atrapa un campo fuera de _load_pos_data_fields: la experiencia del comensal no lo vería nunca."""
        config = self.env["pos.config"].search([], limit=1)
        self.assertTrue(config, "hace falta un pos.config (demo)")
        session = config.current_session_id or self.env["pos.session"].create({"config_id": config.id, "user_id": self.env.uid})
        raw = session.load_data([])
        self.assertIn("signup_discount_percent", raw["pos.config"][0])
        self.assertEqual(raw["pos.config"][0]["signup_discount_percent"], 5.0)
        self.assertTrue(raw["product.template"], "hace falta un producto disponible en el POS (demo)")
        self.assertIn("diner_attributes", raw["product.template"][0])
        self.assertIn("image_origin", raw["product.template"][0])


@tagged("post_install", "-at_install")
class TestMenuSettingsGateway(HttpCase):
    def setUp(self):
        super().setUp()
        single_restaurant(self.env)
        icp = self.env["ir.config_parameter"].sudo()
        for key, value in PARAMS.items():
            icp.set_param(key, value)
        new_test_user(self.env, login="mesero_plantillas", password="Waiter-2026-mesero", groups="base.group_user,point_of_sale.group_pos_user")
        manager = new_test_user(self.env, login="admin_plantillas", password="Waiter-2026-admin", waiter_role="admin", groups="base.group_user,point_of_sale.group_pos_manager")
        self.env.flush_all()
        self.assertTrue(manager.has_group("point_of_sale.group_pos_manager"))

    def _rpc(self, params):
        response = self.url_open("/waiter/admin/menu_settings", data=json.dumps({"jsonrpc": "2.0", "method": "call", "params": params}),
                                 headers={"Content-Type": "application/json"})
        return response.json()

    # // Falla si verify publica, pierde el estado en_curso o el resultado, o conserva la espera especial de A.
    def test_verify_posts_to_internal_endpoint(self):
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        token = "57875cdf-2f57-48b6-b506-2a1b11f5fa2b"
        pending = {"borrador": token, "estado": "en_curso", "ok": None, "inicio": "2026-09-26T15:00:00Z", "siguiente": "Vuelve a consultar."}
        result = {"borrador": token, "estado": "ok", "ok": True, "problemas": [], "siguiente": "Guardar con aprobación."}
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            req.return_value.status_code = 200
            req.return_value.json.return_value = pending
            self.assertEqual(self._rpc({"action": "verify", "borrador": token})["result"], pending)
            req.return_value.json.return_value = result
            self.assertEqual(self._rpc({"action": "verify", "borrador": token})["result"], result)
            self.assertEqual(req.call_args.args, ("POST", "http://experience.test/internal/v1/burger-house/poblado/menu/borradores/%s/verificar/" % token))
            self.assertEqual(req.call_args.kwargs["headers"], {"X-Internal-Key": "k"})
            self.assertEqual(req.call_args.kwargs["timeout"], 10)

    # // Falla si verify admite meseros, sede elegida desde el navegador o tokens que alteran la ruta interna.
    def test_verify_authorization_scope_and_invalid_tokens(self):
        self.authenticate("mesero_plantillas", "Waiter-2026-mesero")
        self.assertEqual(self._rpc({"action": "verify", "borrador": "token"})["error"]["data"]["name"], "odoo.exceptions.AccessError")
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            for params in ({"sede": "ajena"}, {"borrador": "../otra"}, {"borrador": None}, {"borrador": {}}, {}):
                result = self._rpc({"action": "verify", **params})
                self.assertEqual(result["error"]["data"]["name"], "odoo.exceptions.UserError")
            req.assert_not_called()

    # // Falla si set pierde el borrador público o el rechazo de la verificación no llega como mensaje legible al POS.
    def test_set_forwards_draft_and_verification_errors(self):
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        token = "57875cdf-2f57-48b6-b506-2a1b11f5fa2b"
        theme = {"componentes": {"plato": {"version": 1, "html": "<div/>"}}}
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            req.return_value.status_code = 200
            req.return_value.json.return_value = {"plantilla": {"codigo": "S1"}}
            self._rpc({"action": "set", "plantilla": "S1", "tema": theme, "borrador": token})
            self.assertEqual(req.call_args.args, ("PUT", "http://experience.test/internal/v1/burger-house/poblado/menu/"))
            self.assertEqual(req.call_args.kwargs["json"], {"plantilla": "S1", "tema": theme, "borrador": token})
            self._rpc({"action": "set", "plantilla": "S1", "paleta": {}, "borrador": token})
            self.assertEqual(req.call_args.kwargs["json"], {"plantilla": "S1", "paleta": {}, "tipografia": {}, "borrador": token})
            req.return_value.status_code = 400
            req.return_value.json.return_value = {"detail": "Falta una verificación en verde de este borrador."}
            result = self._rpc({"action": "set", "plantilla": "S1", "tema": theme, "borrador": token})
            self.assertEqual(result["error"]["data"]["name"], "odoo.exceptions.UserError")
            self.assertIn("Falta una verificación en verde", result["error"]["data"]["message"])

    def test_a_waiter_is_refused(self):
        """Atrapa que un mesero o cajero cambie la plantilla del menú: solo point_of_sale.group_pos_manager."""
        self.authenticate("mesero_plantillas", "Waiter-2026-mesero")
        body = self._rpc({"action": "get"})
        self.assertIn("error", body)
        self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.AccessError")

    # // Falla si el mesero puede preparar borradores o el navegador puede elegir una sede distinta.
    def test_preview_authorization_and_scope(self):
        self.authenticate("mesero_plantillas", "Waiter-2026-mesero")
        body = self._rpc({"action": "preview", "plantilla": "S1"})
        self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.AccessError")
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            body = self._rpc({"action": "preview", "plantilla": "S1", "sede": "ajena"})
            self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.UserError")
            req.assert_not_called()

    # // Falla si previsualizar publica por PUT, pierde el tema v2 o devuelve secretos al POS.
    def test_preview_posts_to_draft_endpoint_with_internal_key(self):
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        theme = {"variantes": {"boton": "contorno"}}
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            req.return_value.status_code = 201
            req.return_value.json.return_value = {"borrador": "lectura", "caduca": "2026-09-25T01:00:00Z"}
            result = self._rpc({"action": "preview", "plantilla": "S1", "tema": theme})["result"]
            self.assertEqual(result["borrador"], "lectura")
            self.assertNotIn("internal_key", result)
            args, kwargs = req.call_args
            self.assertEqual(args, ("POST", "http://experience.test/internal/v1/burger-house/poblado/menu/borradores/"))
            self.assertEqual(kwargs["headers"], {"X-Internal-Key": "k"})
            self.assertEqual(kwargs["json"], {"plantilla": "S1", "tema": theme})
            self._rpc({"action": "preview", "plantilla": "S1", "paleta": {"acento": "#234567"}})
            self.assertEqual(req.call_args.kwargs["json"], {"plantilla": "S1", "paleta": {"acento": "#234567"}, "tipografia": {}})

    def test_get_forwards_with_the_internal_key_and_returns_the_venue(self):
        """Atrapa una pasarela que no mande la clave interna, que apunte a otra ruta, o que no devuelva las URLs que el POS necesita."""
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            req.return_value.status_code = 200
            req.return_value.json.return_value = {"plantilla": "B1", "paleta": {}, "tipografia": {}, "porDefecto": True}
            body = self._rpc({"action": "get"})
        self.assertEqual(body["result"]["ajustes"]["plantilla"], "B1")
        self.assertEqual((body["result"]["restaurante"], body["result"]["sede"], body["result"]["dinerUrl"]), ("burger-house", "poblado", "http://diner.test"))
        args, kwargs = req.call_args
        self.assertEqual(args, ("GET", "http://experience.test/internal/v1/burger-house/poblado/menu/"))
        self.assertEqual(kwargs["headers"], {"X-Internal-Key": "k"})
        self.assertEqual(kwargs["timeout"], 10)

    def test_set_puts_the_settings_and_a_400_becomes_a_user_error_in_spanish(self):
        """Atrapa un PUT sin el cuerpo del contrato, o un rechazo de experience que llegue al POS como error genérico."""
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            req.return_value.status_code = 200
            req.return_value.json.return_value = {"plantilla": {"codigo": "A3"}}
            body = self._rpc({"action": "set", "plantilla": "A3", "paleta": {"acento": "#2F7A4F"}, "tipografia": {"display": "Lora"}})
            self.assertEqual(body["result"]["plantilla"]["codigo"], "A3")
            args, kwargs = req.call_args
            self.assertEqual(args[0], "PUT")
            self.assertEqual(kwargs["json"], {"plantilla": "A3", "paleta": {"acento": "#2F7A4F"}, "tipografia": {"display": "Lora"}})
            req.return_value.status_code = 400
            req.return_value.json.return_value = {"detail": "La plantilla 'Z9' no está en el catálogo."}
            body = self._rpc({"action": "set", "plantilla": "Z9"})
        self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.UserError")
        self.assertIn("no está en el catálogo", body["error"]["data"]["message"])

    def test_missing_parameters_and_network_errors_are_user_errors(self):
        """Atrapa un 500 opaco cuando faltan los parámetros del sistema o experience no responde."""
        import requests

        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request", side_effect=requests.ConnectionError("down")):
            body = self._rpc({"action": "get"})
        self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.UserError")
        self.assertIn("No se pudo contactar", body["error"]["data"]["message"])
        self.env["ir.config_parameter"].sudo().set_param("projectapp.experience_internal_key", "")
        body = self._rpc({"action": "get"})
        self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.UserError")
        self.assertIn("projectapp.experience_internal_key", body["error"]["data"]["message"])

    def test_preview_url_is_required_and_malformed_urls_are_user_errors(self):
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        icp = self.env["ir.config_parameter"].sudo()
        for key, value in [("projectapp.diner_url", ""), ("projectapp.diner_url", "localhost:3001"), ("projectapp.diner_url", "http://[broken")]:
            icp.set_param(key, value)
            body = self._rpc({"action": "get"})
            self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.UserError")
            self.assertIn(key, body["error"]["data"]["message"])

    def test_request_exception_is_a_user_error(self):
        import requests
        self.authenticate("admin_plantillas", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request", side_effect=requests.exceptions.InvalidURL("bad URL")):
            body = self._rpc({"action": "get"})
        self.assertEqual(body["error"]["data"]["name"], "odoo.exceptions.UserError")
        self.assertIn("No se pudo contactar", body["error"]["data"]["message"])


@tagged("post_install", "-at_install")
class TestMenuDecorationsGateway(HttpCase):
    """Plan K4: la galería de decoraciones pasa por la misma pasarela autorizada; la sede sale de Odoo."""

    def setUp(self):
        super().setUp()
        single_restaurant(self.env)
        icp = self.env["ir.config_parameter"].sudo()
        for key, value in PARAMS.items():
            icp.set_param(key, value)
        new_test_user(self.env, login="mesero_decor", password="Waiter-2026-mesero", groups="base.group_user,point_of_sale.group_pos_user")
        new_test_user(self.env, login="admin_decor", password="Waiter-2026-admin", waiter_role="admin", groups="base.group_user,point_of_sale.group_pos_manager")
        self.env.flush_all()

    def _rpc(self, params):
        response = self.url_open("/waiter/admin/menu_decorations", data=json.dumps({"jsonrpc": "2.0", "method": "call", "params": params}),
                                 headers={"Content-Type": "application/json"})
        return response.json()

    # // Falla si un mesero puede subir decoraciones, si el navegador puede elegir la sede o si falta la clave interna.
    def test_authorization_scope_and_forwarding(self):
        self.authenticate("mesero_decor", "Waiter-2026-mesero")
        self.assertEqual(self._rpc({"action": "list"})["error"]["data"]["name"], "odoo.exceptions.AccessError")
        self.authenticate("admin_decor", "Waiter-2026-admin")
        with patch("odoo.addons.projectapp_ops.controllers.admin.requests.request") as req:
            self.assertEqual(self._rpc({"action": "list", "sede": "ajena"})["error"]["data"]["name"], "odoo.exceptions.UserError")
            self.assertEqual(self._rpc({"action": "remove", "decoracion_id": "../otra"})["error"]["data"]["name"], "odoo.exceptions.UserError")
            req.assert_not_called()
            req.return_value.status_code = 200
            req.return_value.json.return_value = {"decoraciones": [], "fabrica": [], "limites": {"peso": 300000}}
            result = self._rpc({"action": "list"})["result"]
            self.assertEqual(result["experienceUrl"], "http://experience.test")
            self.assertEqual(req.call_args.args, ("GET", "http://experience.test/internal/v1/burger-house/poblado/decoraciones/"))
            self.assertEqual(req.call_args.kwargs["headers"], {"X-Internal-Key": "k"})
            req.return_value.status_code = 201
            req.return_value.json.return_value = {"id": "hoja", "archivo": "/api/v1/burger-house/poblado/decoraciones/hoja/?v=1"}
            added = self._rpc({"action": "add", "nombre": "Hoja", "imagen": "data:image/png;base64,AAAA"})["result"]
            self.assertEqual(added["id"], "hoja")
            self.assertTrue(req.call_args.kwargs["json"]["creadaPor"].startswith("admin_decor"))
            self.assertEqual(req.call_args.kwargs["json"]["imagen"], "data:image/png;base64,AAAA")
            req.return_value.status_code = 200
            req.return_value.json.return_value = {"eliminada": "hoja"}
            self.assertEqual(self._rpc({"action": "remove", "decoracion_id": "hoja"})["result"], {"eliminada": "hoja"})
            self.assertEqual(req.call_args.args, ("DELETE", "http://experience.test/internal/v1/burger-house/poblado/decoraciones/hoja/"))
