"""Ayudas comunes de las pruebas de Waiter."""


def single_restaurant(env):
    """Deja activo solo el primer restaurante de la organización durante la prueba (se revierte con su transacción).

    Las pruebas anteriores al plan O se escribieron para una organización con un solo restaurante: dan de alta
    terminales y empleados sin asignarles restaurante y operan sin elegirlo, que es lo que el producto hace cuando hay uno
    solo. La base de desarrollo que copian puede tener ya varios (p. ej. Poblado y Laureles).
    """
    configs = env['pos.config'].sudo().search([('company_id', '=', env.company.id)], order='id')
    (configs - configs[:1]).write({'active': False})
    return configs[:1]
