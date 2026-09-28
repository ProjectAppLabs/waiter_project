"""Reservas de mesa del kit CloudPos: franja de 30 minutos, mesa, personas, silla de bebé, pre-pedido y correo.

Sin vistas: el POS (`pos/lib/services/reservations.ts`) llama estos métodos por `call_kw`.
"""
import math
import secrets
from datetime import datetime, timedelta

import pytz

from odoo import Command, api, fields, models, _
from odoo.exceptions import UserError, ValidationError

ACTIVE_STATES = ("confirmed", "seated")
DEFAULT_DURATION_HOURS = 1.5
SLOT_HOURS = 0.5
# Minutos que la mesa se aparta ANTES de la hora reservada. No es que el comensal ya esté ahí: es el
# tiempo de preparar la mesa. Fuera de esa ventana la mesa se usa con normalidad, que es lo que evita que
# una reserva de las 20:00 deje la mesa muerta desde el almuerzo.
PREP_CHOICES = [("0", "Sin margen"), ("15", "15 minutos antes"), ("30", "30 minutos antes"),
                ("60", "1 hora antes"), ("120", "2 horas antes")]


def table_ids_from(value, current=()):
    """Ids de mesa a partir de una lista simple (lo que manda el POS: reemplaza) o de comandos ORM, que se aplican en
    orden sobre las mesas actuales (`current`), como hace el ORM: LINK suma una, UNLINK quita una, SET reemplaza."""
    if all(isinstance(item, int) for item in value):
        return list(value)
    ids = list(current)
    for command in value:
        if command[0] == Command.SET:
            ids = list(command[2])
        elif command[0] == Command.LINK:
            ids += [command[1]] if command[1] not in ids else []
        elif command[0] == Command.UNLINK:
            ids = [i for i in ids if i != command[1]]
        else:
            raise ValidationError(_("Las mesas de la reserva se mandan como lista de ids."))
    return ids


def notice_label(minutes):
    """90 → '1 h 30 min'; 1440 → '1 día'."""
    days, rest = divmod(minutes, 1440)
    hours, mins = divmod(rest, 60)
    parts = [("%s día" if days == 1 else "%s días") % days if days else "", "%s h" % hours if hours else "", "%s min" % mins if mins else ""]
    return " ".join(p for p in parts if p)


def hour_label(value):
    """10.5 → '10:30'."""
    total = int(round((value or 0.0) * 60))
    return "%02d:%02d" % divmod(total, 60)


class WaiterReservation(models.Model):
    _name = "waiter.reservation"
    _description = "Reserva de mesa"
    _order = "date desc, time_start, id"

    name = fields.Char(string="Código", required=True, readonly=True, copy=False, default="/")
    customer_name = fields.Char(string="Cliente", required=True)
    customer_email = fields.Char(string="Correo")
    customer_phone = fields.Char(string="Teléfono")
    date = fields.Date(string="Fecha", required=True, default=fields.Date.context_today, index=True)
    time_start = fields.Float(string="Hora de inicio", required=True, help="Horas; franjas de 30 minutos (17.5 = 17:30).")
    time_end = fields.Float(string="Hora de fin", required=True, help="Por defecto, inicio + 1,5 h.")
    prep_minutes = fields.Selection(
        PREP_CHOICES, string="Apartar desde", default="30", required=True,
        help="Cuánto antes de la hora reservada deja de ofrecerse la mesa, para prepararla. No implica que "
             "el comensal esté ya en el local.")
    hold_start = fields.Float(
        string="Apartada desde", compute="_compute_hold_start", store=True,
        help="Hora a partir de la cual la mesa deja de estar libre: inicio menos el margen de preparación.")

    people = fields.Integer(string="Personas", required=True, default=2)
    baby_chair = fields.Boolean(string="Silla de bebé", default=False)
    # `table_id` es la mesa principal: ahí va el pre-pedido y es la que nombra la reserva. `table_ids` son TODAS las
    # mesas que aparta (la principal incluida): un grupo grande junta varias. Choques, línea de tiempo y el «Reservada»
    # del plano miran `table_ids`.
    table_id = fields.Many2one("restaurant.table", string="Mesa principal", required=True, ondelete="restrict", index=True)
    table_ids = fields.Many2many("restaurant.table", "waiter_reservation_table_rel", "reservation_id", "table_id", string="Mesas")
    config_id = fields.Many2one('pos.config', required=True, index=True, ondelete='restrict')
    floor_id = fields.Many2one(related="table_id.floor_id", string="Piso", store=True)
    state = fields.Selection([
        ("confirmed", "Confirmada"),
        ("seated", "Sentada"),
        ("no_show", "No se presentó"),
        ("cancelled", "Cancelada"),
    ], string="Estado", default="confirmed", required=True, index=True)
    notes = fields.Text(string="Notas")
    preorder_id = fields.Many2one("pos.order", string="Pre-pedido", ondelete="set null", copy=False)
    currency_id = fields.Many2one(related="preorder_id.currency_id")
    amount_total = fields.Monetary(related="preorder_id.amount_total", string="Total del pre-pedido", currency_field="currency_id")

    # Anticipo: lo que el restaurante cobra por apartar la mesa. 0 = reserva sin costo. Se paga por el enlace público
    # del menú (`pay_token` es el secreto de ese enlace) o se marca a mano si el cliente pagó por otro medio.
    deposit_amount = fields.Float(string="Costo de la reserva", default=0.0, help="Anticipo en pesos. 0 = sin costo.")
    deposit_state = fields.Selection([("none", "Sin costo"), ("pending", "Pendiente"), ("paid", "Pagado")],
                                     string="Estado del anticipo", default="none", required=True, copy=False)
    deposit_reference = fields.Char(string="Referencia del pago", copy=False, readonly=True)
    deposit_paid_at = fields.Datetime(string="Anticipo pagado el", copy=False, readonly=True)
    pay_token = fields.Char(string="Token del enlace de pago", copy=False, readonly=True, index=True, groups="point_of_sale.group_pos_user")

    _pay_token_unique = models.Constraint("unique(pay_token)", "El enlace de pago de una reserva debe ser único.")

    @api.constrains("deposit_amount")
    def _check_deposit(self):
        for reservation in self:
            if reservation.deposit_amount < 0 or reservation.deposit_amount > 50_000_000:
                raise ValidationError(_("El costo de la reserva debe estar entre 0 y 50.000.000."))

    @api.depends("time_start", "prep_minutes")
    def _compute_hold_start(self):
        for reservation in self:
            margin = int(reservation.prep_minutes or "0") / 60.0
            reservation.hold_start = max(0.0, (reservation.time_start or 0.0) - margin)

    def init(self):
        # Las reservas anteriores a `table_ids` apartaban solo su mesa principal. Idempotente: corre en cada actualización.
        self.env.cr.execute("""
            INSERT INTO waiter_reservation_table_rel (reservation_id, table_id)
            SELECT r.id, r.table_id FROM waiter_reservation r
            WHERE r.table_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM waiter_reservation_table_rel rel WHERE rel.reservation_id = r.id)
        """)

    # ------------------------------------------------------------------ reglas
    @api.constrains("time_start", "time_end", "people")
    def _check_slot(self):
        for reservation in self:
            if reservation.people < 1:
                raise ValidationError(_("La reserva %s necesita al menos una persona.", reservation.name))
            if not (0 <= reservation.time_start < reservation.time_end <= 24):
                raise ValidationError(_("La hora de fin debe ser posterior a la de inicio y ambas estar dentro del día."))
            if abs(reservation.time_start * 2 - round(reservation.time_start * 2)) > 1e-6:
                raise ValidationError(_("La hora de inicio debe caer en una franja de 30 minutos (por ejemplo 17:00 o 17:30)."))

    @api.constrains("date", "time_start")
    def _check_opening_hours(self):
        """La reserva debe empezar en una franja en que el restaurante recibe reservas ese día. Solo se revisa al crear o
        al mover de fecha u hora: acortar el horario después no invalida las reservas que ya existían, ni impide cambiarles
        las mesas (por eso `table_id` no dispara esta regla)."""
        for reservation in self.filtered(lambda r: r.state in ACTIVE_STATES):
            config = reservation.config_id
            if not config:
                continue
            ranges = config.reservation_ranges(reservation.date)
            if not any(start - 1e-6 <= reservation.time_start < end - 1e-6 for start, end in ranges):
                opening = ", ".join("%s–%s" % (hour_label(a), hour_label(b)) for a, b in ranges)
                raise ValidationError(
                    _("El %(day)s se reciben reservas de %(hours)s, y la reserva es a las %(time)s.",
                      day=reservation.date.strftime("%d/%m/%Y"), hours=opening, time=hour_label(reservation.time_start)) if ranges else
                    _("El %(day)s no se reciben reservas. Cambia el horario en Configuración → Horario de reservas.",
                      day=reservation.date.strftime("%d/%m/%Y")))

    @api.constrains("table_id", "table_ids", "date", "time_start", "time_end", "state", "prep_minutes")
    def _check_overlap(self):
        for reservation in self.filtered(lambda r: r.state in ACTIVE_STATES):
            clash = self.search(reservation._overlap_domain(), limit=1)
            if clash:
                shared = (clash.table_ids & reservation.table_ids)[:1]
                raise ValidationError(_(
                    "La mesa %(table)s ya tiene la reserva %(name)s de %(start)s a %(end)s el %(date)s.",
                    table=shared.display_name, name=clash.name, start=hour_label(clash.time_start),
                    end=hour_label(clash.time_end), date=fields.Date.to_string(clash.date),
                ))

    def _overlap_domain(self):
        self.ensure_one()
        return [
            ("id", "!=", self.id), ("table_ids", "in", self.table_ids.ids), ("date", "=", self.date),
            # El choque se mide sobre la ventana real, margen de preparación incluido: si una mesa se
            # aparta a las 19:30 para una reserva de las 20:00, otra reserva no puede acabar a las 19:45.
            ("state", "in", ACTIVE_STATES), ("hold_start", "<", self.time_end), ("time_end", ">", self.hold_start),
        ]

    # ------------------------------------------------------------------ ciclo de vida
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("name", "/") == "/":
                vals["name"] = self.env["ir.sequence"].next_by_code("waiter.reservation") or "/"
            if not vals.get("time_end") and vals.get("time_start") is not None:
                vals["time_end"] = vals["time_start"] + DEFAULT_DURATION_HOURS
            self._waiter_fill_tables(vals)
            self._waiter_fill_config(vals)
            # El estado del anticipo y el token del enlace los fija el servidor, nunca quien llama.
            amount = float(vals.get("deposit_amount") or 0.0)
            vals.update(deposit_state="pending" if amount > 0 else "none", deposit_reference=False, deposit_paid_at=False,
                        pay_token=secrets.token_urlsafe(24))
        reservations = super().create(vals_list)
        reservations._check_booking_rules()
        if not self.env.context.get("waiter_skip_confirmation_mail"):
            reservations._send_confirmation()
        return reservations

    def write(self, vals):
        vals = dict(vals)
        if "table_ids" in vals or "table_id" in vals:
            for reservation in self:  # cada una resuelve sus mesas: la principal siempre queda dentro de `table_ids`
                own = dict(vals)
                reservation._waiter_fill_tables(own)
                own.setdefault('config_id', reservation.config_id.id)
                reservation._waiter_fill_config(own)
                super(WaiterReservation, reservation).write(own)
        else:
            super().write(vals)
        if "table_ids" in vals or "table_id" in vals:
            self._waiter_sync_preorder_table()
        if "date" in vals or "time_start" in vals:
            self._check_booking_rules()  # mover la hora cuenta como reservar de nuevo; cambiar mesa o estado, no
        return True

    def _waiter_sync_preorder_table(self):
        """El pre-pedido en borrador vive en la mesa principal: si la principal cambia, se va con ella. Vive aquí (y no
        solo en waiter_set_tables) porque la principal cambia por cualquier write: table_id directo, una lista nueva o un
        UNLINK de la mesa principal."""
        for reservation in self:
            order = reservation.preorder_id
            if order and order.state == "draft" and order.table_id != reservation.table_id:
                order.table_id = reservation.table_id

    def _waiter_fill_tables(self, vals):
        """Deja `table_id` (principal) y `table_ids` (todas) coherentes. Quien llama puede mandar solo la principal (una
        mesa, como siempre), solo la lista (la primera pasa a principal) o las dos (la principal entra en la lista).
        Cambiar solo la principal de una reserva que ya existe la sustituye dentro de sus mesas, sin soltar las demás."""
        ids = table_ids_from(vals["table_ids"], self.table_ids.ids if self else []) if vals.get("table_ids") is not None else None
        main = vals.get("table_id")
        if ids is None:
            if not main:
                return
            ids = [main if table == self.table_id.id else table for table in self.table_ids.ids] if self else []
        elif not ids:
            raise ValidationError(_("La reserva necesita al menos una mesa."))
        elif not main:
            main = self.table_id.id if self and self.table_id.id in ids else ids[0]
        if main not in ids:
            ids = [main] + ids
        vals["table_id"] = main
        vals["table_ids"] = [Command.set(list(dict.fromkeys(ids)))]

    def _check_booking_rules(self):
        """Antelación mínima y ventana máxima del horario de reservas. Solo se revisa al crear o al mover fecha u hora."""
        for reservation in self.filtered(lambda r: r.state in ACTIVE_STATES):
            config = reservation._waiter_config()
            if not config:
                continue
            rules = config.waiter_reservation_schedule()["rules"]
            now = datetime.now(self._waiter_tz()).replace(tzinfo=None)
            start = datetime.combine(reservation.date, datetime.min.time()) + timedelta(hours=reservation.time_start)
            if rules["minNotice"] and start < now + timedelta(minutes=rules["minNotice"]):
                raise ValidationError(_("Las reservas se toman con al menos %s de antelación. Cámbialo en Configuración → Horario de reservas.",
                                        notice_label(rules["minNotice"])))
            if rules["maxDays"] and reservation.date > now.date() + timedelta(days=rules["maxDays"]):
                raise ValidationError(_("Solo se reserva hasta %s días hacia adelante. Cámbialo en Configuración → Horario de reservas.", rules["maxDays"]))

    def _send_confirmation(self):
        """Encola un mail.mail por cada reserva con correo del cliente. Devuelve los correos creados."""
        template = self.env.ref("projectapp_reservations.mail_template_reservation_confirmed", raise_if_not_found=False)
        mails = self.env["mail.mail"]
        if not template:
            return mails
        for reservation in self.filtered("customer_email"):
            mails |= mails.browse(template.send_mail(reservation.id, email_values={"email_to": reservation.customer_email}))
        return mails

    def action_seated(self):
        """El cliente llegó: la reserva pasa a sentada y el pre-pedido queda visible en la sesión abierta."""
        for reservation in self:
            if reservation.state != "confirmed":
                raise UserError(_("Solo una reserva confirmada puede pasar a sentada (%s está %s).", reservation.name, reservation.state))
            reservation.state = "seated"
            order = reservation.preorder_id
            if order and order.state == "draft":
                vals = {"preset_time": False, "table_id": reservation.table_id.id}
                config = order.config_id or reservation._waiter_config()
                if order.session_id.state == "closed" and config.current_session_id:
                    vals["session_id"] = config.current_session_id.id
                order.write(vals)
        return True

    # ------------------------------------------------------------------ anticipo
    def waiter_set_deposit(self, amount):
        """Cambia o quita el costo de una reserva activa que aún no se ha pagado. Un anticipo pagado no se toca."""
        self.ensure_one()
        if self.deposit_state == "paid":
            raise UserError(_("El anticipo de %s ya se pagó; no se puede cambiar.", self.name))
        if self.state not in ACTIVE_STATES:
            raise UserError(_("La reserva %s ya no está activa.", self.name))
        amount = float(amount or 0.0)
        vals = {"deposit_amount": amount, "deposit_state": "pending" if amount > 0 else "none"}
        if not self.pay_token:  # reservas anteriores a los anticipos
            vals["pay_token"] = secrets.token_urlsafe(24)
        self.write(vals)
        return self.waiter_detail()[0]

    def waiter_mark_deposit_paid(self, reference=None):
        """El cliente pagó el anticipo por fuera del enlace (efectivo, transferencia): se registra a mano."""
        self.ensure_one()
        if self.deposit_state != "pending":
            raise UserError(_("La reserva %s no tiene un anticipo pendiente.", self.name))
        self.write({"deposit_state": "paid", "deposit_paid_at": fields.Datetime.now(),
                    "deposit_reference": (reference or _("Registrado en el POS por %s", self.env.user.name))[:120]})
        return self.waiter_detail()[0]

    @api.model
    def waiter_deposit_public(self, token):
        """Lo que ve quien abre el enlace de pago: lo justo para reconocer su reserva. Sin correo, teléfono ni notas."""
        reservation = self._waiter_by_token(token)
        if not reservation:
            return False
        return {
            "code": reservation.name, "customer": (reservation.customer_name or "").split(" ")[0],
            "date": fields.Date.to_string(reservation.date), "time_label": hour_label(reservation.time_start),
            "people": reservation.people, "table_number": reservation.table_id.table_number,
            "table_numbers": reservation._waiter_tables().mapped("table_number"),
            "state": reservation.state, "deposit_state": reservation.deposit_state,
            "amount_in_cents": int(round(reservation.deposit_amount * 100)),
        }

    @api.model
    def waiter_deposit_paid(self, token, amount_in_cents, reference):
        """Concilia un pago aprobado por la pasarela. Idempotente por referencia; el monto debe ser el de la reserva."""
        reservation = self._waiter_by_token(token)
        if not reservation or not isinstance(reference, str) or not reference:
            return {"paid": False, "reason": "unknown"}
        self.env.cr.execute("SELECT id FROM waiter_reservation WHERE id = %s FOR UPDATE", [reservation.id])
        reservation.invalidate_recordset()
        if reservation.deposit_state == "paid":
            return {"paid": reservation.deposit_reference == reference, "reason": "already_paid"}
        if reservation.deposit_state != "pending" or int(round(reservation.deposit_amount * 100)) != amount_in_cents:
            return {"paid": False, "reason": "amount_changed"}
        reservation.write({"deposit_state": "paid", "deposit_paid_at": fields.Datetime.now(), "deposit_reference": reference[:120]})
        return {"paid": True, "reason": "paid"}

    def _waiter_pay_url(self):
        """Enlace público del anticipo en el menú del restaurante, o '' si el despliegue no tiene configurado el menú.
        Los tres parámetros son los mismos que usa la pasarela de Diseño del menú (projectapp_ops)."""
        self.ensure_one()
        param = self.env["ir.config_parameter"].sudo().get_param
        base, restaurant, venue = (param("projectapp.diner_url") or "").rstrip("/"), param("projectapp.restaurant_slug"), self.config_id.waiter_slug
        if not (base and restaurant and venue and self.pay_token):
            return ""
        return "%s/%s/%s/reserva/%s" % (base, restaurant, venue, self.pay_token)

    @api.model
    def _waiter_by_token(self, token):
        if not isinstance(token, str) or not 20 <= len(token) <= 64:
            return self.browse()
        return self.sudo().search([("pay_token", "=", token)], limit=1)

    def action_no_show(self):
        return self._waiter_close("no_show")

    def action_cancel(self):
        return self._waiter_close("cancelled")

    def _waiter_close(self, state):
        for reservation in self:
            if reservation.state not in ACTIVE_STATES:
                raise UserError(_("La reserva %s ya está %s.", reservation.name, reservation.state))
            reservation.state = state
            if reservation.preorder_id and reservation.preorder_id.state == "draft":
                reservation.preorder_id.write({"state": "cancel"})
        return True

    # ------------------------------------------------------------------ API para el POS
    @api.model
    def waiter_slots(self, config_id, date=None, span=None):
        """Franjas de 30 minutos en que se reciben reservas ese día, según el horario del pos.config
        (``reservation_ranges``: día de la semana, varias franjas, fechas especiales). Un día cerrado devuelve ``[]``.

        Cada franja: ``{"time": 10.5, "label": "10:30", "past": bool, "closed": bool}``; ``past`` solo se enciende hoy.
        Con ``span=(desde, hasta)`` devuelve todas las medias horas seguidas de ese tramo y marca ``closed`` las que caen
        fuera del horario: la línea de tiempo necesita columnas contiguas aunque el día parta almuerzo y cena.
        """
        config = self.env["pos.config"].browse(config_id)
        date = fields.Date.to_date(date) if date else fields.Date.context_today(self)
        ranges = config.reservation_ranges(date)
        now_hour = self._waiter_now_hour() if date == fields.Date.context_today(self) else -1.0
        # Antelación mínima: `soon` marca las horas que aún no pasaron pero ya no se pueden reservar (puede alcanzar a
        # mañana si la antelación cruza la medianoche). Ventana máxima: más allá, el día no ofrece horas.
        rules = config.waiter_reservation_schedule()["rules"]
        now = datetime.now(self._waiter_tz()).replace(tzinfo=None)
        earliest = now + timedelta(minutes=rules["minNotice"]) if rules["minNotice"] else None
        day_start = datetime.combine(date, datetime.min.time())
        beyond = bool(rules["maxDays"]) and date > now.date() + timedelta(days=rules["maxDays"])
        is_open = lambda hour: any(start - 1e-6 <= hour < end - 1e-6 for start, end in ranges)  # noqa: E731
        if span:
            first, last = span
        elif ranges and not beyond:
            first, last = ranges[0][0], ranges[-1][1]
        else:
            return []
        slots, hour = [], first
        while hour < last - 1e-6:
            if span or is_open(hour):
                past = hour < now_hour
                slots.append({"time": hour, "label": hour_label(hour), "past": past, "closed": not is_open(hour),
                              "soon": bool(earliest) and not past and day_start + timedelta(hours=hour) < earliest})
            hour += SLOT_HOURS
        return slots

    @api.model
    def waiter_available_tables(self, config_id, date, time_start, people, time_end=None, include_unavailable=False, prep_minutes="30", exclude_id=None):
        """Mesas del punto de venta sin reserva activa que solape y con ``seats >= people``.

        Con ``include_unavailable=True`` devuelve todas con ``status`` = available | reserved | unavailable
        (leyenda del kit "Available / Reserved / Can't Select") y ``reserved_at`` de la reserva que choca.
        El choque se mide con el margen de preparación de las dos partes: el de la reserva que ya existe y
        el de la que se está creando. ``exclude_id`` es la reserva que se está editando: sus propias mesas no le
        cuentan como ocupadas.
        """
        config = self.env["pos.config"].browse(config_id)
        date = fields.Date.to_date(date)
        time_end = time_end or time_start + DEFAULT_DURATION_HOURS
        hold_start = max(0.0, time_start - int(prep_minutes or "0") / 60.0)
        tables = config.floor_ids.filtered("active").table_ids.filtered("active")
        clashes = self.search([
            ("table_ids", "in", tables.ids), ("date", "=", date), ("state", "in", ACTIVE_STATES),
            ("hold_start", "<", time_end), ("time_end", ">", hold_start), ("id", "!=", exclude_id or 0),
        ], order="time_start, id")
        clash_by_table = {}
        for reservation in clashes:
            for table in reservation.table_ids:
                clash_by_table.setdefault(table.id, reservation)
        result = []
        for table in self._waiter_sorted_tables(tables):
            clash = clash_by_table.get(table.id)
            status = "reserved" if clash else ("unavailable" if table.seats < people else "available")
            if status != "available" and not include_unavailable:
                continue
            vals = self._waiter_table_vals(table)
            vals.update({
                "status": status, "available": status == "available",
                "reserved_at": hour_label(clash.time_start) if clash else False,
                "reservation": clash._waiter_card_vals() if clash else False,
            })
            result.append(vals)
        return result

    def waiter_set_tables(self, table_ids):
        """Cambia las mesas de una reserva confirmada; la primera de la lista queda como principal. Si la principal cambia,
        el pre-pedido en borrador se va con ella. Una reserva ya sentada no se toca aquí: eso es mover un pedido de mesa.
        Que las mesas nuevas estén libres a esa hora lo decide `_check_overlap`."""
        self.ensure_one()
        if self.state != "confirmed":
            raise UserError(_("Solo se cambian las mesas de una reserva confirmada (%s está %s).", self.name, self.state))
        ids = list(dict.fromkeys(table_ids or []))
        if not ids or not all(isinstance(i, int) for i in ids):
            raise UserError(_("La reserva necesita al menos una mesa."))
        self.write({"table_id": ids[0], "table_ids": ids})  # write() mueve el pre-pedido con la principal
        return self.waiter_detail()[0]

    @api.model
    def waiter_create(self, vals, lines=None):
        """Crea la reserva y, si hay ``lines``, un pos.order en borrador (preset Dine In) en la sesión abierta.

        ``vals``: campos de waiter.reservation más ``config_id`` opcional (si falta, el del piso de la mesa).
        ``lines``: ``[{"product_id": <product.product> | "product_tmpl_id": <product.template>, "qty": 1, "note": ""}]``.
        Devuelve el detalle (ver ``waiter_detail``). El correo de confirmación sale después del pre-pedido.
        """
        vals = dict(vals or {})
        config_id = vals.get("config_id")
        reservation = self.with_context(waiter_skip_confirmation_mail=True).create(vals)
        if lines:
            reservation._create_preorder(lines, config_id=config_id)
        reservation._send_confirmation()
        return reservation.waiter_detail()[0]

    def _waiter_timeline_span(self, config, date, reservations):
        """Tramo que dibuja la línea de tiempo: el horario del día, ensanchado para que ninguna reserva ya creada quede
        fuera (p. ej. tras acortar el horario). Un día cerrado y sin reservas usa el tramo habitual de la semana."""
        ranges = config.reservation_ranges(date)
        first, last = (ranges[0][0], ranges[-1][1]) if ranges else config.reservation_week_span()
        if reservations:
            first = min(first, math.floor(min(reservations.mapped("time_start")) * 2) / 2)
            last = max(last, math.ceil(max(reservations.mapped("time_end")) * 2) / 2)
        return first, last

    @api.model
    def waiter_timeline(self, config_id, date, floor_id=None):
        """Mesas × reservas activas del día para la grilla del kit (mesa por fila, franja por columna)."""
        config = self.env["pos.config"].browse(config_id)
        date = fields.Date.to_date(date)
        floors = config.floor_ids.filtered("active")
        if floor_id:
            floors = floors.filtered(lambda f: f.id == floor_id)
        tables = floors.table_ids.filtered("active")
        reservations = self.search([("table_ids", "in", tables.ids), ("date", "=", date), ("state", "in", ACTIVE_STATES)],
                                   order="time_start, id")
        by_table = {}
        for reservation in reservations:
            for table in reservation.table_ids:  # una reserva de varias mesas aparece en la fila de cada una
                by_table.setdefault(table.id, []).append(reservation._waiter_card_vals())
        return {
            "date": fields.Date.to_string(date),
            "slots": self.waiter_slots(config_id, date, span=self._waiter_timeline_span(config, date, reservations)),
            "floors": [{"id": floor.id, "name": floor.name} for floor in config.floor_ids.filtered("active").sorted("sequence")],
            "tables": [dict(self._waiter_table_vals(table), reservations=by_table.get(table.id, []))
                       for table in self._waiter_sorted_tables(tables)],
        }

    def waiter_detail(self):
        """Detalle completo de cada reserva, con las líneas del pre-pedido (modal "Reservation Detail")."""
        result = []
        for reservation in self:
            vals = reservation._waiter_card_vals()
            order = reservation.preorder_id
            vals.update({
                "customer_email": reservation.customer_email or "", "customer_phone": reservation.customer_phone or "",
                "date": fields.Date.to_string(reservation.date), "notes": reservation.notes or "",
                "table": self._waiter_table_vals(reservation.table_id),
                "tables": [self._waiter_table_vals(table) for table in reservation._waiter_tables()],
                "preorder_id": order.id or False, "preorder_state": order.state if order else False,
                "amount_total": reservation.amount_total, "currency_id": reservation.currency_id.id or False,
                "deposit_amount": reservation.deposit_amount, "deposit_state": reservation.deposit_state,
                "deposit_reference": reservation.deposit_reference or "", "pay_token": reservation.pay_token or "",
                "pay_url": reservation._waiter_pay_url(), "restaurant_name": reservation.config_id.company_id.name or "",
                "deposit_paid_at": fields.Datetime.to_string(reservation.deposit_paid_at) if reservation.deposit_paid_at else "",
                "lines": [{
                    "id": line.id, "product_id": line.product_id.id, "product_tmpl_id": line.product_id.product_tmpl_id.id,
                    "name": line.full_product_name or line.product_id.display_name, "qty": line.qty,
                    "price_unit": line.price_unit, "price_subtotal": line.price_subtotal,
                    "price_subtotal_incl": line.price_subtotal_incl, "note": line.customer_note or "",
                } for line in order.lines] if order else [],
            })
            result.append(vals)
        return result

    def waiter_time_label(self):
        self.ensure_one()
        return "%s – %s" % (hour_label(self.time_start), hour_label(self.time_end))

    # ------------------------------------------------------------------ internos
    def _waiter_card_vals(self):
        self.ensure_one()
        return {
            "id": self.id, "name": self.name, "customer_name": self.customer_name, "people": self.people,
            "baby_chair": self.baby_chair, "state": self.state, "date": fields.Date.to_string(self.date),
            "time_start": self.time_start, "time_end": self.time_end, "label": hour_label(self.time_start),
            "prep_minutes": self.prep_minutes, "hold_start": self.hold_start, "hold_label": hour_label(self.hold_start),
            "time_label": self.waiter_time_label(), "table_id": self.table_id.id, "table_number": self.table_id.table_number,
            "table_ids": self._waiter_tables().ids, "table_numbers": self._waiter_tables().mapped("table_number"),
            "seats": sum(self.table_ids.mapped("seats")),
            "config_id": self.config_id.id, "floor_id": self.floor_id.id, "floor_name": self.floor_id.name or "", "deposit_state": self.deposit_state,
        }

    def _waiter_tables(self):
        """Todas las mesas, con la principal primero."""
        self.ensure_one()
        return self.table_id | self._waiter_sorted_tables(self.table_ids - self.table_id)

    @api.model
    def _waiter_table_vals(self, table):
        return {"id": table.id, "table_number": table.table_number, "name": table.display_name, "seats": table.seats,
                "floor_id": table.floor_id.id, "floor_name": table.floor_id.name or "", "shape": table.shape}

    @api.model
    def _waiter_sorted_tables(self, tables):
        return tables.sorted(lambda t: (t.floor_id.sequence, t.floor_id.id, t.table_number, t.id))

    @api.model
    def _waiter_tz(self):
        return pytz.timezone(self.env.context.get("tz") or self.env.user.tz or "UTC")

    @api.model
    def _waiter_now_hour(self):
        now = datetime.now(self._waiter_tz())
        return now.hour + now.minute / 60.0

    @api.model
    def _waiter_fill_config(self, vals):
        table = self.env['restaurant.table'].browse(vals.get('table_id')).exists()
        configs = table.floor_id.pos_config_ids
        selected = vals.get('config_id') or self.env.context.get('waiter_config_id')
        if selected:
            config = self.env['pos.config'].browse(selected).exists()
            if config not in configs:
                raise ValidationError('La mesa no pertenece al restaurante de la reserva.')
        elif len(configs) == 1:
            config = configs
        else:
            raise ValidationError('Indica el restaurante al reservar una mesa compartida.')
        config.check_access('read')
        vals['config_id'] = config.id

    @api.constrains('config_id', 'table_id', 'table_ids', 'preorder_id')
    def _check_restaurant(self):
        for reservation in self:
            if any(reservation.config_id not in table.floor_id.pos_config_ids for table in reservation.table_ids | reservation.table_id):
                raise ValidationError('Todas las mesas deben pertenecer al restaurante de la reserva.')
            if reservation.preorder_id and reservation.preorder_id.config_id != reservation.config_id:
                raise ValidationError('El pre-pedido pertenece a otro restaurante.')

    def _waiter_config(self):
        self.ensure_one()
        return self.config_id

    def _waiter_preset_time(self):
        """Fecha y hora de inicio de la reserva en UTC, para `pos.order.preset_time`."""
        self.ensure_one()
        local = self._waiter_tz().localize(datetime.combine(self.date, datetime.min.time()) + timedelta(hours=self.time_start))
        return local.astimezone(pytz.utc).replace(tzinfo=None)

    def _create_preorder(self, lines, config_id=None):
        self.ensure_one()
        config = self.env["pos.config"].browse(config_id) if config_id else self._waiter_config()
        if config != self.config_id:
            raise ValidationError("El pre-pedido debe usar el restaurante de la reserva.")
        if not config:
            raise UserError(_("La mesa %s no pertenece a ningún punto de venta.", self.table_id.display_name))
        session = config.current_session_id
        if not session or session.state == "closed":
            raise UserError(_("Abre la caja de %s antes de registrar un pre-pedido.", config.name))
        preset = (self.env.ref("pos_restaurant.pos_takein_preset", raise_if_not_found=False)
                  or config.available_preset_ids.filtered(lambda p: p.service_at == "table")[:1])
        order = self.env["pos.order"].create({
            "session_id": session.id, "preset_id": preset.id or False, "table_id": self.table_id.id,
            "customer_count": self.people, "floating_order_name": "%s · %s" % (self.name, self.customer_name),
            "preset_time": self._waiter_preset_time(), "amount_tax": 0.0, "amount_total": 0.0, "amount_paid": 0.0,
            "amount_return": 0.0, "lines": [Command.create(self._preorder_line_vals(order_config=config, **line)) for line in lines],
        })
        for line in order.lines:
            line.write(line._compute_amount_line_all())
        order._compute_prices()
        self.preorder_id = order
        return order

    def _preorder_line_vals(self, order_config, product_id=None, product_tmpl_id=None, qty=1.0, note="", **_ignored):
        Product = self.env["product.product"]
        product = Product.browse(product_id) if product_id else self.env["product.template"].browse(product_tmpl_id).product_variant_id
        if not product.exists():
            raise UserError(_("El producto del pre-pedido no existe."))
        company = order_config.company_id
        taxes = product.taxes_id.filtered_domain(self.env["account.tax"]._check_company_domain(company))
        fiscal_taxes = order_config.default_fiscal_position_id.map_tax(taxes)
        pricelist = order_config.pricelist_id
        price = pricelist._get_product_price(product, qty or 1.0) if pricelist else product.lst_price
        price_unit = self.env["account.tax"]._fix_tax_included_price_company(price, taxes, fiscal_taxes, company)
        return {
            "name": "%s %s" % (self.name, product.display_name), "product_id": product.id, "qty": qty or 1.0,
            "price_unit": price_unit, "tax_ids": [Command.set(taxes.ids)], "full_product_name": product.display_name,
            "customer_note": note or False, "price_subtotal": 0.0, "price_subtotal_incl": 0.0,
        }
