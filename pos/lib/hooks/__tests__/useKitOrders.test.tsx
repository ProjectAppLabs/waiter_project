import { act, renderHook, waitFor } from '@testing-library/react'

import type { KitOrder } from '@/lib/domain/orderState'
import { useKitOrders } from '@/lib/hooks/useKitOrders'
import { useEmergencyOrders, type EmergencyOrder } from '@/lib/offline/emergency'
import { listKitOrders } from '@/lib/services/ordersKit'
import { listTableCalls } from '@/lib/services/tables'
import { useAuthStore } from '@/lib/stores/authStore'
import { useBusStore } from '@/lib/stores/busStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOrderStore } from '@/lib/stores/orderStore'

jest.mock('@/lib/services/ordersKit', () => ({ listKitOrders: jest.fn() }))
jest.mock('@/lib/services/tables', () => ({ ...jest.requireActual('@/lib/services/tables'), listTableCalls: jest.fn(async () => []) }))

const kit = (id: number, over: Partial<KitOrder> = {}): KitOrder => ({ id, number: `DI-0${id}`, type: 'dineIn', state: 'draft', tableId: id, tableNumber: id, customer: '', startedAt: '', total: 1000, tax: 0,
  lines: [{ id: id * 10, uuid: `l${id}`, productId: 1, name: 'Plato', qty: 1, unitPrice: 1000, subtotal: 1000, total: 1000, note: '', courseId: id, readyAt: null, servedAt: null, options: [] }],
  courses: [{ id, fired: true, readyAt: null, servedAt: null }], tracking: null, ...over } as KitOrder)
const emergency = (localId: number, over: Partial<EmergencyOrder>): EmergencyOrder => ({ uuid: `e${localId}`, localId, number: `E-${-localId}`, type: 'takeout', tableId: null, tableNumber: null, customer: '', createdAt: '', lines: [], total: 5000, tax: 0, paid: false, fired: false, ...over })
let sessionId = 100
const signIn = () => useAuthStore.setState({ session: { id: ++sessionId, configId: 1, state: 'opened' } })

beforeEach(() => {
  jest.clearAllMocks()
  useCatalogStore.setState({ catalog: { tables: [{ id: 1, number: 1 }] } as never })
  useBusStore.setState({ up: false, ticks: { kitchen: 0, orders: 0, notify: 0 } })
  useOrderStore.setState({ flags: {}, calls: [] })
  useEmergencyOrders.setState({ orders: [], loaded: true })
})

// Falla si el hook pide los pedidos antes de tener la carta (las tarjetas saldrían sin número de mesa) o si no pasa la
// lista al salón (`adoptOpenOrders`) en la misma lectura.
it('espera la carta y comparte la lectura con el salón', async () => {
  signIn()
  useCatalogStore.setState({ catalog: null })
  jest.mocked(listKitOrders).mockResolvedValue([kit(1)])
  const adopt = jest.fn()
  useOrderStore.setState({ adoptOpenOrders: adopt })
  const { result } = renderHook(() => useKitOrders())
  await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
  expect(listKitOrders).not.toHaveBeenCalled()
  act(() => useCatalogStore.setState({ catalog: { tables: [{ id: 1, number: 1 }] } as never }))
  await waitFor(() => expect(result.current.orders).toHaveLength(1))
  expect(result.current.loaded).toBe(true)
  expect(adopt).toHaveBeenCalledTimes(1)
  expect(listKitOrders).toHaveBeenCalledTimes(1)
})

// Falla si un error de red borra lo que ya se veía en vez de dejar lo último conocido.
it('si la lectura falla, conserva lo último conocido', async () => {
  signIn()
  jest.mocked(listKitOrders).mockResolvedValueOnce([kit(2)]).mockRejectedValueOnce(new Error('sin red'))
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const { result } = renderHook(() => useKitOrders())
  await waitFor(() => expect(result.current.orders).toHaveLength(1))
  await act(async () => { await result.current.refresh() })
  expect(result.current.orders.map((o) => o.id)).toEqual([2])
})

// Falla si un aviso del bus (un plato listo) no relee los pedidos enseguida, sin esperar al sondeo.
it('relee al llegar un aviso del bus', async () => {
  signIn()
  jest.mocked(listKitOrders).mockResolvedValue([kit(3)])
  renderHook(() => useKitOrders())
  await waitFor(() => expect(listKitOrders).toHaveBeenCalledTimes(1))
  act(() => useBusStore.setState({ ticks: { kitchen: 0, orders: 1, notify: 0 } }))
  await waitFor(() => expect(listKitOrders).toHaveBeenCalledTimes(2))
})

// Falla si un pedido con la cuenta pedida no pasa a «esperando pago», o si los pedidos de emergencia sin subir ni cobrar
// no se ven junto a los demás (plan V); también si se ven los ya subidos o cobrados, que saldrían repetidos.
it('estado por cuenta pedida y pedidos de emergencia pendientes', async () => {
  signIn()
  jest.mocked(listKitOrders).mockResolvedValue([kit(4), kit(5)])
  jest.mocked(listTableCalls).mockResolvedValue([])
  useEmergencyOrders.setState({ orders: [emergency(-1, {}), emergency(-2, { serverId: 77 }), emergency(-3, { paid: true })] })
  useOrderStore.setState({ flags: { 4: { billing: true } } as never })
  const { result } = renderHook(() => useKitOrders())
  await waitFor(() => expect(result.current.orders).toHaveLength(3))
  expect(result.current.orders.map((o) => o.id)).toEqual([4, 5, -1])
  const [billing, cooking] = result.current.orders
  expect(result.current.statusOf(billing)).toBe('waiting_payment')
  expect(result.current.statusOf(cooking)).toBe('in_progress')
})
