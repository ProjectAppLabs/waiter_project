"""Combos fijos: producto vendible con precio propio y kit de sus componentes."""
import json
from collections import defaultdict
from odoo import api, fields, models, Command
from odoo.exceptions import UserError, AccessError
from odoo.addons.projectapp_ops.models.owner_permissions import require_owner


def attributes(raw):
    try:
        value = json.loads(raw or '{}')
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


class ProductTemplate(models.Model):
    _inherit = 'product.template'
    waiter_combo_bom_id = fields.Many2one('mrp.bom', copy=False, readonly=True)

    def waiter_combo_availability(self):
        self.check_access('read')
        result={}
        for template in self.filtered('waiter_combo_bom_id'):
            components=template.waiter_combo_bom_id.bom_line_ids.product_id
            available=all(p.active and p.available_in_pos and self._waiter_config() not in p.waiter_unavailable_config_ids for p in components)
            result[str(template.product_variant_id.id)]=bool(available and (not template.has_recipe or template.servings_available>0))
        return result

    @api.model
    def waiter_save_catalog_product(self, product_id, values, employee_id, token):
        require_owner(self.env)
        self._pantry_manager(employee_id, token)
        allowed = {'image_1920','name','list_price','pos_categ_ids','taxes_id','available_in_pos','is_storable','is_favorite','description_sale','diner_attributes','type','sale_ok'}
        if not isinstance(values,dict) or set(values)-allowed or values.get('type')!='consu':
            raise UserError('Datos del producto inválidos.')
        product = self.browse(product_id).exists() if product_id else self.browse()
        if product_id and not product: raise UserError('El producto ya no existe.')
        if product:
            if product.company_id and product.company_id not in self.env.companies: raise AccessError('Producto de otra compañía.')
            product.write(values)
        else:
            product = self.create(values)
        return product.id

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._sync_catalog_combo()
        return records

    def write(self, vals):
        if 'diner_attributes' in vals:
            new_combo=attributes(vals['diner_attributes']).get('combo',[])
            changed=self.filtered(lambda p: attributes(p.diner_attributes).get('combo',[]) != new_combo)
            if changed and self._pantry_pending_orders().lines.filtered(lambda line: line.qty>0 and line.product_id.product_tmpl_id in changed):
                raise UserError('Hay pedidos pendientes de este producto. Termínalos antes de cambiar su composición.')
        result = super().write(vals)
        if 'diner_attributes' in vals:
            self._sync_catalog_combo()
        return result

    def _sync_catalog_combo(self):
        for product in self:
            attrs = attributes(product.diner_attributes)
            items = attrs.get('combo', [])
            if not items and not product.waiter_combo_bom_id: continue
            if not self.env.user.has_group('point_of_sale.group_pos_manager'):
                raise AccessError('Solo un administrador puede configurar combos.')
            if not isinstance(items,list) or len(items)>12:
                raise UserError('El combo admite hasta doce componentes.')
            if not items:
                bom = product.waiter_combo_bom_id
                super(ProductTemplate,product).write({'waiter_combo_bom_id':False})
                bom.unlink()
                continue
            if len(items)<2: raise UserError('Incluye al menos dos productos en el combo.')
            normalized, seen, lines = [], set(), []
            for item in items:
                if not isinstance(item,dict) or type(item.get('producto')) is not int or type(item.get('cantidad')) is not int or not 1<=item['cantidad']<=20:
                    raise UserError('Selecciona un producto y una cantidad entera de 1 a 20.')
                component = self.env['product.product'].browse(item['producto']).exists()
                if not component or component.id in seen or component.product_tmpl_id==product or component.type!='consu' or not component.sale_ok or not component.available_in_pos or component.company_id and component.company_id not in self.env.companies:
                    raise UserError('Los componentes deben ser productos disponibles, distintos y de esta compañía.')
                if attributes(component.diner_attributes).get('combo'):
                    raise UserError('Selecciona platos individuales; no se permiten combos dentro de combos.')
                seen.add(component.id)
                normalized.append({'producto':component.id,'cantidad':item['cantidad'],'nombre':component.name})
                lines.append(Command.create({'product_id':component.id,'product_qty':item['cantidad'],'product_uom_id':component.uom_id.id}))
            bom = product.waiter_combo_bom_id
            if not bom and product._pantry_boms().get(product.id):
                raise UserError('Este producto ya tiene receta. Crea un producto nuevo para el combo.')
            values = {'product_tmpl_id':product.id,'product_qty':1,'product_uom_id':product.uom_id.id,'type':'phantom','company_id':self.env.company.id,'bom_line_ids':[Command.clear()]+lines}
            if bom: bom.write(values)
            else: bom=self.env['mrp.bom'].create(values)
            attrs['combo']=normalized
            super(ProductTemplate,product).write({'waiter_combo_bom_id':bom.id,'diner_attributes':json.dumps(attrs,ensure_ascii=False),'is_storable':False})

    def _pantry_requirements(self):
        result = super()._pantry_requirements()
        # Un kit de platos debe reservar sus ingredientes, no existencias ficticias de platos terminados.
        def expand(product, qty, path):
            template = product.product_tmpl_id
            if template.id in path: raise UserError('La receta contiene una referencia circular.')
            bom = template._pantry_boms().get(template.id)
            if not bom: return {product.id:qty} if product.is_storable else {}
            totals = defaultdict(float)
            for line in bom.bom_line_ids:
                amount=line.product_uom_id._compute_quantity(line.product_qty,line.product_id.uom_id,round=False)/(bom.product_qty or 1)
                for pid,value in expand(line.product_id,qty*amount,path|{template.id}).items(): totals[pid]+=value
            return totals
        for product in self.filtered('waiter_combo_bom_id'):
            result[product.id]=dict(expand(product.product_variant_id,1,set()))
        return result

    def waiter_update_recipe(self, *args, **kwargs):
        require_owner(self.env)
        if self.waiter_combo_bom_id:
            raise UserError('Edita la composición del combo desde Catálogo. Las recetas se editan en sus platos individuales.')
        return super().waiter_update_recipe(*args, **kwargs)


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'
    waiter_combo_summary = fields.Text(copy=False, readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            product=self.env['product.product'].browse(vals.get('product_id')).exists()
            items=attributes(product.diner_attributes).get('combo',[]) if product else []
            if items:
                summary='Incluye por combo: '+', '.join(f"{i['cantidad']} × {i['nombre']}" for i in items)
                vals['waiter_combo_summary']=summary
                vals['customer_note']=' · '.join(filter(None,[vals.get('customer_note'),summary]))
        return super().create(vals_list)

    def write(self, vals):
        if 'customer_note' in vals:
            for line in self:
                copy=dict(vals)
                if line.waiter_combo_summary and line.waiter_combo_summary not in (copy.get('customer_note') or ''):
                    copy['customer_note']=' · '.join(filter(None,[copy.get('customer_note'),line.waiter_combo_summary]))
                super(PosOrderLine,line).write(copy)
            return True
        return super().write(vals)
