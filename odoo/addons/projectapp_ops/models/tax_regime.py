"""Régimen tributario del restaurante: qué impuesto lleva la carta.

En Colombia un restaurante cobra **INC del 8 %** (art. 512-9 ET), no IVA. Hay dos excepciones que dependen
del restaurante y cambian de un año a otro, así que las decide su administrador, no el código:

- **Franquicia, concesión o regalía:** cobra IVA del 19 % en lugar del INC (art. 512-9 ET).
- **No responsable del INC:** no cobra impuesto. Exige cumplir las DOS condiciones del art. 512-13 ET:
  ingresos brutos del año anterior por la actividad por debajo de 3.500 UVT y un solo establecimiento.

La propina nunca entra en la base gravable ("en ningún caso la propina, por ser voluntaria, hará parte de
la base del impuesto nacional al consumo", art. 512-9), así que su producto queda siempre fuera de esto.

El cambio **reasigna el impuesto de los productos**; no edita impuestos. Editar un impuesto que ya usaron
pedidos del POS obliga a cerrar la caja, y eso no puede exigírsele al administrador para corregir su régimen.
"""
from odoo import models
from odoo.exceptions import AccessError, UserError

from .role_permissions import employee_role

REGIMES = ('inc', 'iva', 'none')
RATE = {'inc': 8.0, 'iva': 19.0}


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def _waiter_taxable_products(self):
        """Los platos y bebidas de la carta: lo que se consume.

        Quedan fuera los servicios (bonos de regalo, recargas de monedero): no son consumo en el
        establecimiento, así que cobrarles INC sería inventar un impuesto. Y queda fuera la propina, que por
        voluntaria no hace parte de la base (art. 512-9).
        """
        self.ensure_one()
        return self.env['product.template'].sudo().search([
            ('available_in_pos', '=', True),
            ('type', '=', 'consu'),
            ('company_id', 'in', [False, self.company_id.id]),
            ('id', 'not in', self.tip_product_id.product_tmpl_id.ids),
        ])

    def _waiter_regime_tax(self, regime):
        """El impuesto de venta de la empresa que corresponde al régimen, o un error que dice qué falta."""
        self.ensure_one()
        taxes = self.env['account.tax'].sudo().search([
            ('company_id', '=', self.company_id.id), ('type_tax_use', '=', 'sale'),
            ('amount_type', '=', 'percent'), ('amount', '=', RATE[regime]),
        ])
        # El 8 % es siempre INC; en el 19 % hay que descartar un INC del 19 % si la empresa lo tuviera.
        wanted = taxes.filtered(lambda t: ('INC' in t.name.upper()) == (regime == 'inc'))
        tax = (wanted or taxes)[:1]
        if not tax:
            raise UserError(self.env._(
                'No existe un impuesto de venta del %g %% en este restaurante. Créalo en Contabilidad antes de '
                'cambiar el régimen.') % RATE[regime])
        return tax

    def waiter_tax_regime(self, employee_id=None, token=None, regime=None):
        """Lee el régimen vigente; con `regime` lo cambia (solo administrador).

        El régimen se deduce de lo que llevan los productos, no de un campo aparte: así la pantalla no puede
        decir "INC 8 %" mientras la carta cobra otra cosa. Si los productos no coinciden entre sí, lo dice.
        """
        self.ensure_one()
        self.check_access('read')
        employee, role = employee_role(self.env, employee_id, token)
        if employee.company_id != self.company_id:
            raise AccessError(self.env._('El empleado no pertenece a este restaurante.'))

        products = self._waiter_taxable_products()
        if regime is not None:
            if role not in ('admin', 'owner'):
                raise AccessError(self.env._('Solo un administrador puede cambiar el régimen tributario.'))
            if regime not in REGIMES:
                raise UserError(self.env._('Régimen desconocido.'))
            self.check_access('write')
            products.write({'taxes_id': [(6, 0, self._waiter_regime_tax(regime).ids if regime != 'none' else [])]})
            # La propina no se limita a quedar fuera del cambio: se le retira cualquier impuesto de venta.
            # Odoo le pone el de la empresa al crearla, y una propina gravada contradice el art. 512-9 y
            # bloquea la facturación (la revisión contable la exige sin impuestos y en cuenta de pasivo).
            tip = self.tip_product_id.product_tmpl_id
            if tip.taxes_id:
                tip.sudo().write({'taxes_id': [(6, 0, [])]})

        rates = {round(t.amount, 2) for p in products for t in p.taxes_id.filtered(lambda t: t.type_tax_use == 'sale')}
        untaxed = any(not p.taxes_id.filtered(lambda t: t.type_tax_use == 'sale') for p in products)
        current = 'none' if not rates and products else next(
            (key for key, rate in RATE.items() if rates == {rate}), 'mixed' if rates else 'none')
        return {
            'regime': 'mixed' if (rates and untaxed) or current == 'mixed' else current,
            'products': len(products),
            'taxes': sorted(rates),
        }
