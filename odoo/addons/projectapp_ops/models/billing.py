"""Revisión contable del POS. No transmite documentos ni acredita validación DIAN."""
from odoo import models
from odoo.exceptions import UserError
from .owner_permissions import require_owner


def _billing_access(env):
    require_owner(env)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _generate_pos_order_invoice(self):
        """Factura pedida al cobrar: action_pos_order_invoice y el POS nativo usan esta vía.

        La contabilidad interna puede leer los asientos que las reglas Q1 ocultan al cajero.
        Se valida primero el pedido con sus permisos y su restaurante; no se abre una API contable.
        """
        self.check_access('write')
        return super(PosOrder, self.sudo())._generate_pos_order_invoice()

    def _waiter_consumer_final(self, create=False):
        """Un tercero genérico por empresa; consultar no crea contactos."""
        self.ensure_one()
        company = self.company_id
        if create:
            self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [company.id])
        partners = self.env['res.partner'].with_company(company).with_context(active_test=False)
        partner = partners.search([('company_id', '=', company.id), ('vat', '=', '222222222222')], limit=1)
        if not partner and create:
            values = {'name': 'Consumidor final', 'vat': '222222222222', 'company_id': company.id,
                      'country_id': self.env.ref('base.co').id, 'customer_rank': 1, 'lang': 'es_CO'}
            # La identificación genérica no es un NIT real y no lleva dígito de verificación.
            if 'l10n_latam_identification_type_id' in partners._fields:
                identification = self.env['l10n_latam.identification.type'].search([
                    ('country_id.code', '=', 'CO'), ('l10n_co_document_code', '=', 'national_citizen_id')], limit=1)
                if identification:
                    values['l10n_latam_identification_type_id'] = identification.id
            partner = partners.create(values)
        return partner

    def waiter_billing_review(self, partner_id=False, consumer_final=False):
        """Consulta sin escrituras; los controles se repiten al contabilizar."""
        self.ensure_one()
        self = self.with_context(lang='es_CO', tz='America/Bogota')
        _billing_access(self.env)
        self.check_access('read')
        order = self.with_company(self.company_id)
        partner = (order._waiter_consumer_final() if consumer_final else
                   self.env['res.partner'].browse(partner_id).exists() if partner_id else order.partner_id)
        if partner:
            partner.check_access('read')
        issues = []
        currency = order.currency_id
        journal = order.config_id.invoice_journal_id
        if order.state not in ('paid', 'done', 'invoiced'):
            issues.append('La venta debe estar confirmada antes de contabilizarla.')
        if (not partner and not consumer_final) or (partner and not partner.active):
            issues.append('Selecciona un cliente contable activo, incluido consumidor final cuando corresponda.')
        elif partner.company_id and partner.company_id != order.company_id:
            issues.append('El cliente pertenece a otra empresa.')
        if not journal or journal.type != 'sale' or journal.company_id != order.company_id:
            issues.append('Configura el diario de ventas de esta empresa en el punto de venta.')
        if currency.name != 'COP' or order.company_id.currency_id.name != 'COP':
            issues.append('Este flujo del POS está preparado para ventas y contabilidad en COP.')
        if not order.lines:
            issues.append('La venta no contiene líneas.')
        if not currency.is_zero(sum(order.lines.mapped('price_subtotal_incl')) - order.amount_total):
            issues.append('El total de las líneas no coincide con la venta. Revisa los importes y el redondeo.')
        if not currency.is_zero(sum(l.price_subtotal_incl - l.price_subtotal for l in order.lines) - order.amount_tax):
            issues.append('Los impuestos de las líneas no coinciden con el total de impuestos de la venta.')
        if not currency.is_zero(sum(order.payment_ids.mapped('amount')) - order.amount_total):
            issues.append('Los pagos netos no coinciden con la venta. Revisa el cambio y los pagos registrados.')
        if partner and not partner.with_company(order.company_id).property_account_receivable_id:
            issues.append('Configura la cuenta por cobrar del cliente.')
        tip_lines = order.lines.filtered(lambda l: l.product_id == order.config_id.tip_product_id)
        for line in order.lines:
            account = line.product_id._get_product_accounts().get('income') or order.config_id.journal_id.default_account_id
            if order.fiscal_position_id and account:
                account = order.fiscal_position_id.map_account(account)
            if not account:
                issues.append('Falta la cuenta contable de %s.' % line.full_product_name)
            if line in tip_lines:
                if not account or account.account_type != 'liability_current':
                    issues.append('Configura la propina en una cuenta de pasivo corriente a favor del personal.')
                if line.tax_ids_after_fiscal_position:
                    issues.append('La propina voluntaria debe quedar separada y sin impuestos de venta.')
        return {
            'company': order.company_id.display_name,
            'journal': journal.display_name if journal else '',
            'currency': currency.name,
            'tip': sum(tip_lines.mapped('price_subtotal_incl')),
            'issues': list(dict.fromkeys(issues)),
            'ready': not issues,
        }

    def waiter_account_invoice(self, partner_id=False, consumer_final=False):
        """Cliente + factura en una transacción; bloqueo y reintento sin duplicados."""
        self.ensure_one()
        self = self.with_context(lang='es_CO', tz='America/Bogota')
        _billing_access(self.env)
        self.check_access('write')
        self.env.cr.execute('SELECT id FROM pos_order WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()
        if self.account_move:
            return self.account_move.id
        review = self.waiter_billing_review(partner_id, consumer_final)
        if not review['ready']:
            raise UserError('\n'.join(review['issues']))
        # Odoo conserva el vínculo venta/asiento y concilia los pagos sin registrar de nuevo el ingreso.
        # Se omite la generación/envío automático del PDF: la emisión fiscal será una etapa posterior.
        with self.env.cr.savepoint():
            self.partner_id = self._waiter_consumer_final(create=True) if consumer_final else partner_id
            self.with_context(generate_pdf=False).action_pos_order_invoice()
            move = self.account_move
            if not move or move.state != 'posted':
                raise UserError('No se pudo confirmar el asiento contable.')
            signed_total = -move.amount_total if move.move_type == 'out_refund' else move.amount_total
            if not self.currency_id.is_zero(signed_total - self.amount_total):
                raise UserError('La factura no coincide con el importe de la venta. Revisa impuestos y posición fiscal.')
            detail = move.waiter_accounting_detail()
            if not detail['ready']:
                raise UserError('\n'.join(detail['issues']))
        return move.id


class AccountMove(models.Model):
    _inherit = 'account.move'

    def waiter_accounting_detail(self):
        """Estado calculado del asiento real; nunca un check manual ni un estado fiscal."""
        self.ensure_one()
        self = self.with_context(lang='es_CO', tz='America/Bogota')
        _billing_access(self.env)
        self.check_access('read')
        lines = self.line_ids.filtered(lambda l: l.display_type not in ('line_section', 'line_note'))
        debit = sum(lines.mapped('debit'))
        credit = sum(lines.mapped('credit'))
        issues = []
        if self.state != 'posted':
            issues.append('El documento todavía no está contabilizado.')
        if not lines or not self.company_currency_id.is_zero(debit - credit):
            issues.append('El asiento debe contener partidas y tener débitos y créditos iguales.')
        if any(not line.account_id for line in lines):
            issues.append('Todas las partidas necesitan una cuenta contable.')
        tips = self.pos_order_ids.config_id.tip_product_id
        tip_lines = self.invoice_line_ids.filtered(lambda l: l.product_id in tips)
        if any(l.account_id.account_type != 'liability_current' or l.tax_ids for l in tip_lines):
            issues.append('Revisa la propina: debe registrarse en un pasivo corriente sin impuestos de venta.')
        return {
            'ready': not issues, 'issues': issues,
            'company': self.company_id.display_name, 'journal': self.journal_id.display_name,
            'date': str(self.date), 'origin': self.invoice_origin or '',
            'currency': self.currency_id.name, 'companyCurrency': self.company_currency_id.name,
            'untaxed': self.amount_untaxed, 'tax': self.amount_tax, 'total': self.amount_total,
            'residual': self.amount_residual, 'tip': sum(tip_lines.mapped('price_subtotal')),
            'debit': debit, 'credit': credit,
            'original': self.reversed_entry_id.name or ', '.join(self.pos_refunded_invoice_ids.mapped('name')),
            'lines': [{'id': l.id, 'account': '%s · %s' % (l.account_id.code, l.account_id.name), 'label': l.name or '',
                       'debit': l.debit, 'credit': l.credit} for l in lines],
            'taxes': [{'id': l.id, 'name': l.tax_line_id.display_name,
                       'amount': abs(l.amount_currency)} for l in lines if l.tax_line_id],
        }


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def waiter_billing_settings(self):
        self.ensure_one()
        self = self.with_context(lang='es_CO', tz='America/Bogota')
        # Esta API solo lee. La escritura se realiza en waiter_set_tip_account.
        self.check_access('read')
        config = self.with_company(self.company_id)
        tip = config.tip_product_id
        account = tip._get_product_accounts().get('income') if tip else False
        accounts = self.env['account.account'].search([
            ('company_ids', 'in', self.company_id.ids), ('account_type', '=', 'liability_current'),
        ], order='code')
        return {
            'company': self.company_id.display_name, 'journal': self.invoice_journal_id.display_name or '',
            'currency': self.company_id.currency_id.name, 'tipProduct': tip.display_name if tip else '',
            'tipAccountId': account.id if account else None,
            'tipAccount': '%s · %s' % (account.code, account.name) if account else '',
            'accounts': [{'id': a.id, 'name': '%s · %s' % (a.code, a.name)} for a in accounts],
        }

    def waiter_set_tip_account(self, account_id):
        self.ensure_one()
        self = self.with_context(lang='es_CO', tz='America/Bogota')
        _billing_access(self.env)
        self.check_access('write')
        account = self.env['account.account'].browse(account_id).exists()
        account.check_access('read')
        if not account or account.account_type != 'liability_current' or self.company_id not in account.company_ids:
            raise UserError('Selecciona una cuenta de pasivo corriente de esta empresa.')
        product = self.with_company(self.company_id).tip_product_id
        if not product:
            raise UserError('Configura primero el producto de propinas del POS.')
        product.property_account_income_id = account
        # No se modifican impuestos, posiciones fiscales ni documentos históricos.
        return self.waiter_billing_settings()
