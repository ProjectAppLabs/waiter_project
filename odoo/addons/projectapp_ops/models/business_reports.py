"""Periodos de la empresa y resumen comparativo del contrato Q2."""
from datetime import date, datetime, time, timedelta

import pytz

from odoo import api, models
from odoo.exceptions import AccessError, ValidationError

from .owner_permissions import is_owner, require_owner

# Odoo 19 no tiene estado «invoiced»: una venta facturada sigue en «paid» o «done» con su asiento.
PAID_STATES = ('paid', 'done')


def report_period(company, date_from, date_to):
    """Fechas inclusivas; la zona la decide la empresa, nunca el contexto del navegador."""
    try:
        start, end = date.fromisoformat(date_from), date.fromisoformat(date_to)
        if start.isoformat() != date_from or end.isoformat() != date_to or start > end:
            raise ValueError()
        previous_end = start - timedelta(days=1)
        previous_start = start - timedelta(days=(end - start).days + 1)
        zone = pytz.timezone(company.resource_calendar_id.tz or company.partner_id.tz or 'UTC')

        def midnight(day):
            return zone.localize(datetime.combine(day, time.min)).astimezone(pytz.utc).replace(tzinfo=None)

        return {'start': midnight(start), 'end': midnight(end + timedelta(days=1)),
                'previous_start': midnight(previous_start), 'previous_end': midnight(start),
                'previous_from': previous_start.isoformat(), 'previous_to': previous_end.isoformat()}
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValidationError('Indica un rango válido de fechas YYYY-MM-DD, desde la menor hasta la mayor.') from exc


def report_configs(env, config_ids=None, require_selection=False):
    """Valida el alcance antes de leer cifras, incluso si el usuario conserva grupos amplios de Odoo."""
    owner = is_owner(env)
    if not owner and (env.user.waiter_role != 'admin' or require_selection and config_ids is None):
        raise AccessError('Solo el dueño o el encargado de un restaurante puede consultar este informe.')
    configs = env['pos.config'].with_context(active_test=False)
    domain = [('company_id', '=', env.company.id)]
    if config_ids is not None:
        if not isinstance(config_ids, list) or any(type(i) is not int or i <= 0 for i in config_ids):
            raise ValidationError('Indica una lista de restaurantes válidos.')
        if not owner and not set(config_ids) <= set(env.user.waiter_config_ids.ids):
            raise AccessError('No puedes consultar información de otro restaurante.')
        domain.append(('id', 'in', config_ids))
    elif not owner:
        domain.append(('id', 'in', env.user.waiter_config_ids.ids))
    result = configs.search(domain, order='name, id')
    if config_ids is not None and set(result.ids) != set(config_ids):
        raise AccessError('El restaurante no pertenece a la organización activa o no está disponible.')
    return result


def empty_metrics():
    return {'sales': 0.0, 'orders': 0, 'ticket': 0.0, 'guests': 0, 'tips': 0.0}


class PosConfig(models.Model):
    _inherit = 'pos.config'

    @api.model
    def waiter_org_summary(self, date_from, date_to):
        require_owner(self.env)
        company = self.env.company
        period = report_period(company, date_from, date_to)
        configs = report_configs(self.env)
        current = {c.id: empty_metrics() for c in configs}
        previous = {c.id: empty_metrics() for c in configs}
        orders = self.env['pos.order'].search([
            ('config_id', 'in', configs.ids), ('state', 'in', PAID_STATES),
            ('date_order', '>=', period['previous_start']), ('date_order', '<', period['end']),
        ])
        for order in orders:
            metrics = (current if order.date_order >= period['start'] else previous)[order.config_id.id]
            tips = sum(line.price_subtotal_incl for line in order.lines
                       if line.product_id == order.config_id.tip_product_id)
            # Conserva el signo del documento: un reembolso resta venta y propina.
            currency = order.currency_id
            metrics['sales'] += currency._convert(order.amount_total - tips, company.currency_id, company, order.date_order)
            metrics['tips'] += currency._convert(tips, company.currency_id, company, order.date_order)
            # Pedidos cuenta documentos válidos, incluidos reembolsos; comensales suma customer_count.
            metrics['orders'] += 1
            metrics['guests'] += order.customer_count

        def finish(metrics):
            metrics['sales'] = company.currency_id.round(metrics['sales'])
            metrics['tips'] = company.currency_id.round(metrics['tips'])
            metrics['ticket'] = metrics['sales'] / metrics['orders'] if metrics['orders'] else 0.0
            return metrics

        def total(rows):
            metrics = empty_metrics()
            for row in rows.values():
                for key in ('sales', 'orders', 'guests', 'tips'):
                    metrics[key] += row[key]
            return finish(metrics)

        return {'currency': company.currency_id.name, 'date_from': date_from, 'date_to': date_to,
                'previous_from': period['previous_from'], 'previous_to': period['previous_to'],
                'restaurants': [{'config_id': c.id, 'name': c.name, **finish(current[c.id]),
                                 'previous': finish(previous[c.id])} for c in configs],
                'total': {**total(current), 'previous': total(previous)}}
