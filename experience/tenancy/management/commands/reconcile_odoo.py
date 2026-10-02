"""Concilia una organización migrada con su Odoo de origen, registro por registro (plan T6).

Solo lee: Odoo por JSON-RPC y la base propia por el `LegacyMap` que dejó `migrate_from_odoo`. Imprime, por dominio,
cuántos registros hay en cada lado, cuántos coinciden y cada diferencia con su valor de origen y de destino. Sale con
código 1 si hay diferencias sin explicar.

    venv/bin/python manage.py reconcile_odoo --org burger-house --url http://odoo:8069 --db projectapp --login … --password …
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from tenancy.odoo_migration.client import OdooClient, OdooCredentials
from tenancy.models import LegacyMap, Organization

MONEY = Decimal('0.01')


def oid(value):
    return value[0] if isinstance(value, (list, tuple)) and value else value or None


def money(value):
    return Decimal(str(value or 0)).quantize(MONEY)


class Command(BaseCommand):
    help = 'Compara una organización migrada con su Odoo de origen (solo lectura).'

    def add_arguments(self, parser):
        parser.add_argument('--org', required=True)
        for name in ('url', 'db', 'login', 'password'):
            parser.add_argument(f'--{name}', required=True)

    def handle(self, *args, **o):
        self.org = Organization.objects.filter(slug=o['org']).first()
        if not self.org:
            raise CommandError(f'No existe la organización {o["org"]}.')
        self.odoo = OdooClient(OdooCredentials(url=o['url'], db=o['db'], login=o['login'], password=o['password'], pos_config_id=0))
        self.maps = defaultdict(dict)
        for m in LegacyMap.objects.filter(organization=self.org):
            self.maps[m.model][int(m.odoo_id) if str(m.odoo_id).isdigit() else m.odoo_id] = m.local_id
        self.rows = []  # (dominio, origen, destino, coinciden, diferencias)
        self.diffs = []
        for check in (self.products, self.prices, self.recipes, self.stock, self.tables, self.people, self.customers,
                      self.loyalty, self.orders, self.payments, self.shifts, self.photos, self.extras):
            check()
        width = max(len(r[0]) for r in self.rows)
        self.stdout.write(f'{"Dominio".ljust(width)} | Odoo | Propio | Coinciden | Diferencias')
        for name, src, dst, ok, bad in self.rows:
            self.stdout.write(f'{name.ljust(width)} | {src:>4} | {dst:>6} | {ok:>9} | {bad:>11}')
        if self.diffs:
            self.stdout.write('\nDiferencias:')
            for d in self.diffs:
                self.stdout.write(f'  - {d}')
            raise SystemExit(1)
        self.stdout.write('\nSin diferencias.')

    # Utilidades -----------------------------------------------------------------------------------------------------
    def read(self, model, fields, domain=None):
        return self.odoo.call_kw(model, 'search_read', [domain or [], fields], {'context': {'active_test': False}})

    def local(self, model, odoo_id):
        return self.maps[model].get(odoo_id)

    def compare(self, name, pairs, fields):
        """`pairs`: lista de (etiqueta, fila de Odoo o None, objeto local o None). `fields`: (nombre, f_odoo, f_local)."""
        ok = bad = 0
        for label, src, dst in pairs:
            if src is None or dst is None:
                bad += 1
                self.diffs.append(f'{name} · {label}: {"falta en el sistema propio" if dst is None else "sobra en el sistema propio"}')
                continue
            errors = [f'{f}: Odoo={a!r} propio={b!r}' for f, get_a, get_b in fields
                      for a, b in [(get_a(src), get_b(dst))] if a != b]
            if errors:
                bad += 1
                self.diffs.append(f'{name} · {label}: ' + '; '.join(errors))
            else:
                ok += 1
        self.rows.append((name, sum(1 for _, s, _ in pairs if s is not None), sum(1 for _, _, d in pairs if d is not None), ok, bad))

    # Dominios -------------------------------------------------------------------------------------------------------
    def products(self):
        from catalog.models import Product
        rows = self.read('product.template', ['name', 'list_price', 'standard_price', 'active', 'available_in_pos', 'is_ingredient', 'pos_categ_ids', 'taxes_id'],
                         [('company_id', 'in', [False, self.org_company()])])
        cats, taxes = self.maps['pos.category'], self.maps['account.tax']
        pairs = []
        for r in rows:
            local_id = self.local('product.template', r['id'])
            p = Product.objects.filter(pk=local_id, organization=self.org).prefetch_related('categories', 'taxes').first() if local_id else None
            pairs.append((r['name'], r, p))
        mapped = set(int(v) for v in self.maps['product.template'].values())
        for p in Product.objects.filter(organization=self.org).exclude(pk__in=mapped):
            pairs.append((p.name, None, p))
        self.compare('Productos', pairs, [
            ('nombre', lambda r: r['name'], lambda p: p.name),
            ('activo', lambda r: r['active'], lambda p: p.active),
            ('tipo', lambda r: 'ingredient' if r.get('is_ingredient') else 'dish', lambda p: p.kind),
            ('precio', lambda r: money(r['list_price']) if not r.get('is_ingredient') else None, lambda p: money(p.price) if p.kind == 'dish' else None),
            ('costo', lambda r: money(r['standard_price']) if r.get('is_ingredient') else None, lambda p: money(p.cost) if p.kind == 'ingredient' else None),
            ('en la carta', lambda r: r['available_in_pos'] if not r.get('is_ingredient') else None, lambda p: p.available_in_pos if p.kind == 'dish' else None),
            ('categorías', lambda r: sorted(int(cats[c]) for c in r['pos_categ_ids'] if c in cats), lambda p: sorted(c.pk for c in p.categories.all())),
            ('impuestos', lambda r: sorted(int(taxes[t]) for t in r['taxes_id'] if t in taxes) if not r.get('is_ingredient') else None,
             lambda p: sorted(t.pk for t in p.taxes.all()) if p.kind == 'dish' else None),
        ])

    def org_company(self):
        if not hasattr(self, '_company'):
            src = getattr(self.org, 'legacysource', None) or __import__('tenancy.models', fromlist=['LegacySource']).LegacySource.objects.filter(organization=self.org).first()
            self._company = src.company_id if src else self.read('res.company', ['id'])[0]['id']
        return self._company

    def prices(self):
        from catalog.models import RestaurantPrice
        pairs = []
        for config_id, rest_id in self.maps['pos.config'].items():
            tmpl = list(self.maps['product.template'].keys())
            odoo = self.odoo.call_kw('pos.config', 'waiter_catalog_prices', [[config_id], tmpl]) or {}
            odoo = {int(k): money(v) for k, v in odoo.items()}
            local = {int(self.inverse('product.template', p.product_id)): money(p.price) for p in RestaurantPrice.objects.filter(restaurant_id=rest_id)}
            for t in sorted(set(odoo) | set(local)):
                pairs.append((f'sede {config_id} · producto {t}', odoo.get(t) is not None and {'v': odoo[t]} or None, local.get(t) is not None and {'v': local[t]} or None))
        self.compare('Precios por sede', pairs, [('precio', lambda r: r['v'], lambda p: p['v'])])

    def inverse(self, model, local_id):
        if not hasattr(self, '_inv'):
            self._inv = defaultdict(dict)
            for m, ids in self.maps.items():
                for k, v in ids.items():
                    self._inv[m][str(v)] = k
        return self._inv[model].get(str(local_id))

    def recipes(self):
        from catalog.models import Recipe
        boms = self.read('mrp.bom', ['product_tmpl_id', 'product_qty', 'bom_line_ids', 'active'])
        lines = {l['id']: l for l in self.read('mrp.bom.line', ['product_id', 'product_qty', 'product_uom_id'])}
        variants = {v['id']: v['product_tmpl_id'][0] for v in self.read('product.product', ['product_tmpl_id'], [('id', 'in', [oid(l['product_id']) for l in lines.values()])])}
        pairs = []
        for b in boms:
            local_id = self.local('mrp.bom', b['id'])
            rec = Recipe.objects.filter(pk=local_id).prefetch_related('lines').first() if local_id else None
            pairs.append((f'receta de {b["product_tmpl_id"][1]}', b, rec))
        self.compare('Recetas', pairs, [
            ('plato', lambda b: int(self.local('product.template', b['product_tmpl_id'][0]) or 0), lambda r: r.product_id),
            ('rinde', lambda b: Decimal(str(b['product_qty'])).normalize(), lambda r: r.yield_qty.normalize()),
            ('ingredientes', lambda b: sorted(int(self.local('product.template', variants[oid(lines[i]['product_id'])]) or 0) for i in b['bom_line_ids']),
             lambda r: sorted(l.ingredient_id for l in r.lines.all())),
            ('cantidades', lambda b: sorted(Decimal(str(lines[i]['product_qty'])).normalize() for i in b['bom_line_ids']),
             lambda r: sorted(l.qty.normalize() for l in r.lines.all())),
        ])

    def stock(self):
        # Por las cantidades de la bodega de cada sede (pos.config.warehouse_id), sumando sus ubicaciones internas: el
        # contexto «warehouse» de qty_available no filtra en Odoo 19 y devolvía lo de toda la empresa.
        from inventory.models import Stock
        pairs = []
        ingredients = {t['product_variant_id'][0]: t for t in self.read('product.template', ['name', 'is_ingredient', 'product_variant_id']) if t.get('is_ingredient') and t.get('product_variant_id')}
        warehouses = {w['id']: oid(w['lot_stock_id']) for w in self.read('stock.warehouse', ['lot_stock_id'])}
        for c in self.read('pos.config', ['warehouse_id']):
            rest, location = self.local('pos.config', c['id']), warehouses.get(oid(c['warehouse_id']))
            if not rest or not location:
                continue
            qty = defaultdict(Decimal)
            for q in self.read('stock.quant', ['product_id', 'quantity'], [('location_id', 'child_of', location), ('product_id', 'in', list(ingredients))]):
                qty[oid(q['product_id'])] += Decimal(str(q['quantity']))
            for variant, t in ingredients.items():
                local = Stock.objects.filter(restaurant_id=rest, ingredient_id=self.local('product.template', t['id'])).first()
                pairs.append((f'{t["name"]} en sede {c["id"]}', {'q': qty[variant].quantize(Decimal('0.001'))}, local))
        self.compare('Existencias', pairs, [('cantidad', lambda r: r['q'], lambda s: s.qty.quantize(Decimal('0.001')))])

    def tables(self):
        from tables.models import Table
        rows = self.read('restaurant.table', ['table_number', 'seats', 'floor_id', 'active'], [('floor_id.pos_config_ids', '!=', False)])
        pairs = [(f'mesa {r["table_number"]} ({r["floor_id"][1]})', r, Table.objects.filter(pk=self.local('restaurant.table', r['id'])).first()) for r in rows]
        self.compare('Mesas', pairs, [('número', lambda r: r['table_number'], lambda t: t.number), ('puestos', lambda r: r['seats'], lambda t: t.seats),
                                      ('activa', lambda r: r['active'], lambda t: t.active)])

    def people(self):
        from accounts.models import Account
        rows = self.read('hr.employee', ['name', 'waiter_role', 'waiter_config_ids', 'shift_start', 'shift_end', 'active'])
        pairs = [(r['name'], r, Account.objects.filter(pk=self.local('hr.employee', r['id'])).prefetch_related('restaurants').first()) for r in rows]
        same = lambda a, b: None if a == b else (a, b)  # noqa: E731
        self.compare('Personas', pairs, [
            ('nombre', lambda r: r['name'], lambda a: a.name),
            ('sedes', lambda r: sorted(int(self.local('pos.config', c)) for c in r['waiter_config_ids'] if self.local('pos.config', c)) if r.get('waiter_role') != 'owner' else [],
             lambda a: sorted(x.pk for x in a.restaurants.all())),
            ('turno', lambda r: (r['shift_start'], r['shift_end']) if r['shift_start'] != r['shift_end'] else None,
             lambda a: (float(a.shift_start), float(a.shift_end)) if a.shift_start is not None else None),
            ('activa', lambda r: r['active'], lambda a: a.active),
        ])
        del same

    def customers(self):
        from loyalty.models import Customer
        ids = list(self.maps['res.partner'].keys())
        rows = self.read('res.partner', ['name', 'vat', 'phone', 'email'], [('id', 'in', ids)])
        pairs = [(r['name'], r, Customer.objects.filter(pk=self.local('res.partner', r['id'])).first()) for r in rows]
        clean = lambda v: (v or '').strip()  # noqa: E731
        self.compare('Clientes', pairs, [('nombre', lambda r: r['name'], lambda c: c.name), ('documento', lambda r: clean(r['vat']), lambda c: c.vat),
                                         ('teléfono', lambda r: clean(r['phone']), lambda c: c.phone), ('correo', lambda r: clean(r['email']).lower(), lambda c: (c.email or '').lower())])

    def loyalty(self):
        from loyalty.models import LoyaltyCard
        rows = self.read('loyalty.card', ['code', 'points', 'partner_id'])
        pairs = [(f'tarjeta {r["code"]}', r, LoyaltyCard.objects.filter(pk=self.local('loyalty.card', r['id'])).first()) for r in rows]
        self.compare('Tarjetas de puntos', pairs, [('puntos', lambda r: Decimal(str(r['points'])).quantize(MONEY), lambda c: Decimal(str(c.points)).quantize(MONEY)),
                                                   ('cliente', lambda r: int(self.local('res.partner', oid(r['partner_id'])) or 0), lambda c: c.customer_id)])

    def orders(self):
        from sales.models import Order
        rows = self.read('pos.order', ['pos_reference', 'amount_total', 'amount_tax', 'state', 'lines', 'config_id'], [('state', 'in', ['paid', 'done', 'invoiced'])])
        pairs = [(r['pos_reference'], r, Order.objects.filter(pk=self.local('pos.order', r['id'])).prefetch_related('lines', 'payments').first()) for r in rows]
        self.compare('Pedidos pagados', pairs, [
            ('total', lambda r: money(r['amount_total']), lambda o: money(o.total)),
            ('impuesto', lambda r: money(r['amount_tax']), lambda o: money(o.tax)),
            ('sede', lambda r: int(self.local('pos.config', oid(r['config_id'])) or 0), lambda o: o.restaurant_id),
            ('pagado', lambda r: True, lambda o: o.state == 'paid'),
        ])
        total_odoo = sum(money(r['amount_total']) for r in rows)
        total_local = sum((money(o.total) for o in Order.objects.filter(organization=self.org, state='paid', pk__in=[int(v) for v in self.maps['pos.order'].values()])), Decimal(0))
        self.rows.append(('Suma de ventas migradas', int(total_odoo), int(total_local), int(total_odoo == total_local), int(total_odoo != total_local)))
        if total_odoo != total_local:
            self.diffs.append(f'Suma de ventas: Odoo={total_odoo} propio={total_local}')

    def payments(self):
        # Odoo guarda el cambio como un pago negativo en efectivo; el sistema propio lo guarda en el pedido. Se concilia lo
        # neto cobrado por pedido y método.
        from sales.models import Order
        rows = self.read('pos.payment', ['amount', 'payment_method_id', 'pos_order_id'], [('pos_order_id.state', 'in', ['paid', 'done', 'invoiced'])])
        net = defaultdict(lambda: defaultdict(Decimal))
        for r in rows:
            net[oid(r['pos_order_id'])][int(self.local('pos.payment.method', oid(r['payment_method_id'])) or 0)] += money(r['amount'])
        # Cuando Odoo no registró el cambio como pago negativo, lo dejó en amount_return: se resta del primer método.
        orders = {r['id']: r for r in self.read('pos.order', ['amount_return'], [('id', 'in', list(net))])}
        for order_id, by_method in net.items():
            if not any(v < 0 for v in by_method.values()) and money(orders.get(order_id, {}).get('amount_return')):
                first = next(iter(by_method))
                by_method[first] -= money(orders[order_id]['amount_return'])
        pairs = []
        for odoo_order, by_method in net.items():
            o = Order.objects.filter(pk=self.local('pos.order', odoo_order)).prefetch_related('payments').first()
            local = None
            if o:
                local = defaultdict(Decimal)
                for p in o.payments.all():
                    local[p.method_id] += money(p.amount)
                cash = [m for m in local if o.payments.filter(method_id=m, method__type='cash').exists()]
                if cash and o.change:
                    local[cash[0]] -= money(o.change)
                local = {k: v for k, v in local.items() if v}
            pairs.append((f'pagos del pedido {odoo_order}', {k: v for k, v in by_method.items() if v}, local))
        self.compare('Pagos (neto por método)', pairs, [('neto', lambda a: dict(sorted(a.items())), lambda b: dict(sorted(b.items())))])

    def shifts(self):
        from sales.models import CashShift
        rows = self.read('pos.session', ['name', 'state', 'cash_register_balance_start', 'cash_register_balance_end', 'cash_register_balance_end_real', 'closing_notes'], [('state', '=', 'closed')])
        pairs = [(r['name'], r, CashShift.objects.filter(pk=self.local('pos.session', r['id'])).first()) for r in rows]
        self.compare('Cuadres de caja', pairs, [
            ('apertura', lambda r: money(r['cash_register_balance_start']), lambda s: money(s.opening_cash)),
            ('esperado', lambda r: money(r['cash_register_balance_end']), lambda s: money(s.expected_cash)),
            ('contado', lambda r: money(r['cash_register_balance_end_real']), lambda s: money(s.counted_cash)),
            ('nota', lambda r: (r['closing_notes'] or '').strip(), lambda s: (s.closing_notes or '').strip()),
        ])

    def photos(self):
        from catalog.models import Product, ProductPhoto
        rows = self.read('projectapp.product.photo', ['product_tmpl_id', 'sequence'])
        pairs = [(f'foto {r["id"]}', r, ProductPhoto.objects.filter(pk=self.local('projectapp.product.photo', r['id'])).first()) for r in rows]
        self.compare('Galería', pairs, [('producto', lambda r: int(self.local('product.template', oid(r['product_tmpl_id'])) or 0), lambda p: p.product_id)])
        with_image = [t for t in self.read('product.template', ['image_128']) if t.get('image_128')]
        main = [(f'foto principal de {t["id"]}', t, Product.objects.filter(pk=self.local('product.template', t['id'])).first()) for t in with_image]
        self.compare('Foto principal', main, [('tiene foto', lambda t: True, lambda p: bool(p.image))])

    def extras(self):
        """Dominios pequeños: categorías, impuestos, proveedores, métodos de pago, cupones, acciones, ajustes y avisos."""
        from catalog.models import Category, Supplier, Tax
        from loyalty.models import BenefitAction, Coupon
        from notifications.models import Notification
        from sales.models import PaymentMethod, RestaurantSettings
        simple = lambda m, odoo_model, fields, domain, label, checks: self.compare(m, [  # noqa: E731
            (label(r), r, odoo_model[1].objects.filter(pk=self.local(odoo_model[0], r['id'])).first()) for r in self.read(odoo_model[0], fields, domain)], checks)
        simple('Categorías', ('pos.category', Category), ['name', 'kitchen_station'], [], lambda r: r['name'],
               [('nombre', lambda r: r['name'], lambda c: c.name), ('estación', lambda r: r.get('kitchen_station') or '', lambda c: c.station or '')])
        mapped_taxes = list(self.maps['account.tax'])
        simple('Impuestos de venta', ('account.tax', Tax), ['name', 'amount', 'price_include'], [('id', 'in', mapped_taxes)], lambda r: r['name'],
               [('tarifa', lambda r: Decimal(str(r['amount'])).normalize(), lambda t: t.amount.normalize()), ('incluido', lambda r: r['price_include'], lambda t: t.included)])
        suppliers = [int(k) for k in self.maps['res.partner.supplier']]
        self.compare('Proveedores', [(r['name'], r, Supplier.objects.filter(pk=self.local('res.partner.supplier', r['id'])).first())
                     for r in self.read('res.partner', ['name'], [('id', 'in', suppliers)])], [('nombre', lambda r: r['name'], lambda x: x.name)])
        self.compare('Métodos de pago', [(r['name'], r, PaymentMethod.objects.filter(pk=self.local('pos.payment.method', r['id'])).first())
                     for r in self.read('pos.payment.method', ['name', 'is_cash_count'], [('id', 'in', list(self.maps['pos.payment.method']))])],
                     [('efectivo', lambda r: r['is_cash_count'], lambda m: m.type == 'cash')])
        coupons = [int(k) for k in self.maps['loyalty.program.coupon']]
        self.compare('Cupones', [(r['name'], r, Coupon.objects.filter(pk=self.local('loyalty.program.coupon', r['id'])).first())
                     for r in self.read('loyalty.program', ['name', 'active'], [('id', 'in', coupons)])],
                     [('activo', lambda r: r['active'], lambda c: c.active)])
        self.compare('Acciones con premio', [(r['action'], r, BenefitAction.objects.filter(pk=self.local('waiter.benefit.action', r['id'])).first())
                     for r in self.read('waiter.benefit.action', ['action', 'active', 'reward'])],
                     [('activa', lambda r: r['active'], lambda a: a.active), ('premio', lambda r: r['reward'], lambda a: a.reward)])
        fields = ['alert_late_minutes', 'alert_bill_minutes', 'roi_hour_cost', 'roi_minutes_per_order', 'roi_baseline_hours_per_100', 'roi_monthly_cost']
        self.compare('Ajustes de sede', [(r['name'], r, RestaurantSettings.objects.filter(restaurant_id=self.local('pos.config', r['id'])).first())
                     for r in self.read('pos.config', ['name', *fields])],
                     [(f, (lambda f: lambda r: Decimal(str(r[f])).quantize(MONEY))(f), (lambda f: lambda x: Decimal(str(getattr(x, f))).quantize(MONEY))(f)) for f in fields])
        unread = self.read('waiter.notification', ['title'], [('read', '=', False)])
        self.compare('Avisos sin leer', [(r['title'][:40], r, Notification.objects.filter(pk=self.local('waiter.notification', r['id'])).first()) for r in unread],
                     [('título', lambda r: r['title'], lambda n: n.title)])
