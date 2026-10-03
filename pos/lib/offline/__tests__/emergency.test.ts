import { act } from '@testing-library/react'

import { provisionalCount } from '@/lib/offline/count'
import { activateEmergency, clearEmergency, EMERGENCY_AFTER_MS, emergencyKitOrder, emergencyPath, emergencyState, operatesInEmergency, useEmergencyOrders } from '@/lib/offline/emergency'
import { useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore, type OutboxEntry } from '@/lib/offline/outbox'
import { CoreError } from '@/lib/services/core/http'
import * as sales from '@/lib/services/core/sales'

jest.mock('@/lib/services/core/sales', () => ({ createOrder: jest.fn(), payOrder: jest.fn(), cashMove: jest.fn(), fireOrder: jest.fn() }))

beforeEach(() => {
  localStorage.clear(); jest.resetAllMocks()
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  useNetworkStore.setState({ online: true, since: null })
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: true })
  useEmergencyOrders.setState({ orders: [], seq: {}, nextLocalId: -1, loaded: true })
})

// Falla si la operación pasa a la caja antes de los 3 minutos (un corte breve no debe cambiar nada), si no pasa al
// cumplirlos, si la encargada no puede adelantarla, o si al volver la red sigue en emergencia.
it('cuenta regresiva de 3 minutos, activación manual y fin con la red', () => {
  const t0 = 1_000_000
  expect(emergencyState(false, t0, t0 + 60_000)).toEqual({ offline: true, active: false, remainingMs: EMERGENCY_AFTER_MS - 60_000 })
  expect(emergencyState(false, t0, t0 + EMERGENCY_AFTER_MS).active).toBe(true)
  activateEmergency()
  expect(emergencyState(false, t0, t0 + 1000).active).toBe(true)
  expect(emergencyState(true, null, t0).active).toBe(false)
  clearEmergency()
  expect(emergencyState(false, t0, t0 + 1000).active).toBe(false)
})

// Falla si al recargar o reiniciar el equipo sin red la cuenta regresiva vuelve a empezar, o si al volver la red queda
// guardada la hora del corte.
it('la hora del corte sobrevive a recargar', () => {
  act(() => useNetworkStore.getState().setOnline(false))
  const since = useNetworkStore.getState().since!
  useNetworkStore.setState({ online: true, since: null })
  act(() => useNetworkStore.getState().setOnline(false))
  expect(useNetworkStore.getState().since).toBe(since)
  act(() => useNetworkStore.getState().setOnline(true))
  expect(localStorage.getItem('waiter.offlineSince')).toBeNull()
})

// Falla si un mesero puede operar en emergencia, si la caja no, o si las pantallas de emergencia no incluyen tomar
// pedidos, agregar rondas a pedidos de emergencia (id negativo) y cobrarlos.
it('quién opera y en qué pantallas', () => {
  expect(['waiter', 'cashier', 'admin', 'owner'].map((r) => operatesInEmergency(r as never))).toEqual([false, true, true, true])
  for (const path of ['/pedidos/nuevo', '/salon/nuevo', '/pedidos/-3/agregar', '/pedidos/12/agregar', '/pago/-3', '/emergencia']) expect(emergencyPath(path)).toBe(true)
  for (const path of ['/inventario', '/historial', '/reservas', '/ventas']) expect(emergencyPath(path)).toBe(false)
})

// Falla si los números provisionales se repiten en el día, si los ids chocan con los del servidor, o si el pedido de
// emergencia no se ve como un pedido abierto con sus platos y su total.
it('números provisionales y pedido de emergencia como pedido del kit', () => {
  const base = { type: 'dine_in' as const, tableId: 7, tableNumber: 3, customer: '', tax: 0, total: 30000, lines: [{ uuid: 'l1', productId: 9, name: 'Hamburguesa', qty: 1, unitPrice: 30000, total: 30000, note: '', options: ['Doble'] }] }
  const a = useEmergencyOrders.getState().register({ ...base, uuid: 'a' })
  const b = useEmergencyOrders.getState().register({ ...base, uuid: 'b' })
  expect([a.number, b.number, a.localId, b.localId]).toEqual(['E-01', 'E-02', -1, -2])
  useEmergencyOrders.getState().addLines('a', [{ uuid: 'l2', productId: 4, name: 'Papas', qty: 2, unitPrice: 8900, total: 17800, note: '', options: [] }], 17800)
  const kit = emergencyKitOrder(useEmergencyOrders.getState().byLocalId(-1)!)
  expect(kit).toMatchObject({ id: -1, number: 'E-01', tableNumber: 3, state: 'draft', total: 47800 })
  expect(kit.lines.map((l) => l.name)).toEqual(['Hamburguesa', 'Papas'])
  expect(JSON.parse(localStorage.getItem('waiter.emergency:burger-house')!).orders).toHaveLength(2)
})

// Falla si una sesión vencida manda las operaciones a «rechazadas» en vez de esperar a que alguien entre, o si al
// entrar la cola no sigue.
it('la sesión vencida pausa la cola y al entrar sigue', async () => {
  jest.mocked(sales.cashMove).mockRejectedValueOnce(new CoreError(401, 'unauthenticated', 'Inicia sesión para continuar.')).mockResolvedValueOnce({} as never)
  const q = useOutboxStore.getState()
  q.enqueue({ kind: 'cash_move', shiftId: 3, type: 'out', amount: 5000, reason: 'Hielo', label: 'Hielo' })
  await q.sync()
  expect(useOutboxStore.getState()).toMatchObject({ needsLogin: true, failed: [] })
  expect(useOutboxStore.getState().entries).toHaveLength(1)
  useOutboxStore.getState().resumeAfterLogin()
  await new Promise((r) => setTimeout(r, 0))
  expect(useOutboxStore.getState().entries).toHaveLength(0)
  expect(sales.cashMove).toHaveBeenLastCalledWith(3, 'out', 5000, 'Hielo')
})

// Falla si al sincronizar el pedido de emergencia no recibe su número del servidor, o si el cierre no lleva la hora
// real del cobro.
it('al sincronizar: número definitivo y hora real del cobro', async () => {
  useEmergencyOrders.getState().register({ uuid: 'a', type: 'takeout', tableId: null, tableNumber: null, customer: 'Ana', tax: 0, total: 1000, lines: [] })
  jest.mocked(sales.createOrder).mockResolvedValue({ id: 88, number: 'TA-014' } as sales.CoreOrder)
  jest.mocked(sales.payOrder).mockResolvedValue({} as sales.CoreOrder)
  const q = useOutboxStore.getState()
  q.enqueue({ kind: 'create_order', uuid: 'a', body: { restaurant_id: 1, uuid: 'a', service: 'takeout', lines: [], fire: false }, label: 'E-01' })
  q.enqueue({ kind: 'pay', order: { uuid: 'a' }, paidAt: '2026-10-03T23:40:00.000Z', label: 'E-01' })
  await q.sync()
  expect(useEmergencyOrders.getState().orders[0]).toMatchObject({ serverId: 88, serverNumber: 'TA-014' })
  expect(sales.payOrder).toHaveBeenCalledWith(88, '2026-10-03T23:40:00.000Z')
})

// Falla si el arqueo provisional no suma los cobros en efectivo y las entradas, no resta las salidas, mezcla el
// datáfono con el efectivo, o cuenta movimientos de otra caja.
it('arqueo provisional', () => {
  const entries = [
    { kind: 'payment', amount: 'balance', expected: 38900, cash: true },
    { kind: 'payment', amount: 'balance', expected: 20000, cash: false },
    { kind: 'cash_move', shiftId: 3, type: 'in', amount: 50000 },
    { kind: 'cash_move', shiftId: 3, type: 'out', amount: 12000 },
    { kind: 'cash_move', shiftId: 9, type: 'out', amount: 99999 },
  ] as unknown as OutboxEntry[]
  expect(provisionalCount(100000, entries, 3)).toEqual({ base: 100000, cashSales: 38900, otherSales: 20000, cashIn: 50000, cashOut: 12000, payments: 2, expected: 176900 })
})
