"""Catálogo, recetas, precios, imágenes y existencias de origen."""
from types import SimpleNamespace
from django.core.management.base import CommandError

from catalog import images, services
from catalog.models import Category, Product, Supplier, Tax, Unit, RestaurantPrice, RestaurantUnavailable
from inventory.models import Stock
from tenancy.models import Restaurant
from .base import oid, parsed, dec, fingerprint
from .units import unit_value


class CatalogImport:
    def catalog(self):
        org = self.org
        actor = SimpleNamespace(role='owner', organization=org)
        archived = []
        for r in self.read('account.tax', 'name amount price_include active amount_type company_id type_tax_use', [('company_id', '=', self.company)]):
            if r.get('type_tax_use', 'sale') != 'sale' or r.get('amount_type', 'percent') != 'percent':
                self.skip('account.tax', 'impuesto no porcentual de venta')
                continue
            obj = self.upsert('account.tax', r, Tax, dict(organization=org, name=r['name'], amount=dec(r['amount']),
                included=r.get('price_include', True), active=True), match={'organization': org, 'name': r['name']})
            if not r.get('active', True):
                archived.append(obj)
        for r in self.read('pos.category', 'name sequence kitchen_station active'):
            obj = self.upsert('pos.category', r, Category, dict(organization=org, name=r['name'], sequence=r.get('sequence', 0),
                station=r.get('kitchen_station') or '', active=True))
            if not r.get('active', True):
                archived.append(obj)
        templates = list(self.read('product.template',
            'name active is_ingredient available_in_pos list_price standard_price uom_id pantry_category pantry_supplier_id '
            'pos_categ_ids taxes_id description_sale pos_is_favorite diner_attributes image_1920 image_origin '
            'waiter_unavailable_config_ids waiter_combo_bom_id', ['|', ('company_id', '=', False), ('company_id', '=', self.company)]))
        for r in self.read('res.partner', 'name phone email active', ['|', ('supplier_rank', '>', 0), ('id', 'in', [oid(t['pantry_supplier_id']) for t in templates if t.get('pantry_supplier_id')]), '|', ('company_id', '=', False), ('company_id', '=', self.company)]):
            obj = self.upsert('res.partner.supplier', r, Supplier, dict(organization=org, name=r['name'], phone=r.get('phone') or '',
                email=r.get('email') or '', active=True))
            if not r.get('active', True):
                archived.append(obj)
        units = {r['id']: r for r in self.read('uom.uom', 'name factor relative_factor relative_uom_id category_id')}
        needed = {oid(r.get('uom_id')) for r in templates if r.get('is_ingredient')}
        for r in units.values():
            try:
                root, factor = unit_value(r, units)
            except CommandError:
                if r['id'] in needed:
                    raise
                self.skip('uom.uom', 'unidad no usada sin equivalencia')
                continue
            self.upsert('uom.uom', r, Unit, dict(organization=org, name=r['name'], root=root, factor=factor),
                match={'organization': org, 'name': r['name']})
        self.templates = {r['id']: r for r in templates}
        for r in templates:
            kind = 'ingredient' if r.get('is_ingredient') else 'dish'
            data = dict(name=r['name'], kind=kind)
            if kind == 'ingredient':
                data.update(unit_id=self.ref('uom.uom', r['uom_id']).pk, pantry_category=r.get('pantry_category') or 'dry',
                    cost=r.get('standard_price', 0), supplier_id=self.ref('res.partner.supplier', r.get('pantry_supplier_id'), True).pk if r.get('pantry_supplier_id') else None)
            else:
                data.update(price=r.get('list_price', 0), category_ids=[self.ref('pos.category', i).pk for i in r.get('pos_categ_ids', [])],
                    tax_ids=[self.ref('account.tax', i).pk for i in r.get('taxes_id', [])], description=r.get('description_sale') or '',
                    favorite=r.get('pos_is_favorite', False), available_in_pos=r.get('available_in_pos', False))
            old = self.ref('product.template', r['id']) if self.mapping('product.template', r['id']) else Product.objects.filter(organization=org, legacy_odoo_template_id=r['id']).first()
            previous = self.mapping('product.template', r['id'])
            if 'image_1920' in r and (not previous or previous.fingerprint != fingerprint(r)):
                data.update(image=r['image_1920'] or None, image_origin=r.get('image_origin') or None)
            product = services.save_product(actor, data, old)
            product.legacy_odoo_template_id = r['id']
            product.active = True
            product.save(update_fields=['legacy_odoo_template_id', 'active'])
            self.remember('product.template', r['id'], product, r)
            self.report['product.template']['leídos'] += 1
            self.report['product.template']['actualizados' if old else 'creados'] += 1
        self.variants = list(self.read('product.product', 'product_tmpl_id', [('product_tmpl_id', 'in', list(self.templates))]))
        variant_templates = [oid(r['product_tmpl_id']) for r in self.variants]
        services.valid(len(variant_templates) == len(set(variant_templates)), 'Hay plantillas con varias variantes; el catálogo propio requiere resolver sus diferencias antes de migrar.')
        for r in self.variants:
            self.remember('product.product', r['id'], self.ref('product.template', r['product_tmpl_id']))
        # Las referencias de atributos son variantes Odoo; las recetas usan plantillas para el plato.
        for r in templates:
            product = self.ref('product.template', r['id'])
            attrs = parsed(r.get('diner_attributes'), {})
            for key in ('extras', 'acompanamientos'):
                if key in attrs:
                    attrs[key] = [self.ref('product.product', i).pk for i in attrs[key]]
            for item in attrs.get('combo', []):
                item['producto'] = self.ref('product.product', item['producto']).pk
            if product.kind == 'dish':
                services.save_product(actor, {'diner_attributes': attrs, 'preparation_minutes': attrs.get('tiempoPreparacion')}, product)
            for rest in Restaurant.objects.filter(organization=org):
                unavailable = rest.legacy_odoo_config_id in r.get('waiter_unavailable_config_ids', [])
                if unavailable:
                    _, created = RestaurantUnavailable.objects.get_or_create(restaurant=rest, product=product)
                    self.counted('agotados por sede', created)
                else:
                    RestaurantUnavailable.objects.filter(restaurant=rest, product=product).delete()
        photos = list(self.read('projectapp.product.photo', 'product_tmpl_id sequence image', [('product_tmpl_id', 'in', list(self.templates))]))
        for template in templates:
            rows = sorted([p for p in photos if oid(p['product_tmpl_id']) == template['id']], key=lambda p: (p.get('sequence', 0), p['id']))
            if not rows:
                continue
            product = self.ref('product.template', template['id'])
            raw = []
            for r in rows:
                previous = self.mapping('projectapp.product.photo', r['id'])
                raw.append({'id': int(previous.local_id)} if previous and previous.fingerprint == fingerprint(r) else {'image': r['image']})
            existed = {r['id']: bool(self.mapping('projectapp.product.photo', r['id'])) for r in rows}
            result = images.set_photos(product, raw)
            for r, saved in zip(rows, result):
                from catalog.models import ProductPhoto
                self.remember('projectapp.product.photo', r['id'], ProductPhoto.objects.get(pk=saved['id']), r)
                self.counted('projectapp.product.photo', not existed[r['id']])
        boms = list(self.read('mrp.bom', 'product_tmpl_id product_qty product_uom_id active type',
            [('product_tmpl_id', 'in', list(self.templates)), ('active', '=', True), '|', ('company_id', '=', False), ('company_id', '=', self.company)]))
        lines = list(self.read('mrp.bom.line', 'bom_id product_id product_qty product_uom_id', [('bom_id', 'in', [b['id'] for b in boms])]))
        seen = set()
        for r in boms:
            if r.get('type', 'phantom') != 'phantom':
                self.skip('mrp.bom', 'lista de fabricación; no es receta del POS')
                continue
            template_id = oid(r['product_tmpl_id'])
            if oid(self.templates[template_id].get('waiter_combo_bom_id')) == r['id']:
                self.skip('mrp.bom', 'lista técnica automática de combo')
                continue
            if template_id in seen:
                raise ValueError('Hay varias recetas activas para un plato; selecciona una antes de migrar.')
            seen.add(template_id)
            product = self.ref('product.template', template_id)
            data = {'yield_qty': r['product_qty'], 'lines': [dict(ingredient_id=self.ref('product.product', l['product_id']).pk,
                qty=l['product_qty'], unit_id=self.ref('uom.uom', l['product_uom_id']).pk) for l in lines if oid(l['bom_id']) == r['id']]}
            previous = self.mapping('mrp.bom', r['id'])
            if not previous or previous.fingerprint != fingerprint(data):
                services.set_recipe(product, data)
                self.remember('mrp.bom', r['id'], product.recipe if data['lines'] else product, data)
            self.counted('mrp.bom', not previous)
        for config in self.configs:
            rest = self.ref('pos.config', config['id'])
            ids = [r['id'] for r in self.variants if self.ref('product.product', r['id']).kind == 'dish']
            for start in range(0, len(ids), self.batch_size):
                prices = self.client.call_kw('pos.config', 'waiter_catalog_prices', [[config['id']], ids[start:start + self.batch_size]], {'context': self.context})
                for key, price in prices.items():
                    product = self.ref('product.product', int(key))
                    _, created = RestaurantPrice.objects.update_or_create(restaurant=rest, product=product, defaults={'price': services.number(price)})
                    self.counted('precios por sede', created)
            warehouse = list(self.read('stock.warehouse', 'lot_stock_id', [('id', '=', oid(config.get('warehouse_id')))])) if config.get('warehouse_id') else []
            if not warehouse:
                if any(r.get('is_ingredient') for r in templates):
                    raise ValueError(f"Falta el almacén de inventario de {rest.slug}.")
                continue
            location = oid(warehouse[0]['lot_stock_id'])
            quants = list(self.read('stock.quant', 'product_id quantity', [('location_id', 'child_of', location), ('company_id', '=', self.company)]))
            thresholds = list(self.read('stock.warehouse.orderpoint', 'product_id product_min_qty product_max_qty', [('location_id', '=', location), ('company_id', '=', self.company)]))
            for variant in self.variants:
                product = self.ref('product.product', variant['id'])
                if product.kind != 'ingredient':
                    continue
                qty = sum((dec(q['quantity']) for q in quants if oid(q['product_id']) == variant['id']), dec(0))
                threshold = next((t for t in thresholds if oid(t['product_id']) == variant['id']), {})
                self.upsert('stock.snapshot', {'id': f"{config['id']}:{variant['id']}"}, Stock,
                    dict(restaurant=rest, ingredient=product, qty=services.number(qty), min=dec(threshold.get('product_min_qty', 5)), max=dec(threshold.get('product_max_qty', 20))),
                    match={'restaurant': rest, 'ingredient': product})
        for r in templates:
            Product.objects.filter(pk=self.ref('product.template', r['id']).pk).update(active=r.get('active', True))

        for obj in archived:
            type(obj).objects.filter(pk=obj.pk).update(active=False)

        dishes = Product.objects.filter(organization=org, kind='dish', active=True, available_in_pos=True)
        rates = {tax.amount for product in dishes for tax in product.taxes.all()}
        untaxed = any(not product.taxes.exists() for product in dishes)
        regime = 'inc' if rates == {dec(8)} and not untaxed else 'responsable_iva' if rates == {dec(19)} and not untaxed else 'no_responsable' if not rates else ''
        if regime:
            org.fiscal_regime = regime
            org.save(update_fields=['fiscal_regime'])
        else:
            self.skip('régimen', 'catálogo con impuestos mixtos; revisar datos del emisor')
