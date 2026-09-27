from copy import deepcopy
from odoo import fields
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError, AccessError


@tagged('post_install', '-at_install')
class TestFloorPlan(TransactionCase):
    def setUp(self):
        super().setUp()
        self.env.user.write({'waiter_role': 'admin'})
        base = self.env['pos.config'].search([], limit=1)
        self.config = base.copy({'name': 'Plano prueba'})
        self.employee = self.env['hr.employee'].create({'name': 'Admin plano', 'company_id': self.env.company.id, 'waiter_role': 'admin'})
        self.token = self.employee._waiter_new_session()
        self.Floor = self.env['restaurant.floor']
        self.plan = {'id': None, 'name': 'Sala prueba', 'revision': 0,
                     'walls': [{'id':'wall', 'x':0,'y':0,'width':800,'height':20}],
                     'zones': [{'id':'zone','name':'Terraza','color':'#3b82f6','x':0,'y':40,'width':800,'height':600}],
                     'tables': [{'id':None,'key':'new','number':1,'seats':6,'zone':'zone','x':80,'y':80,'width':160,'height':120}]}

    def save(self, plan=None):
        p = plan or self.plan
        return self.Floor.waiter_save_plan(self.config.id, p.get('id'), p, self.employee.id, self.token)

    def test_second_pin_login_preserves_existing_editor_session(self):
        self.employee.pin = '123456'
        second = self.env['hr.employee'].waiter_check_pin(self.employee.id, '123456')
        self.assertTrue(second['ok'])
        self.assertEqual(second['token'], self.token)
        self.assertTrue(self.save()['id'])
        self.employee.waiter_session_expires = fields.Datetime.now()
        with self.assertRaises(AccessError):
            self.save()
        renewed = self.env['hr.employee'].waiter_check_pin(self.employee.id, '123456')
        self.assertNotEqual(renewed['token'], self.token)
        self.token = renewed['token']
        self.assertTrue(self.save()['id'])

    def test_atomic_geometry_capacity_zones_and_revision(self):
        saved = self.save()
        self.assertEqual(saved['tables'][0]['seats'], 6)
        self.assertEqual(saved['tables'][0]['zone'], 'zone')
        updated = deepcopy(saved)
        updated['tables'][0]['seats'] = 9
        self.save(updated)
        with self.assertRaises(UserError):
            self.save(saved)
        self.assertEqual(self.Floor.browse(saved['id']).waiter_read_plan()['tables'][0]['seats'], 9)

    def test_overlap_and_wrong_floor_are_rejected_without_partial_writes(self):
        saved = self.save()
        bad = deepcopy(saved)
        bad['name'] = 'No debe guardarse'
        bad['tables'][0]['y'] = 0
        with self.assertRaises(UserError):
            self.save(bad)
        self.assertEqual(self.Floor.browse(saved['id']).name, saved['name'])
        bad = deepcopy(saved)
        bad['tables'][0]['id'] = 99999999
        with self.assertRaises(UserError):
            self.save(bad)

    def test_background_size_is_persisted_and_validated(self):
        self.plan['backgroundSize'] = {'x': 120, 'y': 80, 'width': 2400, 'height': 1600}
        saved = self.save()
        self.assertEqual(saved['backgroundSize'], self.plan['backgroundSize'])
        saved['backgroundSize'] = {'width': -1, 'height': 1600}
        with self.assertRaises(UserError):
            self.save(saved)
        self.assertEqual(self.Floor.browse(saved['id']).waiter_read_plan()['backgroundSize']['width'], 2400)

    def test_invalid_background_does_not_write_the_plan(self):
        saved = self.save()
        saved['background'] = 'not an image'
        saved['name'] = 'No debe guardarse'
        with self.assertRaises(UserError):
            self.save(saved)
        self.assertEqual(self.Floor.browse(saved['id']).name, 'Sala prueba')

    def test_pin_role_and_closed_cash_are_enforced(self):
        with self.assertRaises(AccessError):
            self.Floor.waiter_save_plan(self.config.id, None, self.plan, self.employee.id, 'wrong')
        self.employee.waiter_role = 'waiter'
        with self.assertRaises(AccessError):
            self.save()
        self.employee.waiter_role = 'admin'
        self.env['pos.session'].create({'config_id': self.config.id})
        with self.assertRaises(UserError):
            self.save()

    PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNCsAAAAASUVORK5CYII='

    def test_extra_images_are_attachments_kept_moved_dropped_and_owned(self):
        first = self.save({**self.plan, 'images': [{'id': 'a', 'x': 0, 'y': 700, 'width': 400, 'height': 300, 'data': self.PNG},
                                                   {'id': 'b', 'x': 500, 'y': 700, 'width': 200, 'height': 200, 'data': self.PNG}]})
        a, b = first['images']
        attachments = self.env['ir.attachment'].browse([a['attachmentId'], b['attachmentId']])
        self.assertEqual(set(attachments.mapped('res_model')), {'restaurant.floor'})
        self.assertEqual(set(attachments.mapped('res_id')), {first['id']})
        self.assertNotIn('data', a)
        legacy = self.Floor.browse(first['id']).waiter_read_plan()
        legacy.pop('images')
        self.assertEqual(len(self.save(legacy)['images']), 2, 'un cliente anterior no debe borrar las imágenes')
        moved = self.Floor.browse(first['id']).waiter_read_plan()
        moved['images'] = [{**moved['images'][0], 'x': 40}]
        kept = self.save(moved)['images']
        self.assertEqual([(i['id'], i['x'], i['attachmentId']) for i in kept], [('a', 40, a['attachmentId'])])
        self.assertFalse(self.env['ir.attachment'].browse(b['attachmentId']).exists())
        other = self.save({**self.plan, 'name': 'Otro piso', 'tables': [{**self.plan['tables'][0], 'number': 7}]})
        stolen = self.Floor.browse(other['id']).waiter_read_plan()
        stolen['images'] = [{'id': 'x', 'x': 0, 'y': 0, 'width': 100, 'height': 100, 'attachmentId': a['attachmentId']}]
        with self.assertRaises(UserError):
            self.save(stolen)
        bad = self.Floor.browse(first['id']).waiter_read_plan()
        bad['images'] = bad['images'] + [{'id': 'z', 'x': 0, 'y': 0, 'width': 100, 'height': 100, 'data': 'bm8gZXMgaW1hZ2Vu'}]
        with self.assertRaises(UserError):
            self.save(bad)
        self.assertEqual(len(self.Floor.browse(first['id']).waiter_read_plan()['images']), 1)

    def test_wall_color_is_optional_persisted_and_validated(self):
        saved = self.save()
        self.assertNotIn('color', saved['walls'][0])
        painted = deepcopy(saved)
        painted['walls'][0]['color'] = '#9a3412'
        self.assertEqual(self.save(painted)['walls'][0]['color'], '#9a3412')
        broken = self.Floor.browse(saved['id']).waiter_read_plan()
        broken['walls'][0]['color'] = 'rojo'
        with self.assertRaises(UserError):
            self.save(broken)
        self.assertEqual(self.Floor.browse(saved['id']).waiter_read_plan()['walls'][0]['color'], '#9a3412')

    def test_decor_pieces_are_persisted_kept_by_older_clients_and_validated(self):
        plan = deepcopy(self.plan)
        plan['decor'] = [{'id': 'stairs', 'asset': 'stairs', 'rotation': 90, 'x': 400, 'y': 80, 'width': 200, 'height': 100, 'extra': 'x'},
                         {'id': 'plant', 'asset': 'plant', 'rotation': 0, 'x': 80, 'y': 80, 'width': 60, 'height': 60}]
        saved = self.save(plan)
        # Una planta encima de una mesa no la invalida: la decoración no choca, solo dibuja. Lo desconocido no se guarda.
        self.assertEqual([d['asset'] for d in saved['decor']], ['stairs', 'plant'])
        self.assertNotIn('extra', saved['decor'][0])
        older = deepcopy(saved)
        del older['decor']
        self.assertEqual(len(self.save(older)['decor']), 2)
        for broken in ({'asset': 'rocket'}, {'rotation': 45}, {'rotation': True}, {'width': 5}):
            bad = self.Floor.browse(saved['id']).waiter_read_plan()
            bad['decor'][0].update(broken)
            with self.assertRaises(UserError):
                self.save(bad)
        self.assertEqual(self.Floor.browse(saved['id']).waiter_read_plan()['decor'][0]['rotation'], 90)

    def delete(self, floor_id, token=None):
        return self.Floor.waiter_delete_floor(self.config.id, floor_id, self.employee.id, token or self.token)

    def test_delete_removes_a_floor_without_history_and_keeps_one_active(self):
        first, second = self.save()['id'], self.save({**self.plan, 'name': 'Segundo piso'})['id']
        tables = self.env['restaurant.table'].search([('floor_id', '=', second)])
        self.assertEqual(self.delete(second), {'id': second, 'result': 'removed'})
        self.assertFalse(self.Floor.with_context(active_test=False).browse(second).exists())
        self.assertFalse(tables.exists())
        others = self.Floor.search([('pos_config_ids', 'in', [self.config.id]), ('id', '!=', first)])
        for floor in others:
            self.delete(floor.id)
        with self.assertRaises(UserError):
            self.delete(first)
        self.assertTrue(self.Floor.browse(first).exists())

    # Hallazgo de la revisión con Codex. Falla si borrar un piso compartido con otro terminal lo borra o lo archiva para
    # todos: el otro terminal perdería el piso y sus mesas para siempre, aunque solo este quisiera soltarlo.
    def test_deleting_a_floor_shared_with_another_terminal_only_detaches_it(self):
        self.save()
        shared = self.save({**self.plan, 'name': 'Compartido'})['id']
        floor = self.Floor.browse(shared)
        bar = self.config.copy({'name': 'Barra de prueba'})
        floor.pos_config_ids = [(4, bar.id)]
        tables = floor.table_ids
        # Con la barra trabajando no se toca: Odoo no deja modificar un piso que un terminal tiene abierto.
        session = self.env['pos.session'].create({'config_id': bar.id})
        with self.assertRaises(UserError), self.cr.savepoint():
            self.delete(shared)
        self.assertEqual(floor.pos_config_ids, self.config | bar)
        # Con la barra cerrada, este terminal lo suelta y la barra lo conserva con sus mesas. Antes se borraba.
        session.write({'state': 'closed'})
        self.assertEqual(self.delete(shared), {'id': shared, 'result': 'detached'})
        self.assertTrue(floor.exists() and floor.active)
        self.assertEqual(floor.pos_config_ids, bar)
        self.assertTrue(tables.exists() and all(tables.mapped('active')))

    def test_delete_archives_and_detaches_a_floor_with_paid_history(self):
        keep, floor_id = self.save()['id'], self.save({**self.plan, 'name': 'Con historial'})['id']
        floor = self.Floor.browse(floor_id)
        table = floor.table_ids[0]
        session = self.env['pos.session'].create({'config_id': self.config.id, 'user_id': self.env.uid})
        order = self.env['pos.order'].create({'session_id': session.id, 'table_id': table.id, 'amount_tax': 0, 'amount_total': 0, 'amount_paid': 0, 'amount_return': 0, 'state': 'draft'})
        with self.assertRaises(UserError):
            self.delete(floor_id)
        order.write({'state': 'paid'})
        session.write({'state': 'closed'})
        self.assertEqual(self.delete(floor_id), {'id': floor_id, 'result': 'archived'})
        self.assertFalse(floor.active)
        self.assertNotIn(self.config, floor.pos_config_ids)
        self.assertFalse(table.active)
        self.assertEqual(order.table_id, table)
        self.assertTrue(self.Floor.browse(keep).active)

    def test_delete_enforces_pin_closed_cash_and_terminal_ownership(self):
        self.save()
        floor_id = self.save({**self.plan, 'name': 'Por borrar'})['id']
        with self.assertRaises(AccessError):
            self.delete(floor_id, token='otro')
        foreign = self.Floor.create({'name': 'De otro terminal'})
        with self.assertRaises(UserError):
            self.delete(foreign.id)
        session = self.env['pos.session'].create({'config_id': self.config.id, 'user_id': self.env.uid})
        with self.assertRaises(UserError):
            self.delete(floor_id)
        session.write({'state': 'closed'})
        self.assertEqual(self.delete(floor_id)['result'], 'removed')

    # Falla si el reparto de meseros vuelve a exigir caja abierta, si un turno nuevo no lo hereda, si ajustar un turno
    # cambia el reparto habitual, o si los avisos de cocina dejan de seguir al reparto que de verdad está vigente.
    def test_the_usual_staff_is_prepared_with_cash_closed_and_each_shift_inherits_or_overrides_it(self):
        saved = self.save()
        floor = self.Floor.browse(saved['id'])
        ana, beto = (self.env['hr.employee'].create({'name': n, 'company_id': self.env.company.id}) for n in ('Ana', 'Beto'))
        self.assertFalse(self.env['pos.session'].search_count([('config_id', '=', self.config.id), ('state', '!=', 'closed')]))
        self.Floor.waiter_assign_zone_staff(self.config.id, floor.id, {'zone': [ana.id]}, self.employee.id, self.token)
        self.assertEqual(floor.waiter_zone_staff_for(), {'assignments': {'zone': [ana.id]}, 'source': 'plan', 'plan': {'zone': [ana.id]}})
        with self.assertRaises(AccessError):
            self.Floor.waiter_assign_zone_staff(self.config.id, floor.id, {'zone': [beto.id]}, self.employee.id, 'otro')
        with self.assertRaises(UserError):
            self.Floor.waiter_assign_zone_staff(self.config.id, floor.id, {'no-existe': [ana.id]}, self.employee.id, self.token)
        session = self.env['pos.session'].create({'config_id': self.config.id})
        # El POS ya trata como abierta una caja en `opening_control`: el reparto del turno no puede rechazarla.
        self.assertEqual(session.state, 'opening_control')
        session.waiter_assign_zones(floor.id, {'zone': [beto.id]}, self.employee.id, self.token)
        self.assertEqual(floor.waiter_zone_staff_for(session.id)['source'], 'shift')
        session.waiter_assign_zones(floor.id, None, self.employee.id, self.token)
        session.set_opening_control(0, '')
        self.assertEqual(floor.waiter_zone_staff_for(session.id)['source'], 'plan')
        order = self.env['pos.order'].create({'session_id': session.id, 'table_id': saved['tables'][0]['id'], 'date_order': fields.Datetime.now(),
                                             'amount_tax': 0, 'amount_total': 0, 'amount_paid': 0, 'amount_return': 0})
        self.assertEqual(self.env['pos.order'].waiter_zone_targets(order.ids)[str(order.id)], [ana.id])
        session.waiter_assign_zones(floor.id, {'zone': [beto.id]}, self.employee.id, self.token)
        self.assertEqual(floor.waiter_zone_staff_for(session.id), {'assignments': {'zone': [beto.id]}, 'source': 'shift', 'plan': {'zone': [ana.id]}})
        self.assertEqual(self.env['pos.order'].waiter_zone_targets(order.ids)[str(order.id)], [beto.id])
        self.assertEqual(floor.waiter_zone_staff, {'zone': [ana.id]})
        session.waiter_assign_zones(floor.id, None, self.employee.id, self.token)
        self.assertEqual(floor.waiter_zone_staff_for(session.id)['source'], 'plan')
        order.unlink()

    # Falla si borrar una zona del plano deja su reparto colgando: el siguiente guardado lo rechazaría como «zona inexistente».
    def test_deleting_a_zone_forgets_who_was_assigned_to_it(self):
        saved = self.save()
        floor = self.Floor.browse(saved['id'])
        self.Floor.waiter_assign_zone_staff(self.config.id, floor.id, {'zone': [self.employee.id]}, self.employee.id, self.token)
        without = floor.waiter_read_plan()
        without['zones'] = []
        without['tables'][0]['zone'] = ''
        self.save(without)
        self.assertFalse(floor.waiter_zone_staff)  # Odoo guarda el Json vacío como False

    def test_assignments_are_per_session_and_allow_shared_zones(self):
        saved = self.save()
        waiter = self.env['hr.employee'].create({'name':'Mesero plano','company_id':self.env.company.id})
        session = self.env['pos.session'].create({'config_id':self.config.id})
        session.set_opening_control(0, '')
        members = [waiter.id, self.employee.id]
        session.waiter_assign_zones(saved['id'], {'zone':members}, self.employee.id, self.token)
        self.assertEqual(session.waiter_zone_assignments[str(saved['id'])]['zone'], members)
        order = self.env['pos.order'].create({'session_id': session.id, 'table_id': saved['tables'][0]['id'],
                    'date_order': fields.Datetime.now(), 'amount_tax': 0, 'amount_total': 0, 'amount_paid': 0, 'amount_return': 0})
        self.assertEqual(self.env['pos.order'].waiter_zone_targets(order.ids)[str(order.id)], members)
        order.unlink()
        with self.assertRaises(UserError):
            session.waiter_assign_zones(saved['id'], {'missing':members}, self.employee.id, self.token)
        with self.assertRaises(UserError):
            session.waiter_assign_zones(saved['id'], {'zone':[99999999]}, self.employee.id, self.token)
        session.write({'state':'closed'})
        next_session = self.env['pos.session'].create({'config_id':self.config.id})
        self.assertFalse(next_session.waiter_zone_assignments)
