from datetime import datetime, time, timedelta

import pytz

from odoo import fields, models

PAID_STATES = ('paid', 'done', 'invoiced')
HISTORY_DAYS = 84   # 12 semanas: lo que mira la predicción del mes siguiente
WINDOW_DAYS = 28    # «últimos 28 días» de la estadística por plato (cuatro semanas completas: no sesga el día de la semana)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def waiter_sales_insights(self):
        """Historial de ventas ya agregado para el tablero de Inicio. Solo suma: la predicción y los rankings se calculan en
        el POS (`pos/lib/domain/insights.ts`), donde son funciones puras con sus pruebas.

        ``daily``: un renglón por día **con ventas** de los últimos 84 días (día local del usuario).
        ``hourly``: ventas y pedidos por hora local del día, sumados sobre los últimos 28 días (horas pico).
        ``products``: unidades e ingreso por producto en los últimos 28 días, y unidades de los 28 anteriores (tendencia).
        La propina no es un plato y no cuenta.
        """
        self.ensure_one()
        self.check_access('read')
        # La zona de la empresa (la misma del resumen del dueño): con la del usuario, quien no la tiene configurada sumaba en
        # UTC y una venta del domingo a las 11 p. m. en Bogotá salía en «esta semana».
        company = self.company_id or self.env.company
        tz = pytz.timezone(company.resource_calendar_id.tz or company.partner_id.tz or self.env.user.tz or 'UTC')
        today = datetime.now(tz).date()

        def utc_start(day):  # medianoche local de ese día, en UTC sin zona (como guarda Odoo)
            return tz.localize(datetime.combine(day, time.min)).astimezone(pytz.utc).replace(tzinfo=None)

        orders = [('config_id', '=', self.id), ('state', 'in', PAID_STATES)]
        daily, hourly = {}, {}
        recent_start = (today - timedelta(days=WINDOW_DAYS - 1)).isoformat()
        history = self.env['pos.order'].search_read(orders + [('date_order', '>=', utc_start(today - timedelta(days=HISTORY_DAYS)))], ['date_order', 'amount_total'])
        for order in history:
            local = pytz.utc.localize(order['date_order']).astimezone(tz)
            day = local.date().isoformat()
            row = daily.setdefault(day, {'date': day, 'total': 0.0, 'orders': 0})
            row['total'] += order['amount_total']
            row['orders'] += 1
            if day >= recent_start:
                slot = hourly.setdefault(local.hour, {'hour': local.hour, 'total': 0.0, 'orders': 0})
                slot['total'] += order['amount_total']
                slot['orders'] += 1

        def units(since, until):
            domain = [('order_id.config_id', '=', self.id), ('order_id.state', 'in', PAID_STATES), ('order_id.date_order', '>=', utc_start(since)),
                      ('order_id.date_order', '<', utc_start(until)), ('product_id', '!=', self.tip_product_id.id or 0), ('qty', '>', 0)]
            groups = self.env['pos.order.line']._read_group(domain, ['product_id'], ['qty:sum', 'price_subtotal_incl:sum'])
            return {product: (qty, amount) for product, qty, amount in groups}

        recent = units(today - timedelta(days=WINDOW_DAYS - 1), today + timedelta(days=1))
        previous = units(today - timedelta(days=2 * WINDOW_DAYS - 1), today - timedelta(days=WINDOW_DAYS - 1))
        # Unión de las dos ventanas: un plato que se vendía y dejó de venderse también sale (con cero ahora), porque su
        # caída es justo lo que «menos pedidos» debe mostrar.
        products = [{'product_id': product.id, 'template_id': product.product_tmpl_id.id, 'name': product.display_name,
                     'qty': recent.get(product, (0.0, 0.0))[0], 'amount': recent.get(product, (0.0, 0.0))[1],
                     'prev_qty': previous.get(product, (0.0, 0.0))[0]} for product in recent.keys() | previous.keys()]
        return {'today': today.isoformat(), 'window_days': WINDOW_DAYS, 'history_days': HISTORY_DAYS,
                'daily': sorted(daily.values(), key=lambda r: r['date']), 'hourly': sorted(hourly.values(), key=lambda r: r['hour']), 'products': sorted(products, key=lambda p: -p['qty'])}
