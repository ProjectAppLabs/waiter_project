"""Decisiones del negocio: el grupo de encargado nunca sustituye al de dueño."""
from odoo import api, models
from odoo.exceptions import AccessError


def is_owner(env):
    return (env.user.has_group('projectapp_ops.group_waiter_owner')
            or env.user.has_group('base.group_system'))


def require_owner(env):
    if not is_owner(env):
        raise AccessError('Solo el dueño puede administrar esta información del negocio.')


COMMERCIAL_FIELDS = {'list_price', 'lst_price', 'taxes_id', 'available_in_pos', 'pos_categ_ids', 'name'}
ROI_FIELDS = {'roi_hour_cost', 'roi_minutes_per_order', 'roi_baseline_hours_per_100',
              'roi_monthly_cost', 'roi_start_date'}


def check_product_write(records, vals):
    # Las operaciones internas de valoración conservan su sudo; una RPC no puede obtenerlo con contexto.
    if records.env.su:
        return
    if COMMERCIAL_FIELDS & vals.keys():
        require_owner(records.env)
    if 'standard_price' in vals and any(p.standard_price != vals['standard_price'] for p in records):
        require_owner(records.env)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.su:
            available = self.default_get(['available_in_pos']).get('available_in_pos', False)
            if any(vals.get('available_in_pos', available) for vals in vals_list):
                require_owner(self.env)
        return super().create(vals_list)

    def write(self, vals):
        check_product_write(self, vals)
        return super().write(vals)


class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.su:
            available = self.default_get(['available_in_pos']).get('available_in_pos', False)
            for vals in vals_list:
                template = self.env['product.template'].browse(vals.get('product_tmpl_id'))
                if vals.get('available_in_pos', template.available_in_pos if template else available):
                    require_owner(self.env)
        return super().create(vals_list)

    def write(self, vals):
        check_product_write(self, vals)
        return super().write(vals)


class PosCategory(models.Model):
    _inherit = 'pos.category'

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.su:
            require_owner(self.env)
        return super().create(vals_list)

    def write(self, vals):
        if not self.env.su:
            require_owner(self.env)
        return super().write(vals)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def write(self, vals):
        if not self.env.su and (ROI_FIELDS | {'payment_method_ids', 'invoice_journal_id', 'pricelist_id',
                                             'available_pricelist_ids', 'use_pricelist'}) & vals.keys():
            require_owner(self.env)
        return super().write(vals)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.su:
            require_owner(self.env)
        return super().create(vals_list)

    def write(self, vals):
        if not self.env.su:
            require_owner(self.env)
        return super().write(vals)

    def unlink(self):
        if not self.env.su:
            require_owner(self.env)
        return super().unlink()


class ProductPricelist(models.Model):
    _inherit = 'product.pricelist'

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.su:
            require_owner(self.env)
        return super().create(vals_list)

    def write(self, vals):
        if not self.env.su:
            require_owner(self.env)
        return super().write(vals)

    def unlink(self):
        if not self.env.su:
            require_owner(self.env)
        return super().unlink()


class ProductPricelistItem(models.Model):
    _inherit = 'product.pricelist.item'

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.su:
            require_owner(self.env)
        return super().create(vals_list)

    def write(self, vals):
        if not self.env.su:
            require_owner(self.env)
        return super().write(vals)

    def unlink(self):
        if not self.env.su:
            require_owner(self.env)
        return super().unlink()
