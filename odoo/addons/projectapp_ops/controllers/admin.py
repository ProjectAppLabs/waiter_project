"""Pasarela del POS hacia la experiencia del comensal (Plan H): elegir y personalizar la plantilla del menú.

`POST /waiter/admin/menu_settings` (JSON-RPC, sesión de Odoo, solo gerentes del POS) reenvía a
`/internal/v1/<rest>/<sede>/menu/` de `experience/` con la clave interna. Así el navegador del POS nunca conoce la
clave ni la URL interna: la autorización es la del usuario de Odoo (`point_of_sale.group_pos_manager`).

Parámetros del sistema (`ir.config_parameter`, los siembra el onboarding; en dev, `odoo/provisioning/seed-menu-params.sh`):
  projectapp.experience_url           URL base de experience (p. ej. http://192.168.56.10:8001)
  projectapp.experience_internal_key  EXPERIENCE_INTERNAL_KEY de experience
  projectapp.restaurant_slug          slug del restaurante en el registro (p. ej. burger-house)
  projectapp.venue_slug               slug de la sede (p. ej. poblado)
  projectapp.diner_url                URL pública de la app del comensal (vista previa por iframe en el POS)

Acciones:
  get  → {restaurante, sede, experienceUrl, dinerUrl, ajustes: GET interno (plantilla, paleta, tipografia, …)}
  set  {plantilla, paleta, tipografia} → PUT interno; devuelve {plantilla: la resuelta que verá el comensal}
"""
from urllib.parse import urlsplit

import requests
from odoo import _, http
from odoo.exceptions import AccessError, UserError
from odoo.http import request

TIMEOUT = 10
PARAMS = {
    "experience_url": "projectapp.experience_url",
    "internal_key": "projectapp.experience_internal_key",
    "restaurant": "projectapp.restaurant_slug",
    "venue": "projectapp.venue_slug",
    "diner_url": "projectapp.diner_url",
}
REQUIRED = ("experience_url", "internal_key", "restaurant", "venue", "diner_url")


def _params():
    icp = request.env["ir.config_parameter"].sudo()
    values = {name: (icp.get_param(key) or "").strip() for name, key in PARAMS.items()}
    missing = [PARAMS[name] for name in REQUIRED if not values[name]]
    if missing:
        raise UserError(_("Falta configurar en Odoo: %s. Siémbralos con env.set_param (ver README del addon).") % ", ".join(missing))
    for name in ("experience_url", "diner_url"):
        try:
            url = urlsplit(values[name])
            valid = url.scheme in ("http", "https") and bool(url.hostname) and not url.username and not url.password
            port = url.port
            valid = valid and (port is None or port > 0)
        except ValueError:
            valid = False
        if not valid:
            raise UserError("URL inválida en %s: usa http:// o https:// con un servidor válido." % PARAMS[name])
    return values


def _call(method, url, key, json=None):
    try:
        response = requests.request(method, url, headers={"X-Internal-Key": key}, json=json, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise UserError(_("No se pudo contactar la experiencia del comensal (%s). Revisa projectapp.experience_url y que el servicio esté arriba.") % exc.__class__.__name__) from exc
    if response.status_code == 401:
        raise UserError(_("La experiencia del comensal rechazó la clave interna: projectapp.experience_internal_key no coincide con EXPERIENCE_INTERNAL_KEY."))
    if response.status_code in (400, 404):
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = None
        raise UserError(detail or _("La experiencia del comensal rechazó los ajustes."))
    if response.status_code >= 300:
        raise UserError(_("La experiencia del comensal respondió %s.") % response.status_code)
    try:
        return response.json()
    except ValueError as exc:
        raise UserError(_("La experiencia del comensal respondió algo que no es JSON.")) from exc


class WaiterAdmin(http.Controller):
    @http.route("/waiter/admin/menu_settings", type="jsonrpc", auth="user", methods=["POST"])
    def menu_settings(self, action="get", plantilla=None, paleta=None, tipografia=None, **kw):
        # Solo quien administra el POS elige la plantilla: el mesero y el cajero no llegan aquí.
        if not request.env.user.has_group("point_of_sale.group_pos_manager"):
            raise AccessError(_("Solo un administrador del punto de venta puede cambiar la plantilla del menú."))
        p = _params()
        url = "%s/internal/v1/%s/%s/menu/" % (p["experience_url"].rstrip("/"), p["restaurant"], p["venue"])
        if action == "get":
            return {"restaurante": p["restaurant"], "sede": p["venue"], "experienceUrl": p["experience_url"],
                    "dinerUrl": p["diner_url"], "ajustes": _call("GET", url, p["internal_key"])}
        if action == "set":
            body = {"plantilla": plantilla, "paleta": paleta or {}, "tipografia": tipografia or {}}
            return _call("PUT", url, p["internal_key"], json=body)
        raise UserError(_("Acción desconocida: %s (usa get o set).") % action)

    @http.route("/waiter/admin/mcp_keys", type="jsonrpc", auth="user", methods=["POST"])
    def mcp_keys(self, action="list", nombre=None, key_id=None, **kw):
        """Claves MCP de esta sede (ver experience/experience_app/mcp). La sede sale de los parámetros de este Odoo, nunca
        del navegador: un administrador solo crea o revoca claves de su propio restaurante.

          list                → {claves: [...], mcpUrl}
          create {nombre}     → {clave (en claro, una sola vez), id, nombre, prefijo, …, mcpUrl}
          revoke {key_id}     → {revocada: id}
        """
        if not request.env.user.has_group("point_of_sale.group_pos_manager"):
            raise AccessError(_("Solo un administrador del punto de venta puede administrar las claves de IA."))
        if kw:
            raise UserError(_("Parámetros desconocidos: %s") % ", ".join(sorted(kw)))
        p = _params()
        base = "%s/internal/v1/%s/%s/mcp/claves/" % (p["experience_url"].rstrip("/"), p["restaurant"], p["venue"])
        mcp_url = "%s/mcp/" % p["experience_url"].rstrip("/")
        if action == "list":
            return {**_call("GET", base, p["internal_key"]), "mcpUrl": mcp_url}
        if action == "create":
            return {**_call("POST", base, p["internal_key"], json={"nombre": nombre or "", "creadaPor": request.env.user.name}), "mcpUrl": mcp_url}
        if action == "revoke":
            if type(key_id) is not int:
                raise UserError(_("Indica qué clave revocar."))
            return _call("POST", "%s%d/revocar/" % (base, key_id), p["internal_key"])
        raise UserError(_("Acción desconocida: %s (usa list, create o revoke).") % action)

    @http.route("/waiter/admin/payment_gateways", type="jsonrpc", auth="user", methods=["POST"])
    def payment_gateways(self, action="get", configuration=None, environment="test", **kw):
        if not request.env.user.has_group("point_of_sale.group_pos_manager"):
            raise AccessError("Solo un administrador del POS puede configurar las pasarelas de pago.")
        if kw or action not in ("get", "set", "test"):
            raise UserError("Acción de pasarela inválida.")
        p = _params()
        url = "%s/internal/v1/%s/%s/pasarelas/" % (p["experience_url"].rstrip("/"), p["restaurant"], p["venue"])
        # Tenant comes from this Odoo database, never from a browser-supplied slug.
        if action == "get":
            return _call("GET", url, p["internal_key"])
        if action == "test":
            return _call("POST", url, p["internal_key"], json={"environment": environment})
        return _call("PUT", url, p["internal_key"], json=configuration)
