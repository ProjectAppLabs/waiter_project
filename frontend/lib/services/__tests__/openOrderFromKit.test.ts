import type { KitOrder } from '@/lib/domain/orderState'
import { openOrderFromKit } from '@/lib/services/orders'

const order = (patch: Partial<KitOrder> = {}): KitOrder => ({
  id: 5, number: 'DI005', type: 'dine_in', state: 'draft', tableId: 3, tableNumber: 7, customer: '', startedAt: '2026-09-21 18:00:00',
  total: 45000, tax: 7000, lines: [{ id: 1 } as never, { id: 2 } as never], courses: [], waiter: 'Sofía Mesera', tracking: '012', ...patch,
})

// La fila del salón ahora se deriva del pedido completo en vez de pedirse aparte. Falla si deja de coincidir con la
// que armaba listOpenOrders: de ella sale el color de cada mesa (libre, en cocina, listo) y quién la atiende, y
// `unsent` (líneas sin curso disparado) enciende el aviso de «pendiente por enviar» en el plano.
it('builds the same salon row that listOpenOrders used to fetch', () => {
  expect(openOrderFromKit(order())).toEqual({ id: 5, tableId: 3, total: 45000, tax: 7000, state: 'draft', lineCount: 2,
    startedAt: '2026-09-21 18:00:00', waiter: 'Sofía Mesera', kitchen: 'none', tracking: '012', unsent: true })
  const sent = order({ lines: [{ id: 1, courseId: 9 } as never], courses: [{ id: 9, fired: true } as never] })
  expect(openOrderFromKit(sent)?.unsent).toBe(false)
})

// Falla si la fase de cocina cuenta cursos que no se han enviado (listCourseSummaries solo lee los disparados).
it('takes the kitchen phase from fired courses only', () => {
  const course = (fired: boolean, readyAt: string | null, servedAt: string | null) => ({ id: 1, fired, readyAt, servedAt })
  expect(openOrderFromKit(order({ courses: [course(false, null, null)] }))?.kitchen).toBe('none')
  expect(openOrderFromKit(order({ courses: [course(true, null, null)] }))?.kitchen).toBe('cooking')
  expect(openOrderFromKit(order({ courses: [course(true, 'x', null)] }))?.kitchen).toBe('ready')
  expect(openOrderFromKit(order({ courses: [course(true, 'x', 'y')] }))?.kitchen).toBe('served')
})

// Falla si un pedido para llevar o a domicilio (sin mesa) o ya cobrado entra al plano del salón.
it('leaves out orders without a table and orders already paid', () => {
  expect(openOrderFromKit(order({ tableId: null }))).toBeNull()
  expect(openOrderFromKit(order({ state: 'paid' }))).toBeNull()
})
