"""Rentabilidad bruta con receta actual y precio vigente, por restaurante u organización."""
from collections import defaultdict

from odoo import api, models

from odoo.addons.projectapp_ops.models.business_reports import PAID_STATES, report_configs, report_period


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model
    def waiter_profitability(self, date_from, date_to, config_id=None):
        configs = report_configs(self.env, [config_id] if config_id is not None else None, require_selection=True)
        company = self.env.company
        period = report_period(company, date_from, date_to)
        config = configs if config_id is not None else self.env['pos.config']
        tips = configs.tip_product_id
        templates = self.with_company(company).search([
            ('company_id', 'in', [False, company.id]), ('available_in_pos', '=', True),
            ('sale_ok', '=', True), ('is_ingredient', '=', False),
            ('id', 'not in', tips.product_tmpl_id.ids),
        ], order='name, id')
        lines = self.env['pos.order.line'].search([
            ('order_id.config_id', 'in', configs.ids), ('order_id.state', 'in', PAID_STATES),
            ('order_id.date_order', '>=', period['start']), ('order_id.date_order', '<', period['end']),
            ('product_id.product_tmpl_id', 'in', templates.ids),
        ])
        sales = defaultdict(lambda: {'units': 0.0, 'revenue': 0.0})
        for line in lines:
            row = sales[line.product_id.product_tmpl_id.id]
            row['units'] += line.qty
            # Ingresos sin impuestos, con descuentos y reembolsos; el margen bruto usa el costo actual.
            row['revenue'] += line.order_id.currency_id._convert(
                line.price_subtotal, company.currency_id, company, line.order_id.date_order)
        prices = config.waiter_catalog_prices(templates.product_variant_id.ids) if config else {}
        requirements = templates._pantry_requirements()
        rows = []
        for template in templates:
            product = template.product_variant_id
            price = prices.get(str(product.id), product.lst_price)
            if config and config.pricelist_id:
                price = config.pricelist_id.currency_id._convert(price, company.currency_id, company, period['end'].date())
            taxes = product.taxes_id.filtered(lambda t: t.company_id == company)
            net_price = taxes.compute_all(price, currency=company.currency_id, quantity=1, product=product)['total_excluded']
            costs = template._pantry_recipe_costs(requirements.get(template.id, {}))
            # Una receta incompleta (algún ingrediente sin costo) tampoco afirma un margen conocido.
            cost = sum(costs.values()) if costs and all(value > 0 for value in costs.values()) else None
            margin = net_price - cost if cost is not None else None
            units, revenue = sales[template.id]['units'], sales[template.id]['revenue']
            rows.append({'template_id': template.id, 'name': template.name,
                         'category': ', '.join(template.pos_categ_ids.mapped('name')),
                         'price': price, 'cost': cost, 'margin': margin,
                         'food_cost_pct': cost / net_price * 100 if cost is not None and net_price > 0 else None,
                         'units': units, 'revenue': revenue,
                         'gross_profit': revenue - cost * units if cost is not None else None, 'class': None})
        eligible = [row for row in rows if row['units'] > 0 and row['cost'] is not None]
        total_units = sum(row['units'] for row in eligible)
        popularity = 0.7 * total_units / len(eligible) if eligible else 0.0
        weighted_margin = sum(row['margin'] * row['units'] for row in eligible) / total_units if total_units else 0.0
        for row in eligible:
            popular, profitable = row['units'] >= popularity, row['margin'] >= weighted_margin
            row['class'] = ('star' if profitable else 'plowhorse') if popular else ('puzzle' if profitable else 'dog')
        return {'currency': company.currency_id.name, 'config_id': config_id, 'date_from': date_from, 'date_to': date_to,
                'thresholds': {'popularity_units': popularity, 'margin': weighted_margin}, 'rows': rows}
