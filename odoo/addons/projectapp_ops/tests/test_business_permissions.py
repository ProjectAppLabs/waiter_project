"""Q1: pruebas con un encargado real, aunque tenga el grupo administrador del POS."""
from types import SimpleNamespace
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError
from odoo.tests import tagged

from odoo import fields

from .common_business import BusinessCase

# Facturar exige una venta de hoy: Odoo no contabiliza una factura con fecha futura (la deja programada en borrador), y
# las ventas de los informes van en 2040 para no mezclarse con las de la base de desarrollo.
TODAY = fields.Datetime.to_string(fields.Datetime.now())


@tagged('post_install', '-at_install')
class TestBusinessPermissions(BusinessCase):
    def test_account_invoice_requires_owner(self):
        # Falla si el encargado contabiliza una venta o si el dueño pierde esa facultad.
        order = self._order(date=TODAY)
        with self.assertRaises(AccessError):
            order.with_user(self.manager).waiter_account_invoice(self.partner.id)
        move_id = order.with_user(self.owner).waiter_account_invoice(self.partner.id)
        self.assertEqual(self.env['account.move'].browse(move_id).state, 'posted')

    def test_billing_review_requires_owner(self):
        # Falla si el encargado obtiene la revisión contable o el dueño no puede consultarla.
        order = self._order(date=TODAY)
        with self.assertRaises(AccessError):
            order.with_user(self.manager).waiter_billing_review(self.partner.id)
        self.assertTrue(order.with_user(self.owner).waiter_billing_review(self.partner.id)['ready'])

    def test_accounting_detail_requires_owner(self):
        # Falla si los grupos de facturación del encargado permiten abrir el detalle contable.
        order = self._order(date=TODAY)
        move = self.env['account.move'].browse(order.with_user(self.owner).waiter_account_invoice(self.partner.id))
        with self.assertRaises(AccessError):
            move.with_user(self.manager).waiter_accounting_detail()
        self.assertTrue(move.with_user(self.owner).waiter_accounting_detail()['ready'])

    def test_account_move_read_requires_owner(self):
        # Falla si leer asientos o partidas por ORM evita la autorización de las APIs contables.
        order = self._order(date=TODAY)
        move = self.env['account.move'].browse(order.with_user(self.owner).waiter_account_invoice(self.partner.id))
        for user in (self.manager, self.cashier):
            with self.assertRaises(AccessError):
                move.with_user(user).read(['amount_total'])
            with self.assertRaises(AccessError):
                move.line_ids.with_user(user).read(['debit'])
            self.assertFalse(self.env['account.move'].with_user(user).search([('id', '=', move.id)]))
        self.assertEqual(move.with_user(self.owner).read(['amount_total'])[0]['amount_total'], 100)

    def test_tip_account_write_requires_owner_and_settings_remain_readable(self):
        # Falla si el encargado cambia la cuenta de propinas o pierde la consulta de ajustes.
        config = self.first.with_user(self.manager)
        self.assertEqual(config.waiter_billing_settings()['tipAccountId'], self.liability.id)
        with self.assertRaises(AccessError):
            config.waiter_set_tip_account(self.liability.id)
        result = self.first.with_user(self.owner).waiter_set_tip_account(self.liability.id)
        self.assertEqual(result['tipAccountId'], self.liability.id)

    def test_roi_fields_require_owner(self):
        # Falla si cualquiera de los cinco supuestos del ROI se puede escribir como encargado.
        values = {'roi_hour_cost': 123, 'roi_minutes_per_order': 12, 'roi_baseline_hours_per_100': 18,
                  'roi_monthly_cost': 150000, 'roi_start_date': '2040-06-01'}
        for field, value in values.items():
            with self.subTest(field=field):
                with self.assertRaises(AccessError):
                    self.first.with_user(self.manager).write({field: value})
                self.assertTrue(self.first.with_user(self.owner).write({field: value}))

    def test_payment_methods_require_owner(self):
        # Falla si el encargado edita, crea, elimina o reasigna los medios de pago del negocio.
        method = self.first.payment_method_ids.filtered('is_cash_count')[:1]
        self.assertTrue(method.with_user(self.manager).read(['name']))
        with self.assertRaises(AccessError):
            method.with_user(self.manager).write({'name': 'Cambio indebido'})
        with self.assertRaises(AccessError):
            self.env['pos.payment.method'].with_user(self.manager).create({'name': 'Indebido'})
        with self.assertRaises(AccessError):
            method.with_user(self.manager).unlink()
        with self.assertRaises(AccessError):
            self.first.with_user(self.manager).write({'payment_method_ids': [Command.set(method.ids)]})
        fresh = self.env['pos.payment.method'].with_user(self.owner).create({'name': 'Medio Q'})
        fresh.write({'name': 'Medio Q modificado'})
        self.assertTrue(fresh.unlink())
        self.assertTrue(method.with_user(self.owner).write({'name': 'Efectivo Q'}))

    def test_payment_gateway_write_requires_owner_and_read_has_no_secrets(self):
        # Falla si el controlador escribe con encargado o devuelve un secreto añadido por el servicio.
        from ..controllers.admin import WaiterAdmin
        path = 'odoo.addons.projectapp_ops.controllers.admin.'
        data = {'provider': 'wompi', 'private_key': 'no-debe-salir', 'configurations': [{
            'environment': 'test', 'public_key': 'pub_test_ejemplo', 'private_key': 'secreto',
            'events': 'secreto', 'integrity': 'secreto', 'configured': {'private_key': True},
        }]}
        params = {'experience_url': 'https://ejemplo.invalid', 'restaurant': 'q', 'venue': 'poblado', 'internal_key': 'prueba'}
        for user in (self.manager, self.owner):
            with patch(path + 'request', SimpleNamespace(env=self.first.with_user(user).env)), \
                    patch(path + '_params', return_value=params), patch(path + '_call', return_value=data) as call:
                controller = WaiterAdmin()
                result = controller.payment_gateways(config_id=self.first.id)
                self.assertNotIn('private_key', result)
                self.assertNotIn('private_key', result['configurations'][0])
                self.assertTrue(result['configurations'][0]['configured']['private_key'])
                for action in ('set', 'test'):
                    if user == self.manager:
                        with self.assertRaises(AccessError):
                            controller.payment_gateways(action=action, configuration={}, config_id=self.first.id)
                    else:
                        controller.payment_gateways(action=action, configuration={}, config_id=self.first.id)
                self.assertEqual(call.call_count, 1 if user == self.manager else 3)

    def test_kitchen_policy_write_requires_owner(self):
        # Falla si un encargado cambia el cobro previo, incluso presentando su token válido.
        config = self.first.with_user(self.manager)
        self.assertIn('require_payment_roles', config.waiter_kitchen_policy())
        with self.assertRaises(AccessError):
            config.waiter_kitchen_policy(self.manager_employee.id, self.manager_token, ['waiter'])
        result = self.first.with_user(self.owner).waiter_kitchen_policy(self.owner_employee.id, self.owner_token, ['waiter'])
        self.assertEqual(result['require_payment_roles'], ['waiter'])

    def test_tax_regime_write_requires_owner(self):
        # Falla si el encargado reasigna los impuestos de la carta; consultar sigue permitido.
        config = self.first.with_user(self.manager)
        self.assertIn('regime', config.waiter_tax_regime(self.manager_employee.id, self.manager_token))
        with self.assertRaises(AccessError):
            config.waiter_tax_regime(self.manager_employee.id, self.manager_token, 'none')
        result = self.first.with_user(self.owner).waiter_tax_regime(self.owner_employee.id, self.owner_token, 'none')
        self.assertEqual(result['regime'], 'none')

    def test_catalog_photos_require_owner(self):
        # Falla si el encargado modifica la galería comercial o el dueño deja de poder guardarla.
        template = self.product.product_tmpl_id
        with self.assertRaises(AccessError):
            template.with_user(self.manager).waiter_set_catalog_photos(template.id, [], self.manager_employee.id, self.manager_token)
        self.assertEqual(template.with_user(self.owner).waiter_set_catalog_photos(template.id, [], self.owner_employee.id, self.owner_token), [])

    def test_category_create_requires_owner(self):
        # Falla si el encargado crea categorías comerciales por ORM directo.
        with self.assertRaises(AccessError):
            self.env['pos.category'].with_user(self.manager).create({'name': 'Categoría prohibida'})
        self.assertTrue(self.env['pos.category'].with_user(self.owner).create({'name': 'Categoría Q'}))

    def test_category_write_requires_owner(self):
        # Falla si el encargado cambia una categoría que ya usa toda la organización.
        category = self.env['pos.category'].create({'name': 'Categoría Q'})
        with self.assertRaises(AccessError):
            category.with_user(self.manager).write({'name': 'Cambio prohibido'})
        self.assertTrue(category.with_user(self.owner).write({'name': 'Cambio del dueño'}))

    def test_commercial_fields_require_owner_on_both_product_models(self):
        # Falla si cualquiera de los campos comerciales se modifica por plantilla o por variante.
        for record in (self.product, self.product.product_tmpl_id):
            for field, value in {'name': 'Plato cambiado Q', 'list_price': 200,
                                 'taxes_id': [Command.clear()], 'pos_categ_ids': [Command.clear()],
                                 'available_in_pos': False}.items():
                with self.subTest(model=record._name, field=field):
                    with self.assertRaises(AccessError):
                        record.with_user(self.manager).write({field: value})
                    self.assertTrue(record.with_user(self.owner).write({field: value}))

    def test_local_catalog_price_requires_owner(self):
        # Falla si la vía de precios del Plan O permite al encargado evitar la protección comercial.
        with self.assertRaises(AccessError):
            self.first.with_user(self.manager).waiter_set_catalog_price(self.product.product_tmpl_id.id, 150)
        self.assertEqual(self.first.with_user(self.owner).waiter_set_catalog_price(self.product.product_tmpl_id.id, 150), 150)

    def test_cashier_can_invoice_at_checkout_and_manager_can_close_it(self):
        # Falla si reservar la contabilidad al dueño rompe la factura solicitada durante el cobro o su cierre.
        order = self._order(state='draft', date=TODAY)
        config = self.first.with_user(self.cashier)
        for method in ('add_payment', 'action_pos_order_paid', 'action_pos_order_invoice'):
            config._waiter_check_rpc(self.cashier_employee.id, self.cashier_token, 'pos.order', method, [[order.id]])
        cashier_order = order.with_user(self.cashier)
        cashier_order.add_payment({'pos_order_id': order.id, 'amount': 100,
                                  'payment_method_id': self.first.payment_method_ids.filtered('is_cash_count')[:1].id})
        cashier_order.action_pos_order_paid()
        result = cashier_order.with_context(generate_pdf=False).action_pos_order_invoice()
        self.assertEqual(result['res_id'], order.account_move.id)
        self.assertEqual(order.account_move.state, 'posted')
        self.assertEqual(order.account_move.amount_total, 100)
        self._close(actor=self.manager)

    def test_system_group_is_also_owner(self):
        # Falla si un administrador de Odoo sin grupo dueño pierde las atribuciones del contrato.
        self.manager.write({'group_ids': [Command.link(self.env.ref('base.group_system').id)]})
        self.assertFalse(self.manager.has_group('projectapp_ops.group_waiter_owner'))
        self.first.with_user(self.manager).write({'roi_hour_cost': 40000})
        self.assertTrue(self._order().with_user(self.manager).waiter_billing_review(self.partner.id)['ready'])

    def test_direct_product_create_cannot_bypass_dish_creation(self):
        # Falla si el encargado evita waiter_create_dish creando una plantilla o variante vendible por ORM.
        for model in ('product.template', 'product.product'):
            values = {'name': 'Alta directa Q', 'available_in_pos': True}
            with self.assertRaises(AccessError):
                self.env[model].with_user(self.manager).create(values)
            with self.assertRaises(AccessError):
                self.env[model].with_user(self.manager).with_context(default_available_in_pos=True).create({'name': 'Alta por contexto'})
            self.assertTrue(self.env[model].with_user(self.owner).create(values))

    def test_pricelist_cannot_bypass_commercial_permissions(self):
        # Falla si el encargado cambia precios creando reglas, editándolas o reasignando una lista por ORM.
        self.first.with_user(self.owner).waiter_set_catalog_price(self.product.product_tmpl_id.id, 150)
        pricelist = self.first.pricelist_id
        item = pricelist.item_ids.filtered(lambda i: i.product_tmpl_id == self.product.product_tmpl_id)
        for record, vals in ((pricelist, {'name': 'Cambio prohibido'}), (item, {'fixed_price': 1}),
                             (self.first, {'pricelist_id': pricelist.id})):
            with self.assertRaises(AccessError):
                record.with_user(self.manager).write(vals)
        for record in (pricelist, item):
            with self.assertRaises(AccessError):
                record.with_user(self.manager).unlink()
        with self.assertRaises(AccessError):
            self.env['product.pricelist'].with_user(self.manager).create({'name': 'Lista prohibida'})
        with self.assertRaises(AccessError):
            self.env['product.pricelist.item'].with_user(self.manager).create({'pricelist_id': pricelist.id, 'fixed_price': 1})
        item.with_user(self.owner).write({'fixed_price': 200})
        self.assertEqual(self.first.waiter_catalog_prices(self.product.ids)[str(self.product.id)], 200)
