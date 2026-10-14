import type { CoreOrder, CoreLine } from '@/lib/services/core/sales'

export const coreLine = (patch: Partial<CoreLine> = {}): CoreLine => ({
  id: 1, uuid: 'linea-1', product_id: 3, name: 'Angus', qty: 2, unit_price: 36900, subtotal: 68000, total: 73800,
  note: '', options: [], parent_id: null, discount_pct: 0, course_id: null, ready_at: null, served_at: null, cancelled: false, ...patch,
})
export const coreOrder = (patch: Partial<CoreOrder> = {}): CoreOrder => ({
  id: 13, uuid: 'pedido-13', number: 'DI013', tracking: 13, service: 'dine_in', state: 'draft', origin: 'waiter', channel: 'pos',
  table_id: 9, table_number: 8, guests: 2, baby_chair: false, customer_name: 'Zahir', delivery_address: '', delivery_phone: '',
  note: '', billing: false, created_at: '2026-10-02T12:00:00Z', paid_at: null, waiter: null,
  subtotal: 68000, tax: 5800, tip: 0, total: 73800, paid: 20000, change: 0, lines: [coreLine()], courses: [], payments: [], ...patch,
})
