import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { getOrderDetail, listAllFloors, listTableReservations, moveOrder, reservedAtByTable, saveFloorLayout } from '@/lib/services/tables'
import { CoreError } from '@/lib/services/core/http'
import { coreOrder, coreLine } from '@/lib/testFixtures/core'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
// Falla si se confunden platos servidos, listos y sin enviar, o se pierden las adiciones.
it('calcula estados y cantidades del detalle', async () => {
 m.mockResolvedValue({ order: coreOrder({ lines: [coreLine({ course_id: 1, options: [{ group: 'extra', name: 'Queso', price_extra: 100 }] }), coreLine({ id: 2, course_id: 2 }), coreLine({ id: 3 })], courses: [
 { id: 1, fired_at: '', served_at: '2026-10-02T13:00:00Z' }, { id: 2, fired_at: '', ready_at: '2026-10-02T13:00:00Z' },
 ] as never }) })
 const detail = await getOrderDetail(13)
 expect(detail).toMatchObject({ sent: 2, served: 1, serviceAt: 'table' })
 expect(detail.lines.map((l) => l.status)).toEqual(['served', 'ready', 'unsent'])
 expect(detail.lines[0].additions).toEqual(['Queso'])
})
// Falla si se confunden comandas recibidas y preparación iniciada.
it('distingue espera y preparación', async () => {
 m.mockResolvedValue({ order: coreOrder({ service: 'takeout', lines: [coreLine({ course_id: 1 }), coreLine({ id: 2, course_id: 2 })], courses: [{ id: 1 }, { id: 2, preparation_at: '2026-10-02T13:00:00Z' }] as never }) })
 const detail = await getOrderDetail(13)
 expect(detail.serviceAt).toBe('counter')
 expect(detail.lines.map((l) => l.status)).toEqual(['waiting', 'progress'])
})
// Falla si mover un pedido oculta el conflicto de mesa que detecta el servidor.
it('propaga el rechazo de una mesa ocupada', async () => {
 m.mockRejectedValueOnce(new CoreError(409, 'table_occupied', 'La mesa ya tiene un pedido'))
 await expect(moveOrder(13, 5)).rejects.toThrow('ya tiene un pedido')
 m.mockResolvedValue({ order: coreOrder() }); await moveOrder(13, 5)
 expect(m).toHaveBeenLastCalledWith('orders/13', { method: 'PATCH', body: { table_id: 5 } })
})
// Falla si el piso no queda en su sede o la geometría no llega al plano guardado.
it('crea y guarda el plano con sus mesas', async () => {
 m.mockResolvedValueOnce({ floor: { id: 42 } }).mockResolvedValueOnce({ id: 42, revision: 1, walls: [], zones: [], tables: [] }).mockResolvedValueOnce({})
 await expect(saveFloorLayout({ id: null, name: 'Exterior', configId: 1, background: 'AAAA' }, [{ id: null, number: 41, seats: 4, x: 40, y: 40, width: 120, height: 120 }], [13])).resolves.toBe(42)
 expect(m.mock.calls[0]).toEqual(['floors', { method: 'POST', body: { restaurant_id: 1, name: 'Exterior' } }])
 expect(m.mock.calls[2]).toEqual(['floors/42/plan', { method: 'PUT', body: expect.objectContaining({ background: 'AAAA', tables: [expect.objectContaining({ number: 41, x: 40, width: 120 })] }) }])
})
// Falla si editar sin imagen borra el fondo o deja de incluir pisos inactivos.
it('conserva fondo e incluye pisos inactivos', async () => {
 m.mockResolvedValueOnce({ id: 7, revision: 1, tables: [], walls: [], zones: [] }).mockResolvedValueOnce({}).mockResolvedValueOnce({ floors: [{ id: 7, name: 'Piso 2', active: false, table_count: 2, tables: [{ id: 1, active: true }, { id: 2, active: true }] }] })
 await saveFloorLayout({ id: 7, name: 'Piso 2', configId: 1 }, [])
 expect(m.mock.calls[1][1]).toMatchObject({ body: { background: true } })
 expect(await listAllFloors(1)).toEqual([{ id: 7, name: 'Piso 2', active: false, tableCount: 2 }])
 expect(m).toHaveBeenLastCalledWith('floors?restaurant_id=1&all=1')
})
// Falla si el plano pierde la próxima reserva confirmada o la cuelga de otra mesa.
it('ubica las reservas en la mesa consultada', async () => {
 const r = { id: 5, name: 'Rv001', customer_name: 'Eva', date: '2026-10-02', time_start: 10, time_end: 11, people: 2, baby_chair: true, state: 'confirmed' }
 m.mockResolvedValueOnce({ tables: [{ id: 2, reservations: [r] }] }).mockResolvedValueOnce({ reservations: [r] })
 const map = await reservedAtByTable([2, 3], '2026-10-02')
 expect(map[2]).toMatchObject({ id: 5, customerName: 'Eva' }); expect(map[3]).toBeNull()
 expect((await listTableReservations(2))[0]).toMatchObject({ tableId: 2, timeLabel: '10:00 – 11:00' })
})
