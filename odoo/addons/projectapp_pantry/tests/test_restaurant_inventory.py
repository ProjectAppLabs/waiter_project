from uuid import uuid4
from odoo import Command
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError, AccessError
from odoo.addons.projectapp_ops.tests.common_waiter import single_restaurant


@tagged('post_install', '-at_install')
class TestRestaurantInventory(TransactionCase):
    def setUp(self):
        super().setUp()
        single_restaurant(self.env)
        self.env.user.waiter_role = 'admin'
        self.T = self.env['product.template']
        self.unit = self.env.ref('uom.product_uom_unit')
        self.kg = self.env.ref('uom.product_uom_kgm')
        self.gram = self.env.ref('uom.product_uom_gram')
        self.employee = self.env['hr.employee'].create({'name':'Encargada prueba despensa','waiter_role':'admin','company_id':self.env.company.id})
        self.token = self.employee._waiter_new_session()
        self.meat = self.T.browse(self.T.waiter_create_ingredient({'name':'Carne receta prueba','uom_id':self.kg.id,'standard_price':20000},2)['id'])
        self.dish = self.T.browse(self.T.waiter_create_dish({'name':'Plato receta prueba'},[{'product_tmpl_id':self.meat.id,'qty':200,'uom_id':self.gram.id}])['id'])

    def recipe(self, qty=200, unit=None):
        return [{'ingredientId':self.meat.id,'qty':qty,'uomId':(unit or self.gram).id}]

    def test_edit_recipe_yield_cost_units_and_stale_version(self):
        detail=self.dish.waiter_recipe_detail()
        self.assertEqual((detail['servings'],detail['cost']), (10,4000))
        changed=self.dish.waiter_update_recipe(self.recipe(1000),10,detail['bom_id'],self.employee.id,self.token)
        self.assertEqual((changed['servings'],changed['cost']), (20,2000))
        with self.assertRaises(UserError):
            self.dish.waiter_update_recipe(self.recipe(),1,detail['bom_id'],self.employee.id,self.token)
        for recipe in [self.recipe(0),self.recipe(-1),self.recipe(float('nan')),self.recipe(unit=self.unit),self.recipe()+self.recipe()]:
            with self.assertRaises(UserError):
                self.dish.waiter_update_recipe(recipe,1,changed['bom_id'],self.employee.id,self.token)
        self.assertEqual(self.dish.waiter_recipe_detail()['bom_id'],changed['bom_id'])

    def test_shared_ingredients_commitments_cancel_and_real_pos_deduction(self):
        config=self.env['pos.config'].search([],limit=1).copy({'name':'Inventario restaurante prueba'})
        session=self.env['pos.session'].create({'config_id':config.id})
        other=self.T.browse(self.T.waiter_create_dish({'name':'Otro plato prueba'},[{'product_tmpl_id':self.meat.id,'qty':100,'uom_id':self.gram.id}])['id'])
        order=self.env['pos.order'].create({'session_id':session.id,'amount_tax':0,'amount_total':0,'amount_paid':0,'amount_return':0,
            'lines':[Command.create({'product_id':self.dish.product_variant_id.id,'qty':3,'price_unit':0,'price_subtotal':0,'price_subtotal_incl':0})]})
        self.T._waiter_invalidate()
        self.assertEqual(self.dish.servings_available,7)
        self.assertEqual(other.servings_available,14)
        with self.assertRaises(UserError):
            self.meat.waiter_inventory_move('count',1,'Conteo con cocina pendiente',str(uuid4()),2,self.employee.id,self.token)
        with self.assertRaises(UserError):
            self.dish.waiter_update_recipe(self.recipe(),1,self.dish.waiter_recipe_detail()['bom_id'],self.employee.id,self.token)
        order.lines.write({'qty':2})
        self.T._waiter_invalidate()
        self.assertEqual(self.dish.servings_available,8)
        order.action_pos_order_paid()
        order.action_pos_order_paid()
        pickings=order.picking_ids
        self.T._waiter_invalidate()
        self.assertTrue(pickings)
        self.assertTrue(all(p.state=='done' for p in pickings))
        self.assertAlmostEqual(self.meat.qty_available,1.6)
        self.assertEqual(self.dish.servings_available,8)

    def test_movements_idempotent_traceable_and_count_rejects_stale_stock(self):
        key=str(uuid4())
        args=['receipt',1,'Factura proveedor PRUEBA',key,2,self.employee.id,self.token]
        result=self.meat.waiter_inventory_move(*args)
        self.assertEqual(result['stock'],3)
        self.assertEqual(self.meat.waiter_inventory_move(*args)['stock'],3)
        self.assertEqual(len([r for r in result['history'] if r['reason']=='Factura proveedor PRUEBA']),1)
        self.assertEqual(self.meat.waiter_inventory_move('waste',.2,'Merma de limpieza',str(uuid4()),3,self.employee.id,self.token)['stock'],2.8)
        with self.assertRaises(UserError):
            self.meat.waiter_inventory_move('count',2,'Conteo cierre',str(uuid4()),3,self.employee.id,self.token)
        self.assertEqual(self.meat.waiter_inventory_move('count',2,'Conteo cierre',str(uuid4()),2.8,self.employee.id,self.token)['stock'],2)
        with self.assertRaises(UserError):
            self.meat.waiter_inventory_move('waste',3,'Merma excesiva',str(uuid4()),2,self.employee.id,self.token)
        with self.assertRaises(AccessError):
            self.meat.waiter_inventory_move('receipt',1,'Sin PIN',str(uuid4()),2,self.employee.id,'wrong')

    def test_small_gram_portions_are_not_rounded_to_ten_grams_on_sale(self):
        detail=self.dish.waiter_recipe_detail()
        self.dish.waiter_update_recipe(self.recipe(5),1,detail['bom_id'],self.employee.id,self.token)
        config=self.env['pos.config'].search([],limit=1).copy({'name':'Receta cinco gramos'})
        session=self.env['pos.session'].create({'config_id':config.id})
        order=self.env['pos.order'].create({'session_id':session.id,'amount_tax':0,'amount_total':0,'amount_paid':0,'amount_return':0,
            'lines':[Command.create({'product_id':self.dish.product_variant_id.id,'qty':1,'price_unit':0,'price_subtotal':0,'price_subtotal_incl':0})]})
        order.action_pos_order_paid()
        self.T._waiter_invalidate()
        self.assertAlmostEqual(self.meat.qty_available,1.995,places=4)
