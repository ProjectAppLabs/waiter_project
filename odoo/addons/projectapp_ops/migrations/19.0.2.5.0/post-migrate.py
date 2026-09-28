"""Conserva el primer restaurante y traslada sus ajustes a la organización."""
from odoo import api, SUPERUSER_ID, Command


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    params = env['ir.config_parameter'].sudo()
    configs = env['pos.config'].with_context(active_test=False).search([], order='id')
    if not configs:
        return
    first = configs[:1]
    for company in configs.company_id:
        primary = configs.filtered(lambda c: c.company_id == company)[:1]
        # Las columnas anteriores siguen disponibles aunque los campos ahora se calculen desde la empresa.
        cr.execute('SELECT signup_discount_percent, waiter_menu_banners, waiter_banners_configured FROM pos_config WHERE id = %s', [primary.id])
        percent, banners, configured = cr.fetchone()
        from odoo.addons.projectapp_ops.models.menu_banners import _WRITE
        company.with_context(_banner_write=_WRITE).write({
            'signup_discount_percent': percent if percent is not None else 5,
            'waiter_menu_banners': banners or [], 'waiter_banners_configured': bool(configured),
        })
        for config in configs.filtered(lambda c: c.company_id == company):
            config.write({
                'waiter_slug': config.waiter_slug or (params.get_param('projectapp.venue_slug') or 'poblado')
                               if config == first else config.waiter_slug or 'restaurante-%s' % config.id,
                'waiter_street': config.waiter_street or company.street,
                'waiter_city': config.waiter_city or company.city,
                'waiter_phone': config.waiter_phone or company.phone,
                'waiter_latitude': config.waiter_latitude or company.waiter_latitude,
                'waiter_longitude': config.waiter_longitude or company.waiter_longitude,
            })
        # Primero rellena ambas relaciones; así las restricciones nunca ven una asignación a medias.
        cr.execute('''INSERT INTO waiter_user_config_rel (user_id, config_id)
                      SELECT id, %s FROM res_users u WHERE company_id = %s AND NOT EXISTS
                      (SELECT 1 FROM waiter_user_config_rel r WHERE r.user_id = u.id) ON CONFLICT DO NOTHING''',
                   [primary.id, company.id])
        cr.execute('''INSERT INTO waiter_employee_config_rel (employee_id, config_id)
                      SELECT id, %s FROM hr_employee e WHERE company_id = %s AND NOT EXISTS
                      (SELECT 1 FROM waiter_employee_config_rel r WHERE r.employee_id = e.id) ON CONFLICT DO NOTHING''',
                   [primary.id, company.id])
    env.invalidate_all()
    technical = env['res.users'].with_context(active_test=False).search([('login', '=', 'admin')])
    technical.write({'waiter_role': 'owner', 'waiter_config_ids': [Command.set(configs.ids)],
                     'group_ids': [Command.link(env.ref('projectapp_ops.group_waiter_owner').id)]})
    configs._waiter_sync_employee_lists()
    if not params.get_param('waiter.role_permissions'):
        old = params.get_param('waiter.role_permissions.%s' % first.id)
        if old:
            params.set_param('waiter.role_permissions', old)
    # La acción del primer config prevalece en caso de antiguas configuraciones divergentes.
    cr.execute('''UPDATE waiter_benefit_action a SET company_id = c.company_id
                  FROM pos_config c WHERE c.id = a.config_id''')
    cr.execute('''DELETE FROM waiter_benefit_action a USING waiter_benefit_action b
                  WHERE a.company_id = b.company_id AND a.action = b.action AND a.id > b.id''')
    cr.execute('UPDATE waiter_benefit_action SET config_id = NULL')
    cr.execute('ALTER TABLE waiter_benefit_action DROP CONSTRAINT IF EXISTS waiter_benefit_action_config_action_unique')
    cr.execute('CREATE UNIQUE INDEX IF NOT EXISTS waiter_benefit_action_org_action ON waiter_benefit_action(company_id, action)')
    env.invalidate_all()
    if tuple(int(part) for part in version.split('.')) < (19, 0, 2, 4, 0):
        # La migración intermedia se ejecuta con los modelos nuevos; conserva el porcentaje físico anterior.
        for company in configs.company_id:
            percent = company.signup_discount_percent
            action = env['waiter.benefit.action'].with_context(active_test=False).search([
                ('company_id', '=', company.id), ('action', '=', 'cuenta')])
            values = {'company_id': company.id, 'action': 'cuenta', 'reward': 'descuento',
                      'active': percent > 0, 'percent': percent if percent > 0 else 5}
            if action:
                action.write(values)
            else:
                env['waiter.benefit.action'].create(values)
    # Los cupones del menú ya emitidos pasan a valer en todos los restaurantes del grupo.
    env['loyalty.program'].with_context(active_test=False).search([('waiter_menu_coupon', '=', True)]).write({
        'pos_config_ids': [Command.clear()],
    })
    env.invalidate_all()
