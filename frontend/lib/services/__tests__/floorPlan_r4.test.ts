import { coreFetch } from '@/lib/services/core/http'
import { savePlan } from '@/lib/services/floorPlan'

// Frontera HTTP: crear el piso (`POST floors`) y guardar su plano (`PUT floors/<id>/plan`).
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())

const created = { id: 31, name: 'Terraza', sequence: 2, active: true, revision: 0, has_background: false, table_count: 0, tables: [] }
const stored = { id: 31, name: 'Terraza', revision: 1, tables: [], walls: [], zones: [], decor: [], images: [], background: false, background_size: null }

// Falla si «Agregar piso» vuelve a guardar el plano de un piso que no existe (`PUT floors/null/plan`, 404 en el servidor)
// o le pide conservar un fondo que el piso nuevo no tiene (`background: true`, 400 «Revisa los datos enviados.»).
it('crea el piso nuevo antes de guardar su plano', async () => {
  m.mockImplementation(async (path: string) => (path === 'floors' ? { floor: created } : stored))
  const saved = await savePlan(4, { id: null, name: 'Terraza', revision: 0, tables: [], walls: [], zones: [] })
  expect(m.mock.calls.map(([path]) => path)).toEqual(['floors', 'floors/31/plan'])
  expect(m.mock.calls[0][1]).toEqual({ method: 'POST', body: { restaurant_id: 4, name: 'Terraza' } })
  expect(m.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: { id: 31, name: 'Terraza', revision: 0, background: null } })
  expect(saved).toMatchObject({ id: 31, name: 'Terraza', revision: 1 })
})
