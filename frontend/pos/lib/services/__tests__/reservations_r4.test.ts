import { coreFetch } from '@/lib/services/core/http'
import { getAvailableTables } from '@/lib/services/reservations'

// Frontera HTTP: la disponibilidad de mesas de una reserva viene de `reservations/tables`.
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())

// Falla si el asistente de reservas vuelve a pedir solo las mesas que sientan solas al grupo: un grupo de 6 en un
// restaurante de mesas de 4 se quedaba sin mesas, aunque el servidor acepta juntar dos (suma de puestos).
it('pide también las mesas que el grupo puede juntar', async () => {
  m.mockResolvedValue([{ id: 3, table_number: 1, name: 'Mesa 1', seats: 4, floor_id: 1, floor_name: 'Salón', shape: 'square', status: 'unavailable', available: false, reserved_at: false }])
  const tables = await getAvailableTables(1, '2030-10-15', 19, 6, '30', null)
  expect(m.mock.calls[0][0]).toBe('reservations/tables?restaurant_id=1&date=2030-10-15&time_start=19&people=6&prep=30&include_unavailable=true')
  expect(tables).toEqual([{ id: 3, tableNumber: 1, name: 'Mesa 1', seats: 4, floorId: 1, floorName: 'Salón', shape: 'square', status: 'unavailable', available: false, reservedAt: false }])
})
