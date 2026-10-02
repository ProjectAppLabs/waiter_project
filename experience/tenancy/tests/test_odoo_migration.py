"""Contrato T6 contra respuestas JSON-RPC en memoria, sin Odoo ni registro."""
import base64
import copy
import json
from datetime import timedelta
from io import BytesIO, StringIO
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from PIL import Image

from accounts.models import Account
from catalog.models import Product, ProductPhoto, Recipe, RestaurantPrice
from inventory.models import Stock
from loyalty.models import Customer, LoyaltyCard, Coupon, BenefitAction, Banner
from notifications.models import Notification
from reservations.models import Reservation
from sales.models import Order, OrderLine, Payment, CashShift, Course
from tables.models import Table
from tenancy.models import LegacyMap, LegacySource, Organization
from tenancy.management.commands.migrate_from_odoo import Command

pytestmark = pytest.mark.django_db


class FakeOdoo:
    """Diccionario por modelo y método; aplica dominios y páginas como JSON-RPC."""
    def __init__(self, rows):
        self.responses = {}
        self.calls = []
        self.rows = rows
        for model, records in rows.items():
            self.responses[model, 'search_read'] = records
            self.responses[model, 'fields_get'] = {k: {} for r in records for k in r}
        self.responses['pos.config', 'waiter_catalog_prices'] = {'301': 12000}
        self.responses['pos.config', 'waiter_benefits_settings'] = {
            'coupons': [{'id': 81, 'name': 'Bienvenida', 'code': 'HOLA', 'percent': 10, 'minimum': 0, 'active': True, 'configs': [11], 'start': '', 'end': ''}],
            'loyalty': {'name': 'Puntos', 'spendPerPoint': 1000, 'valuePerPoint': 100, 'minimumPoints': 10}}

    def call_kw(self, model, method, args, kwargs=None):
        kwargs = kwargs or {}
        self.calls.append((model, method, copy.deepcopy(args), copy.deepcopy(kwargs)))
        if method == 'fields_get' and model in self.rows:
            return {k: {} for row in self.rows[model] for k in row}
        if method != 'search_read':
            return copy.deepcopy(self.responses.get((model, method), {}))
        def matches(row, domain):
            def condition(item):
                field, op, value = item
                actual = row.get(field, False)
                if isinstance(actual, list) and len(actual) == 2 and isinstance(actual[1], str):
                    actual = actual[0]
                if op == '=':
                    return actual == value
                if op == '>':
                    return actual > value
                if op == 'in':
                    return bool(set(actual) & set(value)) if isinstance(actual, list) else actual in value
                if op == 'child_of':
                    return actual == value
                raise AssertionError(op)
            terms = iter(domain)
            def term(item):
                if item == '|':
                    left, right = term(next(terms)), term(next(terms))
                    return left or right
                return condition(item)
            return all([term(item) for item in terms])
        records = [r for r in self.responses.get((model, method), []) if matches(r, args[0])]
        records.sort(key=lambda r: r['id'])
        return [{k: copy.deepcopy(v) for k, v in r.items() if k in kwargs['fields']} for r in records[:kwargs['limit']]]


@pytest.fixture
def migration(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / 'media'
    settings.MAILERS = {key: {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'} for key in ('default', 'waiter')}
    image = BytesIO()
    Image.new('RGB', (24, 16), '#123456').save(image, 'PNG')
    photo = base64.b64encode(image.getvalue()).decode()
    future = (timezone.now() + timedelta(days=10)).date().isoformat()
    rows = {
        'res.company': [{'id': 1, 'name': 'Burger House', 'vat': '900123456', 'brand_color': '#123456', 'brand_logo': photo,
            'waiter_banners_configured': True, 'waiter_menu_banners': [{'layout': 'product', 'title': 'Especial', 'target': 'product', 'targetId': 301, 'theme': 'dark', 'active': True}]}],
        'pos.config': [{'id': 11, 'company_id': 1, 'name': 'Poblado', 'waiter_slug': 'poblado', 'payment_method_ids': [71], 'warehouse_id': [51, 'Almacén']}],
        'res.users': [{'id': 21, 'company_ids': [1], 'name': 'Laura', 'waiter_role': 'owner', 'email': 'laura@example.com'}],
        'hr.employee': [{'id': 22, 'company_id': 1, 'name': 'Laura', 'user_id': [21, 'Laura'], 'waiter_role': 'owner'}],
        'account.tax': [{'id': 31, 'company_id': 1, 'name': 'INC 8 %', 'amount': 8, 'price_include': True}],
        'pos.category': [{'id': 32, 'name': 'Hamburguesas', 'kitchen_station': 'Parrilla'}],
        'res.partner': [{'id': 41, 'company_id': 1, 'name': 'Proveedor', 'supplier_rank': 1}, {'id': 42, 'company_id': 1, 'name': 'Ana', 'supplier_rank': 0}],
        'uom.uom': [{'id': 43, 'name': 'kg', 'factor': 1}],
        'product.template': [{'id': 101, 'company_id': 1, 'name': 'Hamburguesa', 'available_in_pos': True, 'list_price': 10000,
            'pos_categ_ids': [32], 'taxes_id': [31], 'image_1920': photo, 'diner_attributes': json.dumps({'ingredientes': ['Carne']})},
            {'id': 102, 'company_id': 1, 'name': 'Carne', 'is_ingredient': True, 'uom_id': [43, 'kg'], 'pantry_supplier_id': [41, 'Proveedor'], 'pantry_category': 'meat', 'standard_price': 20000}],
        'product.product': [{'id': 301, 'product_tmpl_id': [101, 'Hamburguesa']}, {'id': 302, 'product_tmpl_id': [102, 'Carne']}],
        'projectapp.product.photo': [{'id': 44, 'product_tmpl_id': [101, 'Hamburguesa'], 'sequence': 0, 'image': photo}],
        'mrp.bom': [{'id': 45, 'product_tmpl_id': [101, 'Hamburguesa'], 'product_qty': 2, 'active': True}],
        'mrp.bom.line': [{'id': 46, 'bom_id': [45, 'Receta'], 'product_id': [302, 'Carne'], 'product_qty': .4, 'product_uom_id': [43, 'kg']}],
        'stock.warehouse': [{'id': 51, 'lot_stock_id': [52, 'Stock']}],
        'stock.quant': [{'id': 53, 'company_id': 1, 'location_id': 52, 'product_id': [302, 'Carne'], 'quantity': 8}],
        'stock.warehouse.orderpoint': [{'id': 54, 'company_id': 1, 'location_id': 52, 'product_id': [302, 'Carne'], 'product_min_qty': 2, 'product_max_qty': 10}],
        'restaurant.floor': [{'id': 61, 'name': 'Salón', 'pos_config_ids': [11], 'waiter_plan': {'walls': [], 'zones': [], 'decor': []}}],
        'restaurant.table': [{'id': 62, 'floor_id': [61, 'Salón'], 'table_number': 4, 'seats': 4, 'position_h': 20, 'position_v': 20, 'width': 80, 'height': 80}],
        'pos.payment.method': [{'id': 71, 'name': 'Efectivo', 'is_cash_count': True}],
        'loyalty.card': [{'id': 82, 'company_id': 1, 'partner_id': [42, 'Ana'], 'code': 'ABCD1234', 'points': 35}],
        'waiter.benefit.action': [{'id': 83, 'company_id': 1, 'action': 'opinion', 'active': True, 'reward': 'puntos', 'percent': 5, 'points': 10, 'pos_config_ids': [11]}],
        'pos.session': [{'id': 91, 'config_id': [11, 'Poblado'], 'state': 'closed', 'user_id': [21, 'Laura'], 'start_at': '2026-09-01 10:00:00', 'stop_at': '2026-09-01 22:00:00',
            'cash_register_balance_start': 100000, 'cash_register_balance_end': 110000, 'cash_register_balance_end_real': 109000, 'closing_notes': 'Faltante'}],
        'pos.order': [{'id': 92, 'config_id': [11, 'Poblado'], 'session_id': [91, 'Caja'], 'name': 'DI-1', 'state': 'paid', 'user_id': [21, 'Laura'], 'table_id': [62, '4'],
            'date_order': '2026-09-01 12:00:00', 'amount_total': 10800, 'amount_tax': 800, 'amount_paid': 10800},
            {'id': 99, 'config_id': [11, 'Poblado'], 'state': 'draft'}],
        'restaurant.order.course': [{'id': 93, 'order_id': [92, 'DI-1'], 'index': 1, 'fired_date': '2026-09-01 12:00:00', 'served_date': '2026-09-01 12:20:00'}],
        'pos.order.line': [{'id': 94, 'order_id': [92, 'DI-1'], 'product_id': [301, 'Hamburguesa'], 'qty': 1, 'price_unit': 10800, 'price_subtotal': 10000, 'price_subtotal_incl': 10800,
            'tax_ids': [31], 'course_id': [93, '1']}],
        'pos.payment': [{'id': 95, 'pos_order_id': [92, 'DI-1'], 'payment_method_id': [71, 'Efectivo'], 'amount': 10800, 'payment_date': '2026-09-01 12:30:00'}],
        'waiter.reservation': [{'id': 96, 'name': 'RV001', 'config_id': [11, 'Poblado'], 'date': future, 'customer_name': 'Ana', 'time_start': 14, 'time_end': 16, 'table_id': [62, '4'],
            'state': 'confirmed', 'create_uid': [21, 'Laura'], 'deposit_amount': 5000, 'deposit_state': 'paid', 'deposit_reference': 'REF001', 'deposit_paid_at': '2026-09-01 12:30:00'}],
        'waiter.notification': [{'id': 97, 'config_id': [11, 'Poblado'], 'kind': 'system', 'title': 'Revisar cierre', 'read': False, 'user_id': [21, 'Laura'], 'res_model': 'pos.order', 'res_id': 92}],
    }
    fake = FakeOdoo(rows)
    monkeypatch.setattr(Command, 'client_factory', staticmethod(lambda creds: fake))
    token_file = tmp_path / 'tokens.json'
    token_file.write_text(json.dumps([{'venue': 'poblado', 'odoo_table_id': 62, 'token': 'QR1234', 'table_number': 4}]))
    def run(**kwargs):
        output = StringIO()
        options = dict(org='burger-house', url='http://odoo.test', db='demo', login='admin', password='secreto',
            registry_tokens=str(token_file), no_invite=True, stdout=output)
        options.update(kwargs)
        call_command('migrate_from_odoo', **options)
        return output.getvalue()
    return fake, run


def test_all_domains(migration):
    # Falla si algún dominio se omite o las referencias conservan ids de Odoo.
    fake, run = migration
    output = run(batch_size=1)
    org = Organization.objects.get(slug='burger-house')
    assert org.name == 'Burger House' and bytes(org.brand_logo)
    account = Account.objects.get(organization=org)
    assert account.role == 'owner' and not account.activated and account.password == '!'
    product = Product.objects.get(organization=org, kind='dish')
    assert product.categories.get().station == 'Parrilla'
    assert product.image.name.endswith('.webp')
    assert ProductPhoto.objects.get().image.name.endswith('.webp')
    assert Recipe.objects.get().lines.get().ingredient.name == 'Carne'
    assert Stock.objects.get().qty == 8
    assert RestaurantPrice.objects.get().price == 12000
    assert Table.objects.get().token == 'QR1234'
    assert Customer.objects.filter(name='Ana').exists()
    assert LoyaltyCard.objects.get().points == 35
    assert Coupon.objects.get().code == 'HOLA'
    assert BenefitAction.objects.get(action='opinion').points == 10
    assert Banner.objects.get().target_id == product.pk
    assert Reservation.objects.get().deposit_amount == 5000
    assert CashShift.objects.get().difference == -1000
    assert Order.objects.get().total == Payment.objects.get().amount == 10800
    assert OrderLine.objects.get().course == Course.objects.get()
    assert Notification.objects.get().res_id == Order.objects.get().pk
    assert 'pedido no pagado (1)' in output and 'Dominio | Leídos' in output
    assert all(c[3]['limit'] == 1 for c in fake.calls if c[1] == 'search_read')


def test_idempotence(migration):
    # Falla si repetir la importación duplica entidades, galería, pagos o saldos.
    _, run = migration
    run()
    models = [Product, ProductPhoto, Recipe, Stock, Table, Account, Customer, LoyaltyCard, Coupon, BenefitAction, Banner, Reservation, CashShift, Order, OrderLine, Course, Payment, Notification, LegacyMap]
    before = {m: m.objects.count() for m in models}
    photo_id = ProductPhoto.objects.get().pk
    run()
    assert before == {m: m.objects.count() for m in models}
    assert ProductPhoto.objects.get().pk == photo_id
    assert Stock.objects.get().qty == 8 and LoyaltyCard.objects.get().points == 35


def test_rollback_missing_reference(migration):
    # Falla si una referencia rota deja una importación parcial en la base.
    fake, run = migration
    fake.rows['pos.order.line'][0]['product_id'] = [99999, 'Ajeno']
    with pytest.raises(CommandError, match='correspondencia'):
        run()
    assert not Organization.objects.filter(slug='burger-house').exists()
    assert not LegacyMap.objects.exists()


def test_source_binding(migration):
    # Falla si una segunda base reutiliza los ids ya importados de otra base.
    _, run = migration
    run()
    source = LegacySource.objects.get()
    source.database = 'otra-base'
    source.save()
    with pytest.raises(CommandError, match='otro origen'):
        run()


def test_company_selection(migration):
    # Falla si la selección implícita mezcla dos compañías de Odoo.
    fake, run = migration
    fake.rows['res.company'].append({'id': 2, 'name': 'Otra compañía'})
    with pytest.raises(CommandError, match='company-id'):
        run()
    run(company_id=1)


def test_remap_diner_and_repeat(migration):
    # Falla si el remapeo cruza organizaciones o vuelve a traducir un id ya traducido.
    from experience_app.models import TableSession, Diner, DinerAccount, CartLine, DinerFavorite, DinerFeedback, PaymentGateway, Order as DinerOrder
    from experience_app.models.agent_conversation import AgentCartSelection
    _, run = migration
    session = TableSession.objects.create(restaurant_slug='burger-house', venue_slug='poblado', odoo_table_id=62, table_token='QR1234')
    other = TableSession.objects.create(restaurant_slug='otra', venue_slug='poblado', odoo_table_id=62)
    diner = Diner.objects.create(session=session)
    account = DinerAccount.objects.create(phone='+573001234567')
    line = CartLine.objects.create(session=session, diner=diner, product_id=301, qty=1, unit_price=10000)
    favorite = DinerFavorite.objects.create(account=account, restaurant_slug='burger-house', product_id=301)
    selection = AgentCartSelection.objects.create(diner=diner, message_id=uuid4(), product_id=301, qty=1)
    gateway = PaymentGateway.objects.create(restaurant_slug='burger-house', venue_slug='poblado', payment_method_id=71)
    order = DinerOrder.objects.create(session=session, odoo_order_id=92)
    feedback = DinerFeedback.objects.create(order=order, diner=diner, rating=5, dish_ratings={'301': 5})
    run(remap_diner=True)
    run(remap_diner=True)
    for row in (line, favorite, selection, gateway, session, order, feedback, other):
        row.refresh_from_db()
    product = Product.objects.get(kind='dish')
    assert line.product_id == favorite.product_id == selection.product_id == product.pk
    assert feedback.dish_ratings == {str(product.pk): 5}
    assert gateway.payment_method_id == Payment.objects.get().method_id
    assert session.odoo_table_id == Table.objects.get().pk and other.odoo_table_id == 62
    assert order.odoo_order_id == Order.objects.get().pk


def test_no_invite(migration):
    # Falla si --no-invite manda correos o activa cuentas sin contraseña.
    _, run = migration
    run()
    assert Account.objects.get().invite_sent_at is None


def test_migration_does_not_charge(migration):
    # Falla si importar el historial descuenta inventario, abona puntos o emite documentos.
    from inventory.models import StockMove
    from loyalty.models import LoyaltyMove
    from billing.models import SalesDocument
    _, run = migration
    run()
    assert not StockMove.objects.exists() and not LoyaltyMove.objects.exists() and not SalesDocument.objects.exists()


def test_remap_without_odoo(migration, monkeypatch):
    # Falla si el segundo paso exige conectarse de nuevo a Odoo.
    from experience_app.models import TableSession
    _, run = migration
    run()
    session = TableSession.objects.create(restaurant_slug='burger-house', venue_slug='poblado', odoo_table_id=62)
    monkeypatch.setattr(Command, 'client_factory', staticmethod(lambda creds: pytest.fail('No debe crear un cliente')))
    call_command('migrate_from_odoo', org='burger-house', remap_diner=True, stdout=StringIO())
    session.refresh_from_db()
    assert session.odoo_table_id == Table.objects.get().pk


def test_invitations_after_commit_and_once(migration, django_capture_on_commit_callbacks):
    # Falla si se envían invitaciones antes de confirmar la transacción o se reenvían al repetir.
    from django.core import mail
    _, run = migration
    with django_capture_on_commit_callbacks(execute=True):
        run(no_invite=False)
        assert not getattr(mail, 'outbox', [])
    assert len(mail.outbox) == 1
    person = Account.objects.get()
    assert person.invite_sent_at and person.invite_code_hash and not person.activated
    with django_capture_on_commit_callbacks(execute=True):
        run(no_invite=False)
    assert len(mail.outbox) == 1


def test_rollback_cleans_files(migration, settings):
    # Falla si un error tardío deja fotos o adjuntos creados por la importación fallida.
    fake, run = migration
    fake.rows['pos.order.line'][0]['product_id'] = [99999, 'Faltante']
    with pytest.raises(CommandError):
        run()
    assert not [p for p in settings.MEDIA_ROOT.rglob('*') if p.is_file()]


def test_isolation_between_organizations(migration):
    # Falla si ids iguales de dos organizaciones comparten catálogo, personal o pedidos.
    _, run = migration
    run()
    original = Product.objects.get(organization__slug='burger-house', kind='dish')
    run(org='otro-restaurante', registry_tokens=None)
    other = Product.objects.get(organization__slug='otro-restaurante', kind='dish')
    assert original.pk != other.pk
    assert Order.objects.filter(organization__slug='burger-house').count() == 1
    assert Order.objects.filter(organization__slug='otro-restaurante').count() == 1
    assert Account.objects.count() == 2


def test_foreign_mapping_rejected(migration):
    # Falla si una correspondencia adulterada permite escribir datos de otra organización.
    _, run = migration
    run()
    other = Organization.objects.create(slug='ajena', name='Ajena')
    product = Product.objects.create(organization=other, name='Ajeno', kind='dish')
    LegacyMap.objects.filter(model='product.template', odoo_id='101').update(local_id=str(product.pk))
    with pytest.raises(CommandError, match='ajena'):
        run()
    product.refresh_from_db()
    assert product.name == 'Ajeno'


def test_invalid_registry_token_rolls_back(migration):
    # Falla si un token de otra mesa reemplaza el QR impreso sin validar su número.
    fake, run = migration
    fake.rows['restaurant.table'][0]['table_number'] = 5
    with pytest.raises(CommandError, match='número de mesa'):
        run()
    assert not Table.objects.exists()


def test_paid_order_in_open_shift_rejected(migration):
    # Falla si se conmutan ventas de una caja abierta con pedidos aún no cerrados.
    fake, run = migration
    fake.rows['pos.session'][0]['state'] = 'opened'
    with pytest.raises(CommandError, match='turno no cerrado'):
        run()


def test_cash_change_is_not_sales(migration):
    # Falla si el efectivo devuelto infla los pagos y los informes del histórico.
    fake, run = migration
    fake.rows['pos.payment'][0]['amount'] = 20000
    fake.rows['pos.payment'].append({'id': 98, 'pos_order_id': [92, 'DI-1'], 'payment_method_id': [71, 'Efectivo'], 'amount': -9200})
    fake.rows['pos.order'][0]['amount_return'] = 9200
    run()
    assert Payment.objects.get().amount == 10800
    assert Payment.objects.get().received == 20000
    assert Order.objects.get().change == 9200


def test_plan_attachments_and_repeat(migration):
    # Falla si el plano conserva rutas de Odoo o duplica archivos al repetir.
    from tables.models import Floor
    fake, run = migration
    photo = fake.rows['product.template'][0]['image_1920']
    fake.rows['restaurant.floor'][0]['waiter_plan'].update(backgroundSize={'width': 1000, 'height': 1000}, images=[
        {'id': 'fondo', 'x': 200, 'y': 200, 'width': 200, 'height': 200, 'attachmentId': 150}])
    fake.responses['ir.attachment', 'fields_get'] = {k: {} for k in ('id', 'datas', 'res_id', 'res_model')}
    fake.responses['ir.attachment', 'search_read'] = [{'id': 150, 'res_model': 'restaurant.floor', 'res_id': 61, 'datas': photo}]
    run()
    before = Floor.objects.get().plan
    assert before['images'][0]['file'].endswith('.webp') and before['background_size']['width'] == 1000
    run()
    assert Floor.objects.get().plan == before


def test_report_balances(migration):
    # Falla si el informe anuncia lecturas sin clasificarlas como creadas, actualizadas u omitidas.
    _, run = migration
    for output in (run(), run()):
        for line in output.splitlines()[1:]:
            if ' | ' not in line:
                continue
            domain, read, created, updated, skipped, reason = line.split(' | ')
            assert int(read) == int(created) + int(updated) + int(skipped), domain


def test_tips_separated_and_idempotent(migration):
    # Falla si la propina se cuenta como plato, aumenta la base o se acumula al repetir.
    fake, run = migration
    fake.rows['pos.config'][0]['tip_product_id'] = [303, 'Propina']
    fake.rows['product.template'].append({'id': 103, 'company_id': 1, 'name': 'Propina', 'available_in_pos': False, 'list_price': 0})
    fake.rows['product.product'].append({'id': 303, 'product_tmpl_id': [103, 'Propina']})
    fake.rows['pos.order.line'].append({'id': 98, 'order_id': [92, 'DI-1'], 'product_id': [303, 'Propina'], 'qty': 1,
        'price_unit': 2000, 'price_subtotal': 2000, 'price_subtotal_incl': 2000})
    fake.rows['pos.order'][0].update(amount_total=12800, amount_paid=12800)
    fake.rows['pos.payment'][0]['amount'] = 12800
    run()
    run()
    assert Order.objects.get().tip == 2000 and Order.objects.get().subtotal == 10000
    assert OrderLine.objects.count() == 1


def test_archived_catalog_and_updates(migration):
    # Falla si un catálogo archivado impide repetir o si se ignoran cambios posteriores del origen.
    fake, run = migration
    fake.rows['account.tax'][0]['active'] = False
    fake.rows['pos.category'][0]['active'] = False
    fake.rows['product.template'][0]['active'] = False
    fake.rows['res.company'][0]['waiter_menu_banners'] = []
    run()
    fake.rows['product.template'][0]['list_price'] = 20000
    run()
    product = Product.objects.get(kind='dish')
    assert not product.active and product.price == 20000
    assert not product.taxes.get().active and not product.categories.get().active


def test_long_card_code(migration):
    # Falla si una tarjeta nativa con código largo se pierde o cambia de código propio al repetir.
    fake, run = migration
    fake.rows['loyalty.card'][0]['code'] = '0449-300c-4ac4-1234'
    run()
    code = LoyaltyCard.objects.get().code
    assert len(code) == 8
    run()
    assert LoyaltyCard.objects.get().code == code and LoyaltyCard.objects.get().points == 35


def test_remap_swapped_ids(migration):
    # Falla si dos favoritos con ids intercambiados chocan durante la traducción.
    from experience_app.models import DinerAccount, DinerFavorite
    _, run = migration
    run()
    org = Organization.objects.get(slug='burger-house')
    first = Product.objects.create(organization=org, name='Primero', kind='dish', pk=1000)
    second = Product.objects.create(organization=org, name='Segundo', kind='dish', pk=1001)
    for source, target in ((1000, second), (1001, first)):
        LegacyMap.objects.create(organization=org, model='product.product', odoo_id=str(source), local_model='catalog.Product', local_id=str(target.pk))
    account = DinerAccount.objects.create(organization_slug=org.slug, name='Ana', email='ana@example.com')
    a = DinerFavorite.objects.create(account=account, restaurant_slug=org.slug, product_id=1000)
    b = DinerFavorite.objects.create(account=account, restaurant_slug=org.slug, product_id=1001)
    call_command('migrate_from_odoo', org=org.slug, remap_diner=True, stdout=StringIO())
    a.refresh_from_db()
    b.refresh_from_db()
    assert (a.product_id, b.product_id) == (1001, 1000)


def test_booking_lines_and_invalid_time(migration):
    # Falla si se pierden los platos de una reserva o se acepta una hora fuera de las medias horas.
    from reservations.models import ReservationLine
    fake, run = migration
    fake.rows['waiter.reservation'][0]['preorder_id'] = [99, 'Borrador']
    fake.rows['pos.order.line'].append({'id': 120, 'order_id': [99, 'Borrador'], 'product_id': [301, 'Hamburguesa'], 'qty': 2, 'price_unit': 10000})
    run()
    assert ReservationLine.objects.get().qty == 2 and Order.objects.count() == 1
    fake.rows['waiter.reservation'][0]['time_start'] = 14.25
    with pytest.raises(CommandError, match='medias horas'):
        run()


def test_tax_excluded_historical_price(migration):
    # Falla si importar un precio con impuesto excluido pierde el precio final o excede la precisión monetaria.
    fake, run = migration
    fake.rows['account.tax'][0]['price_include'] = False
    fake.rows['pos.order.line'][0]['price_unit'] = 10000
    run()
    assert OrderLine.objects.get().unit_price == 10800
