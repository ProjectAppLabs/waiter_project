"""Importa copias históricas sin ejecutar servicios de cobro ni efectos operativos."""
from collections import defaultdict
from uuid import UUID, uuid5, NAMESPACE_URL

from catalog.services import valid
from sales.models import CashShift, Order, OrderLine, Course, Payment
from .base import oid, stamp, dec, parsed


def historical_uuid(org, model, row):
    if row.get('uuid'):
        return UUID(row['uuid'])
    return uuid5(NAMESPACE_URL, f'{org.pk}:odoo:{model}:{row["id"]}')


class HistoryImport:
    def history(self):
        config_ids = [c['id'] for c in self.configs]
        for r in self.read('pos.session', 'config_id state user_id waiter_closed_by_id start_at stop_at cash_register_balance_start '
            'cash_register_balance_end cash_register_balance_end_real opening_notes closing_notes waiter_zone_assignments', [('config_id', 'in', config_ids)]):
            if r['state'] != 'closed':
                self.skip('pos.session', 'turno no cerrado')
                continue
            expected, counted = dec(r.get('cash_register_balance_end')), dec(r.get('cash_register_balance_end_real'))
            staff = {str(self.ref('restaurant.floor', int(floor)).pk):
                {zone: [self.ref('hr.employee', employee).pk for employee in employees] for zone, employees in zones.items()}
                for floor, zones in parsed(r.get('waiter_zone_assignments'), {}).items()}
            self.upsert('pos.session', r, CashShift, dict(restaurant=self.ref('pos.config', r['config_id']), state='closed', zone_staff=staff,
                opened_by=self.ref('res.users', r['user_id']), closed_by=self.ref('res.users', r.get('waiter_closed_by_id') or r['user_id']),
                # Una sesión de Odoo cerrada sin abrir (de «opening_control» directo a cerrada) no tiene start_at: vale su cierre.
                opened_at=stamp(r['start_at'] or r['stop_at']), closed_at=stamp(r['stop_at']), opening_cash=dec(r.get('cash_register_balance_start')),
                expected_cash=expected, counted_cash=counted, difference=counted - expected,
                opening_notes=r.get('opening_notes') or '', closing_notes=r.get('closing_notes') or ''))
        orders = list(self.read('pos.order', 'name uuid config_id session_id state date_order user_id employee_id partner_id table_id customer_count '
            'baby_chair waiter_origin waiter_channel waiter_channel_request waiter_prefix waiter_number delivery_address delivery_phone general_note amount_total amount_tax amount_paid amount_return',
            [('config_id', 'in', config_ids)]))
        paid = []
        for r in orders:
            if r['state'] not in ('paid', 'done', 'invoiced'):
                self.skip('pos.order', 'pedido no pagado')
                continue
            if not self.mapping('pos.session', oid(r['session_id'])):
                raise ValueError(f"El pedido pagado {r['id']} está en un turno no cerrado; cierra las cajas antes de migrar.")
            paid.append(r)
            prefix = r.get('waiter_prefix') or ('DI' if r.get('table_id') else 'TA')
            valid(prefix in ('DI', 'TA', 'DE'), 'Prefijo histórico desconocido.')
            total, tax = dec(r['amount_total']), dec(r['amount_tax'])
            employee = self.ref('hr.employee', r.get('employee_id'), True) if r.get('employee_id') else self.ref('res.users', r.get('user_id'), True)
            self.upsert('pos.order', r, Order, dict(organization=self.org, restaurant=self.ref('pos.config', r['config_id']),
                shift=self.ref('pos.session', r['session_id']), uuid=historical_uuid(self.org, 'pos.order', r),
                service={'DI': 'dine_in', 'TA': 'takeout', 'DE': 'delivery'}[prefix], prefix=prefix, tracking=r['id'],
                number=str(r.get('waiter_number') or r['name']), state='paid', table=self.ref('restaurant.table', r.get('table_id'), True),
                guests=r.get('customer_count') or 1, baby_chair=r.get('baby_chair', False), customer=self.ref('res.partner', r.get('partner_id'), True),
                created_by=employee, paid_by=employee, created_at=stamp(r['date_order']), paid_at=stamp(r['date_order']),
                origin=r.get('waiter_origin') or 'waiter', channel=r.get('waiter_channel') or ('menu' if r.get('waiter_origin') == 'diner' else 'pos'),
                channel_request=r.get('waiter_channel_request') or '',
                delivery_address=r.get('delivery_address') or '', delivery_phone=r.get('delivery_phone') or '', note=r.get('general_note') or '',
                total=total, tax=tax, tip=0, subtotal=total-tax, paid=dec(r.get('amount_paid')), change=dec(r.get('amount_return'))))
        ids = [r['id'] for r in paid]
        for r in self.read('restaurant.order.course', 'order_id index fired_date preparation_date ready_date served_date', [('order_id', 'in', ids)]):
            self.upsert('restaurant.order.course', r, Course, dict(order=self.ref('pos.order', r['order_id']), index=r['index'],
                fired_at=stamp(r.get('fired_date')) or self.ref('pos.order', r['order_id']).created_at,
                preparation_at=stamp(r.get('preparation_date')), ready_at=stamp(r.get('ready_date')), served_at=stamp(r.get('served_date'))))
        lines = list(self.read('pos.order.line', 'order_id uuid product_id full_product_name qty price_unit discount price_subtotal price_subtotal_incl '
            'tax_ids tax_ids_after_fiscal_position course_id waiter_ready_date served_date waiter_cancelled note customer_note combo_parent_id waiter_loyalty_card_id points_cost waiter_coupon_code', [('order_id', 'in', ids)]))
        for r in lines:
            product = self.ref('product.product', r['product_id'])
            order = self.ref('pos.order', r['order_id'])
            config = next(c for c in self.configs if c['id'] == order.restaurant.legacy_odoo_config_id)
            if oid(config.get('tip_product_id')) == oid(r['product_id']):
                order.tip += dec(r['price_subtotal_incl'])
                order.subtotal -= dec(r['price_subtotal'])
                order.save(update_fields=['tip', 'subtotal'])
                self.skip('pos.order.line', 'propina separada de las ventas')
                continue
            qty = dec(r['qty'])
            valid(qty > 0, f"La línea histórica {r['id']} es una devolución o descuento con cantidad no positiva; requiere conciliación.")
            taxes = [self.ref('account.tax', i) for i in r.get('tax_ids_after_fiscal_position', r.get('tax_ids', []))]
            # price_unit de Odoo puede excluir impuesto; el destino siempre conserva precio final.
            factor = 1 + sum((t.amount / 100 for t in taxes if not t.included), dec(0))
            self.upsert('pos.order.line', r, OrderLine, dict(order=order, uuid=historical_uuid(self.org, 'pos.order.line', r),
                product=product, name=r.get('full_product_name') or product.name, qty=qty, unit_price=(dec(r['price_unit']) * factor).quantize(dec('0.01')),
                taxes=[dict(id=t.pk, name=t.name, amount=float(t.amount), included=True) for t in taxes],
                discount_pct=dec(r.get('discount')), subtotal=dec(r['price_subtotal']), total=dec(r['price_subtotal_incl']),
                course=self.ref('restaurant.order.course', r.get('course_id'), True), ready_at=stamp(r.get('waiter_ready_date')),
                served_at=stamp(r.get('served_date')), cancelled=r.get('waiter_cancelled', False),
                note=r.get('customer_note') or r.get('note') or '', coupon_code=r.get('waiter_coupon_code') or '',
                loyalty_card=self.ref('loyalty.card', r.get('waiter_loyalty_card_id'), True), points_cost=dec(r.get('points_cost'))))
        for r in lines:
            if r.get('combo_parent_id'):
                line, parent = self.ref('pos.order.line', r['id']), self.ref('pos.order.line', r['combo_parent_id'])
                valid(line.order_id == parent.order_id, 'El padre del combo pertenece a otro pedido.')
                line.parent = parent
                line.save(update_fields=['parent'])
        payments = list(self.read('pos.payment', 'pos_order_id payment_method_id amount payment_date', [('pos_order_id', 'in', ids)]))
        change = defaultdict(lambda: dec(0))
        for r in payments:
            if dec(r['amount']) < 0:
                method = self.ref('pos.payment.method', r['payment_method_id'])
                valid(method.type == 'cash', 'Hay un pago negativo que no es cambio en efectivo; concílialo antes de importar.')
                change[oid(r['pos_order_id']), oid(r['payment_method_id'])] -= dec(r['amount'])
        for r in payments:
            if dec(r['amount']) <= 0:
                self.skip('pos.payment', 'cambio o pago de importe no positivo')
                continue
            key = oid(r['pos_order_id']), oid(r['payment_method_id'])
            returned = min(change[key], dec(r['amount']))
            change[key] -= returned
            amount = dec(r['amount']) - returned
            if not amount:
                self.skip('pos.payment', 'entrega de efectivo devuelta completamente')
                continue
            method = self.ref('pos.payment.method', r['payment_method_id'])
            self.upsert('pos.payment', r, Payment, dict(organization=self.org, order=self.ref('pos.order', r['pos_order_id']),
                method=method, amount=amount, received=dec(r['amount']) if method.type == 'cash' else None,
                request_key=f'odoo:payment:{r["id"]}', created_at=stamp(r['payment_date'])))
        valid(not any(change.values()), 'El cambio supera los pagos en efectivo del pedido.')
        for r in paid:
            order = self.ref('pos.order', r['id'])
            total = sum((line.total for line in order.lines.all()), dec(0)) + order.tip
            payments_total = sum((payment.amount for payment in order.payments.all()), dec(0))
            valid(total == order.total and payments_total == order.total,
                f'El pedido histórico {r["id"]} no concilia líneas, propina y pagos; no se importará parcialmente.')
            order.paid = payments_total
            order.save(update_fields=['paid'])
