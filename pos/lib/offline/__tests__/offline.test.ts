import { coreFetch, CoreError } from '@/lib/services/core/http'
import { useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore } from '@/lib/offline/outbox'
import * as sales from '@/lib/services/core/sales'

jest.mock('@/lib/services/core/sales', () => ({
  createOrder: jest.fn(), addLines: jest.fn(), fireOrder: jest.fn(), getOrder: jest.fn(), addPayment: jest.fn(), payOrder: jest.fn(),
}))
const fetchMock = jest.fn()
const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })
const down = () => { throw new TypeError('Failed to fetch') }

beforeEach(() => {
  localStorage.clear(); fetchMock.mockReset(); global.fetch = fetchMock as unknown as typeof fetch
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  useNetworkStore.setState({ online: true, since: null })
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, loaded: true })
})

// Falla si sin red el POS se queda sin la carta o la caja que ya había leído, si no se entera de que está sin
// conexión, o si un cambio (POST) se responde con datos viejos en vez de fallar.
it('las lecturas guardadas sirven sin red y solo ellas', async () => {
  fetchMock.mockResolvedValueOnce(ok({ shift: { id: 3 } }))
  await coreFetch('shifts/open?restaurant_id=1')
  fetchMock.mockImplementation(down)
  await expect(coreFetch('shifts/open?restaurant_id=1')).resolves.toEqual({ shift: { id: 3 } })
  expect(useNetworkStore.getState().online).toBe(false)
  await expect(coreFetch('orders', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'unreachable' })
  await expect(coreFetch('reports/summary?from=a')).rejects.toMatchObject({ code: 'unreachable' })
  fetchMock.mockResolvedValueOnce(ok({ organization: {} }))
  await coreFetch('org')
  expect(useNetworkStore.getState().online).toBe(true)
})

// Falla si un 502 del proxy (el servidor caído) no cuenta como «sin conexión».
it('el proxy sin servidor cuenta como sin red', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => '' })
  await expect(coreFetch('org')).rejects.toMatchObject({ code: 'unreachable' })
  expect(useNetworkStore.getState().online).toBe(false)
})

describe('cola de salida', () => {
  type Fn = 'createOrder' | 'addLines' | 'fireOrder' | 'getOrder' | 'addPayment' | 'payOrder'
  const spy = <K extends Fn>(name: K) => jest.mocked(sales[name])
  afterEach(() => jest.resetAllMocks())
  const body = { restaurant_id: 1, uuid: 'p-1', service: 'takeout' as const, lines: [], fire: false }

  // Falla si al volver la red las operaciones no salen en orden, si las que dependen del pedido nuevo no usan su id del
  // servidor, si el pago no se hace por el saldo que dice el servidor, o si la cola no queda vacía y guardada.
  it('envía en orden y resuelve el pedido creado sin conexión', async () => {
    const calls: string[] = []
    spy('createOrder').mockImplementation(async () => { calls.push('create'); return { id: 41 } as sales.CoreOrder })
    spy('fireOrder').mockImplementation(async (id) => { calls.push(`fire ${id}`); return { order: {} as sales.CoreOrder, course_id: 1 } })
    spy('getOrder').mockResolvedValue({ total: 38900, paid: 0 } as sales.CoreOrder)
    spy('addPayment').mockImplementation(async (id, b) => { calls.push(`pay ${id} ${b.amount} ${b.received}`); return {} as never })
    spy('payOrder').mockImplementation(async (id) => { calls.push(`close ${id}`); return {} as sales.CoreOrder })
    const q = useOutboxStore.getState()
    q.enqueue({ kind: 'create_order', uuid: 'p-1', body, label: 'Ana' })
    q.enqueue({ kind: 'fire', order: { uuid: 'p-1' }, label: 'Ana' })
    q.enqueue({ kind: 'payment', order: { uuid: 'p-1' }, methodId: 2, amount: 'balance', received: 50000, reference: '', requestKey: 'offline-k', label: 'Ana' })
    q.enqueue({ kind: 'pay', order: { uuid: 'p-1' }, label: 'Ana' })
    expect(JSON.parse(localStorage.getItem('waiter.outbox:burger-house')!).entries).toHaveLength(4)
    await q.sync()
    expect(calls).toEqual(['create', 'fire 41', 'pay 41 38900 50000', 'close 41'])
    expect(useOutboxStore.getState().entries).toEqual([])
    expect(useOutboxStore.getState().serverId({ uuid: 'p-1' })).toBe(41)
    expect(JSON.parse(localStorage.getItem('waiter.outbox:burger-house')!).entries).toEqual([])
  })

  // Falla si una caída a mitad de la sincronización pierde operaciones o las reintenta fuera de orden.
  it('sin red se detiene y conserva lo que falta', async () => {
    spy('createOrder').mockResolvedValue({ id: 41 } as sales.CoreOrder)
    spy('fireOrder').mockRejectedValue(new CoreError(0, 'unreachable', 'sin red'))
    const q = useOutboxStore.getState()
    q.enqueue({ kind: 'create_order', uuid: 'p-1', body, label: '' })
    q.enqueue({ kind: 'fire', order: { uuid: 'p-1' }, label: '' })
    await q.sync()
    expect(useOutboxStore.getState().entries.map((e) => e.kind)).toEqual(['fire'])
    expect(useOutboxStore.getState().failed).toEqual([])
  })

  // Falla si un rechazo del servidor frena toda la cola, o si las operaciones de un pedido que no se pudo crear se
  // intentan contra otro.
  it('un rechazo pasa a revisión con lo que dependía de él y el resto sigue', async () => {
    spy('createOrder').mockRejectedValue(new CoreError(400, 'unavailable', 'No está disponible: Hamburguesa.'))
    const fire = spy('fireOrder').mockResolvedValue({ order: {} as sales.CoreOrder, course_id: 1 })
    const q = useOutboxStore.getState()
    q.enqueue({ kind: 'create_order', uuid: 'p-1', body, label: 'Ana' })
    q.enqueue({ kind: 'fire', order: { uuid: 'p-1' }, label: 'Ana' })
    q.enqueue({ kind: 'fire', order: { id: 7 }, label: 'Mesa 3' })
    await q.sync()
    const failed = useOutboxStore.getState().failed
    expect(failed.map((f) => [f.entry.kind, f.error])).toEqual([['create_order', 'No está disponible: Hamburguesa.'], ['fire', 'No se envió porque falló una operación anterior de este pedido.']])
    expect(fire).toHaveBeenCalledTimes(1)
    expect(fire).toHaveBeenCalledWith(7)
    useOutboxStore.getState().discard(failed[0].entry.id)
    expect(useOutboxStore.getState().failed).toHaveLength(1)
  })
})
