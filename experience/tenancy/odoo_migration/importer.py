"""Orquestación transaccional de los dominios del contrato T6."""


def hex_color(value):
    """Odoo guarda el color de la mesa como «rgb(53,211,116)» o «#35D374»; el plano propio usa #RRGGBB o vacío."""
    if not value:
        return ''
    text = str(value).strip()
    if re.fullmatch(r'#[0-9a-fA-F]{6}', text):
        return text.upper()
    m = re.fullmatch(r'rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)', text)
    return '#%02X%02X%02X' % tuple(min(255, int(c)) for c in m.groups()) if m else ''


def snap(value, cell=20):
    """Lleva una medida de Odoo a la cuadrícula del plano propio (el mismo redondeo del editor del POS)."""
    return int(round(float(value or 0) / cell) * cell)

from decimal import Decimal
import re
import hashlib
from datetime import date
from zoneinfo import ZoneInfo

from django.core.management.base import CommandError
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import Account, default_notify_prefs
from accounts.services import invitation, suggested_username
from billing.company import save_brand
from catalog.services import valid
from loyalty.models import Customer, LoyaltyCard, Coupon, BenefitAction
from loyalty.promotions import save_benefits, save_banners
from notifications.models import Notification
from reservations.models import Reservation, ReservationLine, ReservationSchedule
from reservations.schedule import clean_schedule
from sales.models import PaymentMethod, RestaurantSettings
from tables.models import Floor, Table
from tables.services import save_plan, assignments
from tenancy.models import LegacySource, Organization, Restaurant
from .base import ImportBase, oid, parsed, stamp, dec, fingerprint
from .catalog import CatalogImport
from .history import HistoryImport
from .remap import remap_diner


class Migrator(ImportBase, CatalogImport, HistoryImport):
    @transaction.atomic
    def run(self, *, url, database, company_id=None, remap=False):
        # Serializa la importación con las escrituras operativas de esta organización.
        Organization.objects.filter(pk=self.org.pk).update(name=F('name'))
        self.reload_maps()
        companies = list(self.read('res.company', 'name vat street city phone email brand_color brand_font brand_radius '
            'brand_tagline brand_greeting brand_waiter_name brand_welcome brand_logo waiter_cash_tolerance waiter_menu_banners '
            'waiter_banners_configured l10n_co_verification_code', [('id', '=', company_id)] if company_id else []))
        if len(companies) != 1:
            raise CommandError('Selecciona una única compañía con --company-id; no se mezclarán compañías de Odoo.')
        company = companies[0]
        self.company = company['id']
        self.context = {'allowed_company_ids': [self.company], 'force_company': self.company}
        source, created = LegacySource.objects.get_or_create(organization=self.org,
            defaults={'url': url.rstrip('/'), 'database': database, 'company_id': self.company})
        if not created and (source.url, source.database, source.company_id) != (url.rstrip('/'), database, self.company):
            raise CommandError('Esta organización ya está vinculada a otro origen Odoo.')
        self.org.name = company['name']
        self.org.legal_name = company['name']
        for dest, src in [('tax_id', 'vat'), ('address', 'street'), ('city', 'city'), ('phone', 'phone'), ('email', 'email')]:
            setattr(self.org, dest, company.get(src) or '')
        nit, _, dv = self.org.tax_id.partition('-')
        self.org.tax_id = nit
        self.org.tax_id_dv = str(company.get('l10n_co_verification_code') or dv)
        self.org.cash_tolerance = dec(company.get('waiter_cash_tolerance'))
        self.org.full_clean(exclude=['brand_logo'])
        self.org.save()
        brand = {key: company['brand_' + key] for key in ('color', 'font', 'radius', 'tagline', 'greeting', 'waiter_name', 'welcome', 'logo') if company.get('brand_' + key)}
        save_brand(self.org, brand)
        self.org.refresh_from_db()
        self.counted('organización y marca', getattr(self, 'org_created', False))
        self.configs = list(self.read('pos.config', 'name waiter_slug waiter_street waiter_city waiter_phone waiter_latitude waiter_longitude '
            'active waiter_access_margin_minutes reservation_schedule reservation_open reservation_close picking_type_id warehouse_id '
            'alert_late_minutes alert_bill_minutes roi_hour_cost roi_minutes_per_order roi_baseline_hours_per_100 roi_monthly_cost '
            'roi_start_date waiter_kitchen_prepay_roles payment_method_ids floor_ids tip_product_id', [('company_id', '=', self.company)]))
        valid(bool(self.configs), 'La compañía no tiene restaurantes.')
        for r in self.configs:
            slug = r.get('waiter_slug') or slugify(r['name'])
            rest = self.upsert('pos.config', r, Restaurant, dict(organization=self.org, name=r['name'], slug=slug,
                legacy_odoo_config_id=r['id'], street=r.get('waiter_street') or '', city=r.get('waiter_city') or '',
                phone=r.get('waiter_phone') or '', active=r.get('active', True),
                latitude=float(r['waiter_latitude']) if r.get('waiter_latitude') else None,
                longitude=float(r['waiter_longitude']) if r.get('waiter_longitude') else None,
                access_margin_minutes=r.get('waiter_access_margin_minutes', 30)),
                match={'organization': self.org, 'legacy_odoo_config_id': r['id']} if Restaurant.objects.filter(organization=self.org, legacy_odoo_config_id=r['id']).exists() else {'organization': self.org, 'slug': slug})
            settings = {f: r[f] for f in ('alert_late_minutes', 'alert_bill_minutes', 'roi_hour_cost', 'roi_minutes_per_order',
                'roi_baseline_hours_per_100', 'roi_monthly_cost', 'roi_start_date') if r.get(f) is not False and f in r}
            # Odoo guarda los supuestos como flotantes (18.400000000000002): el sistema propio usa dos decimales.
            settings = {k: (Decimal(str(round(v, 2))) if isinstance(v, float) else v) for k, v in settings.items()}
            settings['kitchen_prepay_roles'] = parsed(r.get('waiter_kitchen_prepay_roles'), [])
            self.upsert('pos.config.settings', r, RestaurantSettings, dict(restaurant=rest, **settings), match={'restaurant': rest})
            schedule = parsed(r.get('reservation_schedule'), {}) or {'weekly': {str(i): [[r.get('reservation_open', 10), r.get('reservation_close', 22)]] for i in range(7)}}
            self.upsert('pos.config.schedule', r, ReservationSchedule, dict(restaurant=rest, **clean_schedule(schedule)), match={'restaurant': rest})
        from sales.policy import validate_policy
        policies = {r['key']: parsed(r['value'], {}) for r in self.read('ir.config_parameter', 'key value',
            [('key', 'in', ['waiter.role_permissions', *[f"waiter.role_permissions.{c['id']}" for c in self.configs]])])}
        candidates = [policies.get('waiter.role_permissions') or policies.get(f"waiter.role_permissions.{c['id']}") for c in self.configs]
        candidates = [validate_policy(p) for p in candidates if p]
        valid(not candidates or all(p == candidates[0] for p in candidates), 'Las sedes tienen políticas de roles distintas; unifícalas antes de migrar.')
        if candidates:
            self.org.role_policy = candidates[0]
            self.org.save(update_fields=['role_policy'])
        self.org.max_restaurants = max(self.org.max_restaurants, len(self.configs))
        self.org.save(update_fields=['max_restaurants'])
        if not self.org.fiscal_responsibilities:
            self.skip('datos fiscales', 'Odoo no expone responsabilidades RUT en el contrato anterior; revisar el emisor')
        self.people()
        self.catalog()
        self.floors()
        self.benefits(company)
        self.history()
        self.reservations()
        self.notifications()
        if remap:
            remap_diner(self)
        return self.report

    def people(self):
        users = {r['id']: r for r in self.read('res.users', 'name login email active waiter_role waiter_config_ids waiter_notify', [('company_ids', 'in', [self.company])])}
        employees = list(self.read('hr.employee', 'name work_email user_id active waiter_role waiter_config_ids shift_start shift_end', [('company_id', '=', self.company)]))
        pairs = [(e, users.get(oid(e.get('user_id')), {})) for e in employees]
        linked = {u['id'] for e, u in pairs if u}
        pairs += [({}, u) for u in users.values() if u['id'] not in linked and (u.get('waiter_role') == 'owner' or u.get('waiter_config_ids'))]
        seen_users = set()
        for e, u in pairs:
            model, r = ('hr.employee', e) if e else ('res.users', u)
            if u:
                valid(u['id'] not in seen_users, 'Un usuario está enlazado a varios empleados; resuelve la identidad antes de importar.')
                seen_users.add(u['id'])
            roles = ('waiter', 'cashier', 'admin', 'owner')
            source_roles = [role for role in (e.get('waiter_role'), u.get('waiter_role')) if role]
            valid(all(role in roles for role in source_roles), 'Rol de origen desconocido.')
            role = min(source_roles, key=roles.index) if source_roles else 'waiter'
            ids = u.get('waiter_config_ids') or e.get('waiter_config_ids') or []
            ids = [i for i in ids if self.mapping('pos.config', i)]
            if role == 'owner':
                ids = []
            valid((role == 'owner' and not ids) or (role == 'admin' and ids) or (role in ('cashier', 'waiter') and len(ids) == 1),
                f"Asignación de restaurantes incompatible con el rol de {r['name']}.")
            old = self.mapping(model, r['id'])
            person = self.ref(model, r['id']) if old else None
            if person is None:
                legacy = Q(legacy_odoo_employee_id=e['id']) if e else Q(pk__in=[])
                if u:
                    legacy |= Q(legacy_odoo_user_id=u['id'])
                existing = list(Account.objects.filter(legacy, organization=self.org))
                valid(len(existing) <= 1, 'Los ids del usuario y empleado apuntan a cuentas locales distintas.')
                person = existing[0] if existing else None
            values = dict(organization=self.org, name=r['name'], role=role, active=r.get('active', True),
                email=(u.get('email') or e.get('work_email') or '').strip().lower() or None,
                legacy_odoo_employee_id=e.get('id'), legacy_odoo_user_id=u.get('id'),
                shift_start=e.get('shift_start') if e.get('shift_start') != e.get('shift_end') else None,
                shift_end=e.get('shift_end') if e.get('shift_start') != e.get('shift_end') else None)
            prefs = {**default_notify_prefs(), **parsed(u.get('waiter_notify'), {})}
            valid(set(prefs) == set(default_notify_prefs()) and all(type(v) is bool for v in prefs.values()), 'Preferencias de avisos inválidas.')
            values['notify_prefs'] = prefs
            for key in ('shift_start', 'shift_end'):
                valid(values[key] is None or 0 <= values[key] <= 24, 'Turno fuera de rango.')
            if not person:
                login = (u.get('login') or '').lower()
                values['username'] = login if re.fullmatch(r'[a-z0-9.]{3,32}', login) else suggested_username(r['name'], Account.objects.filter(organization=self.org))
            person = self.upsert(model, r, Account, values, match={'pk': person.pk, 'organization': self.org} if person else None)
            person.restaurants.set([self.ref('pos.config', i) for i in ids])
            if u:
                self.remember('res.users', u['id'], person)
            if not self.no_invite and person.email and not person.activated and not person.invite_sent_at:
                # El envío solo ocurre tras confirmar toda la importación.
                def send(pk=person.pk):
                    if invitation(Account.objects.get(pk=pk)):
                        self.counted('invitaciones', True)
                    else:
                        self.skip('invitaciones', 'correo no enviado; se puede reintentar')
                transaction.on_commit(send)
            else:
                self.skip('invitaciones', '--no-invite' if self.no_invite else 'sin correo o cuenta ya invitada/activada')

    def floors(self):
        config_ids = [r['id'] for r in self.configs]
        rows = list(self.read('restaurant.floor', 'name sequence active pos_config_ids waiter_plan waiter_zone_staff floor_background_image', [('pos_config_ids', 'in', config_ids)]))
        tables = list(self.read('restaurant.table', 'floor_id table_number name seats position_h position_v width height shape color active waiter_zone', [('floor_id', 'in', [r['id'] for r in rows])]))
        attachment_ids = [i['attachmentId'] for r in rows for i in parsed(r.get('waiter_plan'), {}).get('images', [])]
        attachments = {a['id']: a for a in self.read('ir.attachment', 'res_model res_id datas', [('id', 'in', attachment_ids)])} if attachment_ids else {}
        used_tokens = set()
        for r in rows:
            configs = [i for i in r.get('pos_config_ids', []) if i in config_ids]
            valid(len(configs) == 1, 'Un piso compartido por varios restaurantes requiere separarse antes de migrar.')
            restaurant = self.ref('pos.config', configs[0])
            seed = Floor.objects.filter(restaurant=restaurant, revision=0, tables__isnull=True).first() if restaurant.pk in self.new_restaurants else None
            floor = self.upsert('restaurant.floor', r, Floor, dict(restaurant=restaurant, name=r['name'],
                sequence=r.get('sequence', 0), active=r.get('active', True)), match={'pk': seed.pk} if seed else None)
            local_tables = []
            source_tables = [t for t in tables if oid(t['floor_id']) == r['id']]
            for t in source_tables:
                old = self.mapping('restaurant.table', t['id'])
                local_tables.append(dict(id=int(old.local_id) if old else None, key=str(t['id']), number=int(t.get('table_number') or t.get('name')),
                    # El sistema propio guarda las mesas en la cuadrícula de 20 px, como las deja el editor del POS.
                    seats=t.get('seats', 4), x=snap(t.get('position_h', 20)), y=snap(t.get('position_v', 20)), width=max(20, snap(t.get('width', 80))),
                    height=max(20, snap(t.get('height', 80))), shape=t.get('shape', 'square'), color=hex_color(t.get('color')), zone=t.get('waiter_zone') or ''))
            plan = parsed(r.get('waiter_plan'), {})
            raw = {key: plan.get(key, []) for key in ('walls', 'zones', 'decor', 'images')}
            raw.update(name=floor.name, revision=floor.revision, tables=local_tables, background_size=plan.get('backgroundSize'))
            for item in raw['images']:
                attachment = attachments.get(item.pop('attachmentId'))
                valid(attachment and attachment['res_model'] == 'restaurant.floor' and attachment['res_id'] == r['id'], 'Adjunto del plano ajeno al piso.')
                item['data'] = attachment['datas']
            if r.get('floor_background_image'):
                raw['background'] = r['floor_background_image']
            plan_marker = self.mapping('restaurant.floor.plan', r['id'])
            # Los ids locales y la revisión cambian al primer guardado: la huella usa el origen.
            plan_hash = {'floor': r, 'tables': source_tables, 'attachments': attachments}
            if not plan_marker or plan_marker.fingerprint != fingerprint(plan_hash):
                save_plan(floor, raw)
                self.remember('restaurant.floor.plan', r['id'], floor, plan_hash)
            for t, item in zip(source_tables, local_tables):
                table = floor.tables.get(number=item['number'])
                matches = [(i, v) for i, v in enumerate(self.tokens) if v['venue'] == floor.restaurant.slug and v['odoo_table_id'] == t['id']]
                valid(len(matches) <= 1, 'Hay varios tokens del registro para la misma mesa.')
                if matches:
                    i, token = matches[0]
                    valid(token['table_number'] == table.number, 'El número de mesa no coincide con el token del registro.')
                    table.token = token['token']
                    used_tokens.add(i)
                table.shape = t.get('shape') or 'square'
                table.color = hex_color(t.get('color'))
                table.active = t.get('active', True)
                table.full_clean()
                table.save()
                existed = bool(self.mapping('restaurant.table', t['id']))
                self.remember('restaurant.table', t['id'], table, t)
                self.counted('restaurant.table', not existed)
            staff = parsed(r.get('waiter_zone_staff'), {})
            floor.zone_staff = assignments(floor, {z: [self.ref('hr.employee', i).pk for i in ids] for z, ids in staff.items()})
            floor.save(update_fields=['zone_staff'])
        valid(len(used_tokens) == len(self.tokens), 'Hay tokens del registro que no corresponden a mesas de esta organización.')

    def benefits(self, company):
        org = self.org
        for r in self.read('pos.payment.method', 'name is_cash_count split_transactions active', [('id', 'in', list({i for c in self.configs for i in c.get('payment_method_ids', [])}))]):
            kind = 'cash' if r.get('is_cash_count') else 'pay_later' if r.get('split_transactions') else 'bank'
            restaurants = [self.ref('pos.config', c['id']) for c in self.configs if r['id'] in c.get('payment_method_ids', [])]
            mapped = [int(m.local_id) for (model, _), m in self.maps.items() if model == 'pos.payment.method']
            seeds = PaymentMethod.objects.filter(organization=org, name=r['name'], type=kind, payments__isnull=True).exclude(pk__in=mapped)
            if kind == 'cash' and len(restaurants) == 1 and restaurants[0].pk in self.new_restaurants:
                seed = seeds.filter(restaurants=restaurants[0]).first()
            elif kind == 'bank' and r['name'] in ('Datáfono', 'QR', 'Pago en línea'):
                seed = seeds.filter(restaurants__isnull=True).first()
            else:
                seed = None
            method = self.upsert('pos.payment.method', r, PaymentMethod, dict(organization=org, name=r['name'], type=kind,
                active=r.get('active', True)), match={'pk': seed.pk, 'organization': org} if seed else None)
            method.restaurants.set(restaurants)
        for r in self.read('res.partner', 'name phone email vat street city active waiter_diner_key l10n_latam_identification_type_id', ['|', ('company_id', '=', False), ('company_id', '=', self.company)]):
            identification = r.get('l10n_latam_identification_type_id')
            label = identification[1] if isinstance(identification, list) else ''
            types = {'CC': 'CC', 'Cédula de ciudadanía': 'CC', 'CE': 'CE', 'Cédula de extranjería': 'CE', 'NIT': 'NIT', 'PAS': 'PAS', 'Pasaporte': 'PAS', 'TI': 'TI', 'Tarjeta de identidad': 'TI', 'PEP': 'PEP',
                     # Nombres de l10n_latam en Odoo: «VAT» es el NIT colombiano y «Cédula» la de ciudadanía.
                     'VAT': 'NIT', 'Cédula': 'CC', 'Passport': 'PAS', 'Foreign ID': 'CE', 'Tarjeta de Identidad': 'TI', 'Cédula de Extranjería': 'CE', 'Cédula de Ciudadanía': 'CC'}
            valid(not label or label in types, f'Tipo de documento no reconocido: {label}.')
            self.upsert('res.partner', r, Customer, dict(organization=org, name=r['name'], phone=r.get('phone') or '', email=r.get('email') or '',
                id_type=types.get(label, 'CC'), vat=r.get('vat') or '', street=r.get('street') or '', city=r.get('city') or '', active=r.get('active', True), diner_key=r.get('waiter_diner_key') or None),
                match={'organization': org, 'vat': '222222222222'} if r.get('vat') == '222222222222' else None)
        for r in self.read('loyalty.card', 'partner_id code points expiration_date program_id', [('company_id', '=', self.company)]):
            if not r.get('partner_id'):
                self.skip('loyalty.card', 'tarjeta sin cliente')
                continue
            code = r['code']
            if len(code) > 8:
                attempt = 0
                previous = self.mapping('loyalty.card', r['id'])
                while True:
                    code = hashlib.sha256(f'{org.pk}:{r["id"]}:{r["code"]}:{attempt}'.encode()).hexdigest()[:8].upper()
                    conflict = LoyaltyCard.objects.filter(organization=org, code=code)
                    if previous:
                        conflict = conflict.exclude(pk=previous.local_id)
                    if not conflict.exists():
                        break
                    attempt += 1
                self.counted('códigos de tarjeta adaptados a 8 caracteres', not previous)
            self.upsert('loyalty.card', r, LoyaltyCard, dict(organization=org, customer=self.ref('res.partner', r['partner_id']),
                code=code, points=dec(r['points']), expires=r.get('expiration_date') or None))
        settings = self.client.call_kw('pos.config', 'waiter_benefits_settings', [[self.configs[0]['id']]], {'context': self.context})
        for r in settings.get('coupons', []):
            data = {k: v for k, v in r.items() if k != 'id'}
            data['configs'] = [self.ref('pos.config', i).pk for i in data.get('configs', [])]
            if self.mapping('loyalty.program.coupon', r['id']):
                data['id'] = self.ref('loyalty.program.coupon', r['id']).pk
            save_benefits(org, {'coupon': data})
            self.counted('cupones', not self.mapping('loyalty.program.coupon', r['id']))
            self.remember('loyalty.program.coupon', r['id'], Coupon.objects.get(organization=org, code=data['code']))
        if settings.get('loyalty'):
            save_benefits(org, {'loyalty': {**settings['loyalty'], 'active': True}})
            from loyalty.models import LoyaltyProgram
            self.counted('programa de puntos', not self.mapping('loyalty.program.settings', self.company))
            self.remember('loyalty.program.settings', self.company, LoyaltyProgram.objects.get(organization=org))
        for r in self.read('waiter.benefit.action', 'action active reward percent coupon_id points pos_config_ids', [('company_id', '=', self.company)]):
            data = {k: r[k] for k in ('action', 'active', 'reward', 'percent', 'points')}
            data.update(couponId=self.ref('loyalty.program.coupon', r.get('coupon_id')).pk if r.get('coupon_id') else None,
                configs=[self.ref('pos.config', i).pk for i in r.get('pos_config_ids', [])])
            save_benefits(org, {'action': data})
            self.counted('acciones', not self.mapping('waiter.benefit.action', r['id']))
            self.remember('waiter.benefit.action', r['id'], BenefitAction.objects.get(organization=org, action=r['action']))
        banners = parsed(company.get('waiter_menu_banners'), [])
        for banner in banners:
            if banner.get('target') in ('product', 'category') and banner.get('targetId'):
                banner['targetId'] = self.ref('product.product' if banner['target'] == 'product' else 'pos.category', banner['targetId']).pk
            banner['configs'] = [self.ref('pos.config', i).pk for i in banner.get('configs', [])]
        if company.get('waiter_banners_configured') or banners:
            previous = self.mapping('res.company.banners', self.company)
            if not previous or previous.fingerprint != fingerprint(banners):
                save_banners(org, banners)
                self.remember('res.company.banners', self.company, org, banners)
            for banner in banners:
                self.counted('banners', not previous)

    def reservations(self):
        now = timezone.now().astimezone(ZoneInfo(self.org.timezone))
        today = now.date()
        rows = list(self.read('waiter.reservation', 'name config_id customer_name customer_email customer_phone date time_start time_end prep_minutes '
            'people baby_chair table_id table_ids state notes deposit_amount deposit_state deposit_reference deposit_paid_at pay_token create_uid create_date preorder_id',
            [('config_id', 'in', [c['id'] for c in self.configs])]))
        preorder_ids = [oid(r['preorder_id']) for r in rows if r.get('preorder_id')]
        preorder_lines = list(self.read('pos.order.line', 'order_id product_id qty customer_note price_unit', [('order_id', 'in', preorder_ids)])) if preorder_ids else []
        for r in rows:
            if date.fromisoformat(r['date']) < today or (r['date'] == today.isoformat() and r['time_end'] <= now.hour + now.minute / 60) or r['state'] not in ('confirmed', 'seated'):
                self.skip('waiter.reservation', 'reserva pasada o inactiva')
                continue
            from reservations.services import time_value, prep_value
            time_value(r['time_start'])
            time_value(r['time_end'])
            prep_value(int(r.get('prep_minutes', 30)))
            table = self.ref('restaurant.table', r['table_id'])
            rest = self.ref('pos.config', r['config_id'])
            valid(table.floor.restaurant_id == rest.pk, 'La mesa de la reserva pertenece a otra sede.')
            values = {k: r[k] for k in ('customer_name', 'date', 'time_start', 'time_end', 'people', 'baby_chair', 'state', 'deposit_amount', 'deposit_state') if k in r}
            for k in ('customer_email', 'customer_phone', 'notes', 'deposit_reference'):
                values[k] = r.get(k) or ''
            values.update(organization=self.org, restaurant=rest, code=r['name'], main_table=table,
                prep_minutes=int(r.get('prep_minutes', 30)), created_by=self.ref('res.users', r['create_uid']), deposit_paid_at=stamp(r.get('deposit_paid_at')))
            if r.get('pay_token'):
                values['pay_token'] = r['pay_token']
            row = self.upsert('waiter.reservation', r, Reservation, values)
            from reservations.services import selected_tables
            row.tables.set(selected_tables(row, [self.ref('restaurant.table', i).pk for i in r.get('table_ids') or [oid(r['table_id'])]]))
            for line in preorder_lines:
                if oid(line['order_id']) == oid(r.get('preorder_id')):
                    valid(dec(line['qty']) > 0, 'La reserva contiene una cantidad no positiva.')
                    self.upsert('reservation.preorder.line', line, ReservationLine, dict(reservation=row,
                        product=self.ref('product.product', line['product_id']), qty=dec(line['qty']),
                        note=line.get('customer_note') or '', price=dec(line['price_unit'])))
            if r.get('create_date'):
                Reservation.objects.filter(pk=row.pk).update(created_at=stamp(r['create_date']))

    def notifications(self):
        for r in self.read('waiter.notification', 'config_id kind title body res_model res_id action action_done read user_id create_date', [('config_id', 'in', [c['id'] for c in self.configs])]):
            if r.get('read'):
                self.skip('waiter.notification', 'aviso leído')
                continue
            target = self.ref(r['res_model'], r['res_id']) if r.get('res_id') and self.mapping(r.get('res_model'), r['res_id']) else None
            recipient = self.ref('res.users', r.get('user_id'), True)
            restaurant = self.ref('pos.config', r['config_id'])
            valid(not recipient or recipient.role == 'owner' or recipient.restaurants.filter(pk=restaurant.pk).exists(), 'El destinatario del aviso no pertenece a la sede.')
            row = self.upsert('waiter.notification', r, Notification, dict(organization=self.org, restaurant=self.ref('pos.config', r['config_id']),
                recipient=recipient, kind=r['kind'], title=r['title'], body=r.get('body') or '',
                res_model=target._meta.label if target else '', res_id=target.pk if target else None,
                action=r.get('action') or '' if target else '', action_done=r.get('action_done', False)))
            if r.get('create_date'):
                Notification.objects.filter(pk=row.pk).update(created_at=stamp(r['create_date']))
