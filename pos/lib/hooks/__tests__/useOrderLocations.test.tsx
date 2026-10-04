import { renderHook, waitFor } from '@testing-library/react'

import { useOrderLocations } from '@/lib/hooks/useOrderLocations'
import { readPlan } from '@/lib/services/floorPlan'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { Catalog } from '@/lib/types'
import type { KitOrder } from '@/lib/domain/orderState'

jest.mock('@/lib/services/floorPlan', () => ({ readPlan: jest.fn() }))

const catalog: Catalog = {
  company: { name: 'Local' }, settings: { configId: 1 } as Catalog['settings'],
  products: [], categories: [], paymentMethods: [],
  floors: [{ id: 1, name: 'Terraza', tableIds: [10, 11], hasBackground: false }],
  tables: [10, 11].map((id) => ({ id, number: id, floorId: 1, seats: 4, x: 0, y: 0, width: 100, height: 100, shape: 'square', color: null })),
}
const orders = [10, 11, 10].map((tableId, id) => ({ id, tableId }) as KitOrder)

beforeEach(() => {
  jest.mocked(readPlan).mockReset()
  useCatalogStore.setState({ catalog })
})

// Falla si cada pedido o cada sondeo de pedidos vuelve a leer el plano del piso.
it('shares one floor read across orders and does not refetch on every order poll', async () => {
  jest.mocked(readPlan).mockResolvedValue({ id: 1, name: 'Terraza', revision: 0, walls: [], tables: [], zones: [] })
  const { result, rerender } = renderHook(({ rows }) => useOrderLocations(rows), { initialProps: { rows: orders } })
  await waitFor(() => expect(result.current.get(10)?.zoneStatus).toBe('unavailable'))
  expect(readPlan).toHaveBeenCalledTimes(1)
  expect(readPlan).toHaveBeenCalledWith(1)
  rerender({ rows: [...orders] })
  expect(readPlan).toHaveBeenCalledTimes(1)
})

// Falla si al fallar el plano se pierde el piso conocido o la zona se reporta como sin asignar.
it('keeps the known floor and reports unavailable rather than unassigned when the plan fails', async () => {
  jest.mocked(readPlan).mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useOrderLocations(orders))
  await waitFor(() => expect(result.current.get(10)).toEqual({ floorId: 1, zoneId: null, floor: 'Terraza', zone: null, zoneStatus: 'unavailable' }))
})
