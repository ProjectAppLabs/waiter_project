"""Avisos en vivo del POS por el bus de Odoo.

Sin esto, cada tablet pregunta al servidor cada pocos segundos si cambió algo, y la respuesta casi
siempre es "no". Con esto el servidor avisa cuando de verdad pasa algo y la tablet lee solo entonces:
el retraso baja de segundos a menos de uno y el tráfico de fondo desaparece.

Un canal por terminal (`waiter_pos_<config_id>`): todas las tablets de un mismo POS escuchan lo mismo.
El aviso no lleva datos, solo qué cambió (`kitchen`, `orders`, `notify`); quien lo recibe vuelve a leer
por donde ya leía. Así el bus no se convierte en una segunda copia del modelo ni filtra nada por un
canal que, por diseño de Odoo, el cliente pide por nombre.
"""
from odoo import api, models

EVENTS = ("kitchen", "orders", "notify")
CHANNEL_PREFIX = "waiter_pos_"


def pos_channel(config_id):
    return "%s%s" % (CHANNEL_PREFIX, int(config_id))


def waiter_channels(config_ids, event):
    """A qué canales va este aviso. Vacío si el evento no existe o no hay terminal: decidir a quién se
    avisa es lo nuestro y se puede comprobar sin levantar un websocket."""
    if event not in EVENTS:
        return []
    return [pos_channel(i) for i in sorted({int(c) for c in config_ids if c})]


def keep_allowed(channels, may_listen):
    """Los canales del POS solo para quien puede usar el POS. Odoo deja que el cliente pida cualquier
    canal por su nombre, así que el filtro se pone aquí."""
    return [c for c in channels if may_listen or not (isinstance(c, str) and c.startswith(CHANNEL_PREFIX))]


class WaiterBus(models.AbstractModel):
    _name = "waiter.bus"
    _description = "Avisos en vivo del POS"

    @api.model
    def waiter_send(self, config_ids, event):
        """Avisa a las tablets de esos terminales de que algo de `event` cambió. Silencioso si no hay a quién."""
        channels = waiter_channels(config_ids, event)
        bus = self.env["bus.bus"]
        for channel in channels:
            bus._sendone(channel, "waiter", {"event": event})
        return bool(channels)

    @api.model
    def waiter_bus_info(self):
        """Lo que el POS necesita para conectarse: la versión que el servidor exige en el handshake
        —cambia entre versiones de Odoo, así que se pregunta en vez de fijarla en el cliente— y los
        canales de los terminales a los que este usuario tiene acceso."""
        from odoo.addons.bus.websocket import WebsocketConnectionHandler

        configs = self.env["pos.config"].search([])
        return {"version": WebsocketConnectionHandler._VERSION,
                "channels": [pos_channel(c.id) for c in configs]}


class IrWebsocket(models.AbstractModel):
    _inherit = "ir.websocket"

    def _build_bus_channel_list(self, channels):
        allowed = {pos_channel(c.id) for c in self.env['pos.config'].search([])} if self.env.user.has_group('point_of_sale.group_pos_user') else set()
        channels = [c for c in channels if not (isinstance(c, str) and c.startswith(CHANNEL_PREFIX)) or c in allowed]
        return super()._build_bus_channel_list(channels)
