import { callKw } from '@/lib/services/odoo'
import { getOrderDetail, listAllFloors, listTableReservations, moveOrder, reservedAtByTable, saveFloorLayout } from '@/lib/services/tables'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const m = callKw as jest.Mock

const ORDER = { id: 9, tracking_number: '104', pos_reference: 'Order 00009', preset_id: false, floating_order_name: 'Eva', date_order: '2026-09-06 17:24:00', amount_total: 87822 }
const LINES = [
  { id: 1, uuid: 'a', product_id: [3, 'Angus'], full_product_name: 'Hamburguesa Angus', qty: 1, price_unit: 36900, price_subtotal_incl: 43911, customer_note: 'Sin cebolla', attribute_value_ids: [7], course_id: [1, 'C1'] },
  { id: 2, uuid: 'b', product_id: [6, 'Club'], full_product_name: 'Club Colombia', qty: 2, price_unit: 14000, price_subtotal_incl: 33320, customer_note: false, attribute_value_ids: [], course_id: [2, 'C2'] },
  { id: 3, uuid: 'c', product_id: [8, 'Papas'], full_product_name: 'Papas', qty: 1, price_unit: 9000, price_subtotal_incl: 10710, customer_note: false, attribute_value_ids: [], course_id: false },
]
const COURSES = [
  { id: 1, fired: true, ready_date: '2026-09-06 17:35:00', served_date: '2026-09-06 17:40:00' },
  { id: 2, fired: true, ready_date: '2026-09-06 17:44:00', served_date: false },
]
const byModel = (model: string, method: string) => {
  if (model === 'pos.order') return [ORDER]
  if (model === 'pos.order.line') return LINES
  if (model === 'restaurant.order.course') return COURSES
  if (model === 'product.template.attribute.value') return [{ id: 7, name: 'Queso extra' }]
  return method === 'create' ? 42 : []
}

beforeEach(() => { m.mockReset(); m.mockImplementation(async (model: string, method: string) => byModel(model, method)) })

// Falla si el plato de un curso entregado no sale "servido", si el que cocina ya dejó en el pase no sale "listo",
// si el que aún no se envió no queda "sin enviar", o si las adiciones (attribute_value_ids) pierden su nombre.
// El % del kit se calcula sobre lo enviado (2), no sobre las 3 líneas.
it('reads the order detail with per-line status, additions and sent/served counts', async () => {
  const d = await getOrderDetail(9)
  expect(d).toMatchObject({ tracking: '104', serviceAt: null, customerName: 'Eva', total: 87822, sent: 2, served: 1 })
  expect(d.lines.map((l) => [l.name, l.status])).toEqual([['Hamburguesa Angus', 'served'], ['Club Colombia', 'ready'], ['Papas', 'unsent']])
  expect(d.lines[0]).toMatchObject({ additions: ['Queso extra'], note: 'Sin cebolla', total: 43911, productId: 3 })
})

// Falla si un pedido con preset "Take Away" (service_at counter) deja de leer su preset: el código saldría DI.
it('reads the preset service to build the kit prefix', async () => {
  m.mockImplementation(async (model: string, method: string) => (model === 'pos.preset' ? [{ id: 2, service_at: 'counter' }] : model === 'pos.order' ? [{ ...ORDER, preset_id: [2, 'Take Away'] }] : byModel(model, method)))
  expect((await getOrderDetail(9)).serviceAt).toBe('counter')
})

// Falla si se mueve el pedido a una mesa que otra tablet acaba de ocupar: la validación es en Odoo, no solo local.
it('refuses to move an order onto a table with another open order', async () => {
  m.mockResolvedValueOnce(1)
  await expect(moveOrder(9, 5)).rejects.toThrow('ya tiene un pedido')
  m.mockResolvedValueOnce(0).mockResolvedValueOnce(true)
  await moveOrder(9, 5)
  expect(m.mock.calls[2]).toEqual(['pos.order', 'write', [[9], { table_id: 5 }]])
})

// Falla si el piso nuevo no queda ligado a la caja (no aparecería en load_data), si la geometría no llega a
// restaurant.table o si las mesas borradas siguen activas.
it('creates the floor bound to the config, creates and updates its tables and removes the dropped ones', async () => {
  const id = await saveFloorLayout({ id: null, name: 'Piso 4 · Exterior', configId: 1, background: 'AAAA' },
    [{ id: null, number: 41, seats: 4, x: 40, y: 40, width: 120, height: 120 }, { id: 12, number: 42, seats: 6, x: 200, y: 40, width: 240, height: 120 }], [13])
  expect(id).toBe(42)
  expect(m.mock.calls[0]).toEqual(['restaurant.floor', 'create', [{ name: 'Piso 4 · Exterior', floor_background_image: 'AAAA', pos_config_ids: [[4, 1]] }]])
  expect(m.mock.calls[1][2][0][0]).toMatchObject({ table_number: 41, floor_id: 42, position_h: 40, width: 120, seats: 4, shape: 'square' })
  expect(m.mock.calls[2]).toEqual(['restaurant.table', 'write', [[12], { table_number: 42, seats: 6, position_h: 200, position_v: 40, width: 240, height: 120, shape: 'square', active: true }]])
  expect(m.mock.calls[3]).toEqual(['restaurant.table', 'unlink', [[13]]])
})

// Falla si editar un piso toca la imagen de fondo sin que el usuario la cambiara, o si lee pisos de otra caja.
it('writes an existing floor without touching its background and lists floors of the config including inactive', async () => {
  await saveFloorLayout({ id: 7, name: 'Piso 2', configId: 1 }, [])
  expect(m.mock.calls[0]).toEqual(['restaurant.floor', 'write', [[7], { name: 'Piso 2' }]])
  m.mockResolvedValueOnce([{ id: 7, name: 'Piso 2', active: false, table_ids: [1, 2] }])
  await expect(listAllFloors(1)).resolves.toEqual([{ id: 7, name: 'Piso 2', active: false, tableCount: 2 }])
  expect(m.mock.calls[1][2][0]).toEqual([['active', 'in', [true, false]], ['pos_config_ids', 'in', [1]]])
})

// Falla si el plano deja de preguntar por las reservas del día a restaurant.table.waiter_reserved_at, o si las
// claves que el RPC devuelve como texto ("2") no vuelven a ser ids numéricos del plano.
it('reads the next reservation of each table for the plan', async () => {
  m.mockImplementation(async () => ({ '2': { id: 5, label: '17:00', customer_name: 'Eva', time_start: 17 }, '3': false }))
  const map = await reservedAtByTable([2, 3], '2026-09-07')
  expect(m).toHaveBeenCalledWith('restaurant.table', 'waiter_reserved_at', [[2, 3], '2026-09-07'])
  expect(map[2]).toMatchObject({ id: 5, label: '17:00', customerName: 'Eva' })
  expect(map[3]).toBeNull()
})

// Falla si la lista de reservas de una mesa trae las canceladas o las de otras mesas, o si pierde la hora del kit.
// Falla si la lista de una mesa deja de incluir las reservas de grupo en las que esa mesa es secundaria (la principal
// es otra): se busca por `table_ids` y la tarjeta se cuelga de la mesa consultada.
it('lists the active reservations of one table, also when it is a secondary table of a group', async () => {
  m.mockImplementation(async () => [{ id: 5, name: 'Rv001', customer_name: 'Eva', date: '2026-09-07', time_start: 10, time_end: 11, people: 2, baby_chair: true, state: 'confirmed', table_id: [9, 'Mesa 7'] }])
  const rows = await listTableReservations(2)
  expect(m.mock.calls[0][2][0]).toEqual([['table_ids', 'in', [2]], ['state', 'in', ['confirmed', 'seated']]])
  expect(rows[0]).toMatchObject({ name: 'Rv001', customerName: 'Eva', timeLabel: '10:00 – 11:00', people: 2, babyChair: true, tableId: 2 })
})


it('distinguishes unsent dishes, received tickets and preparation started in kitchen', async () => {
  m.mockImplementation(async (model: string, method: string) => model === 'restaurant.order.course'
    ? [{ id: 1, fired: true, preparation_date: false }, { id: 2, fired: true, preparation_date: '2026-09-21 12:00:00' }]
    : byModel(model, method))
  const d = await getOrderDetail(9)
  expect(d.lines.map((line) => line.status)).toEqual(['waiting', 'progress', 'unsent'])
  expect(d.sent).toBe(2)
})
