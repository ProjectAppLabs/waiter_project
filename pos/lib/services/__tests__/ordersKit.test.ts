import { fireUnsentLines } from '@/lib/services/kitchen'
import { callKw } from '@/lib/services/odoo'
import { addRound, cancelLines, listHistoryOrders, listKitOrders, resetPresetCache } from '@/lib/services/ordersKit'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
jest.mock('@/lib/services/kitchen', () => ({ fireUnsentLines: jest.fn() }))
const mock = callKw as jest.Mock
const presets = [{ id: 1, service_at: 'table' }, { id: 2, service_at: 'counter' }]
const rawOrder = { id: 115, tracking_number: '112', preset_id: [2, 'Takeout'], floating_order_name: 'Eva', partner_id: false, table_id: false, date_order: '2026-09-06 23:37:59', amount_total: 86275, amount_tax: 13775, state: 'draft' }
const rawLine = { id: 228, uuid: 'u1', order_id: [115, 'x'], product_id: [3, 'Angus'], full_product_name: 'Hamburguesa Angus', qty: 1, price_unit: 36900, price_subtotal: 36900, price_subtotal_incl: 43911, customer_note: false, course_id: [114, 'c'] }
const rawCourse = { id: 114, order_id: [115, 'x'], fired: true, ready_date: false, served_date: '2026-09-06 23:38:06' }

beforeEach(() => { mock.mockReset(); resetPresetCache() })

it('preserves WhatsApp origin and customer phone from the POS', async () => {
  mock.mockResolvedValueOnce([{ ...rawOrder, waiter_channel: 'whatsapp', delivery_phone: '+573001234567' }])
    .mockResolvedValueOnce(presets).mockResolvedValueOnce([]).mockResolvedValueOnce([])
  const [order] = await listKitOrders(16, () => null)
  expect(order).toMatchObject({ channel: 'whatsapp', phone: '+573001234567', type: 'takeout', state: 'draft' })
})

// Falla si el listado no arma número DI/TA desde el preset, o si mezcla líneas y cursos de otro pedido.
it('lists open orders with their lines and courses, typed by preset', async () => {
  mock.mockResolvedValueOnce([rawOrder]).mockResolvedValueOnce(presets)
    .mockResolvedValueOnce([rawLine, { ...rawLine, id: 9, order_id: [8, 'y'] }]).mockResolvedValueOnce([rawCourse, { ...rawCourse, id: 5, order_id: [8, 'y'] }])
  const [o] = await listKitOrders(16, () => null)
  expect(o).toMatchObject({ id: 115, number: 'TA112', type: 'takeout', customer: 'Eva', tableNumber: null, total: 86275 })
  expect(o.lines).toEqual([{ id: 228, uuid: 'u1', productId: 3, name: 'Hamburguesa Angus', qty: 1, unitPrice: 36900, subtotal: 36900, total: 43911, note: '', courseId: 114, readyAt: null, servedAt: null }])
  expect(o.courses).toEqual([{ id: 114, fired: true, preparationAt: null, readyAt: null, servedAt: '2026-09-06 23:38:06' }])
  expect(mock.mock.calls[0][2][0]).toEqual([['session_id', '=', 16], ['state', '=', 'draft']])
})

// Falla si el historial deja de pedir solo pedidos pagados o pierde el número de mesa.
it('lists paid orders for the history with the table number resolved', async () => {
  mock.mockResolvedValueOnce([{ ...rawOrder, state: 'paid', preset_id: [1, 'Dine In'], table_id: [4, 'Terraza, 3'] }]).mockResolvedValueOnce(presets)
  const [o] = await listHistoryOrders((id) => (id === 4 ? 3 : null))
  expect(o).toMatchObject({ number: 'DI112', type: 'dine_in', tableNumber: 3, state: 'paid', lines: [] })
  expect(mock.mock.calls[0][2][0]).toEqual([['state', 'in', ['paid', 'done', 'invoiced']]])
})

// Falla si la ronda no escribe las líneas con sus impuestos, no recalcula en Odoo o no dispara el curso nuevo.
it('addRound writes the lines, recomputes prices and fires a new course', async () => {
  mock.mockResolvedValue(undefined)
  ;(fireUnsentLines as jest.Mock).mockResolvedValue(115)
  const draft = { uuid: 'u2', productId: 4, name: 'Papas Trufadas', unitPrice: 8900, qty: 2, note: 'sin sal', taxIds: [55] }
  await expect(addRound(115, [draft])).resolves.toBe(115)
  expect(mock.mock.calls[0]).toEqual(['pos.order', 'write', [[115], { lines: [[0, 0, expect.objectContaining({ product_id: 4, qty: 2, tax_ids: [[6, 0, [55]]], customer_note: 'sin sal' })]] }]])
  expect(mock.mock.calls[1]).toEqual(['pos.order', 'recompute_prices', [[115]]])
  expect(fireUnsentLines).toHaveBeenCalledWith(115)
})

// Falla si cancelar borra líneas sin recalcular el total, o si con lista vacía toca Odoo.
it('cancelLines unlinks the given lines and recomputes; does nothing with an empty list', async () => {
  mock.mockResolvedValue(true)
  await cancelLines(115, [229, 230])
  expect(mock.mock.calls).toEqual([['pos.order.line', 'waiter_cancel_lines', [[229, 230]]]])
  await cancelLines(115, [])
  expect(mock).toHaveBeenCalledTimes(1)
})
