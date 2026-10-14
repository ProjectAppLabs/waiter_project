import { coreFetch, CoreError } from '@/lib/services/core/http'
import { useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore, type OutboxEntry } from '@/lib/offline/outbox'
import { endCacheSession, startCacheSession } from '@/lib/offline/cache'
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
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: true })
})

describe('identidad durable y revisión del pago', () => {
  const payment = (patch: Partial<Extract<OutboxEntry, { kind: 'payment' }>> = {}): Extract<OutboxEntry, { kind: 'payment' }> => ({
    id: 'pago-1', at: '2026-10-08T12:00:00Z', label: 'DI-041', kind: 'payment', order: { id: 41 },
    methodId: 2, amount: 'balance', received: 50000, reference: '', requestKey: 'offline-identidad-0001', ...patch,
  })
  const closing: OutboxEntry = { id: 'cierre-1', at: '2026-10-08T12:00:00Z', label: 'DI-041', kind: 'pay', order: { id: 41 }, paidAt: '2026-10-08T11:59:00Z' }
  const proof = (patch: Partial<sales.CoreOrder> = {}): sales.CoreOrder => ({ id: 41, uuid: 'p-1', number: 'DI-041', state: 'draft', total: 38900, paid: 38900,
    payments: [{ id: 1, method_id: 2, method: 'Efectivo', amount: 38900, received: 50000, reference: '', created_at: '2026-10-08T12:00:00Z', request_key: 'offline-identidad-0001' }], ...patch } as sales.CoreOrder)
  beforeEach(() => { jest.resetAllMocks(); startCacheSession() })

  // Falla si un POST aceptado sin respuesta se reenvía con el saldo nuevo bajo la misma clave, incluso tras recargar o entrar otra vez.
  it('congela 38.900 antes del primer POST y lo conserva aunque la propina aumente el saldo', async () => {
    const q = useOutboxStore.getState()
    const initial = q.enqueue(payment())
    q.enqueue({ kind: 'pay', order: { id: 41 }, paidAt: closing.paidAt, label: 'DI-041' })
    jest.mocked(sales.getOrder).mockResolvedValueOnce(proof({ paid: 0 }))
    jest.mocked(sales.addPayment).mockImplementationOnce(async () => {
      const stored = JSON.parse(localStorage.getItem('waiter.outbox:burger-house')!).entries[0]
      expect(stored).toMatchObject({ id: initial.id, amount: 38900, requestKey: 'offline-identidad-0001' })
      throw new CoreError(0, 'unreachable', 'Respuesta perdida')
    }).mockResolvedValueOnce(proof({ total: 43900 }))
    await q.sync()
    expect(useOutboxStore.getState().entries[0]).toMatchObject({ amount: 38900 })
    useOutboxStore.setState({ entries: [], failed: [], loaded: false })
    endCacheSession(); startCacheSession()
    jest.mocked(sales.payOrder).mockRejectedValue(new CoreError(400, 'unpaid', 'Falta pagar el saldo del pedido.'))
    await useOutboxStore.getState().sync()
    expect(jest.mocked(sales.addPayment).mock.calls).toEqual([
      [41, { method_id: 2, amount: 38900, request_key: 'offline-identidad-0001', received: 50000 }],
      [41, { method_id: 2, amount: 38900, request_key: 'offline-identidad-0001', received: 50000 }],
    ])
    expect(sales.getOrder).toHaveBeenCalledTimes(1)
    expect(useOutboxStore.getState().failed.map((f) => f.entry.kind)).toEqual(['pay'])
    expect(useOutboxStore.getState().failed[0].entry).toMatchObject({ paidAt: closing.paidAt })
  })

  // Falla si una entrada nueva sin sincronizar se confunde al recargar con un pago antiguo de resultado desconocido.
  it('conserva la marca de una entrada nueva al recargar antes del primer envío', async () => {
    useOutboxStore.getState().enqueue(payment())
    useOutboxStore.setState({ entries: [], loaded: false })
    jest.mocked(sales.getOrder).mockResolvedValue(proof({ paid: 0 }))
    jest.mocked(sales.addPayment).mockResolvedValue(proof())
    await useOutboxStore.getState().sync()
    expect(sales.addPayment).toHaveBeenCalledWith(41, { method_id: 2, amount: 38900, request_key: 'offline-identidad-0001', received: 50000 })
    expect(useOutboxStore.getState().failed).toEqual([])
  })

  // Falla si el servidor recibe un pago cuya identidad no pudo guardarse antes, o si se intenta después su cierre.
  it('no envía pago ni cierre cuando no puede persistir el snapshot', async () => {
    useOutboxStore.getState().enqueue(payment())
    useOutboxStore.getState().enqueue(closing)
    jest.mocked(sales.getOrder).mockResolvedValue(proof({ paid: 0 }))
    const denied = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    try {
      await useOutboxStore.getState().sync()
      expect(sales.addPayment).not.toHaveBeenCalled()
      expect(sales.payOrder).not.toHaveBeenCalled()
      expect(useOutboxStore.getState().failed.map((f) => f.entry.kind)).toEqual(['payment', 'pay'])
      expect(useOutboxStore.getState().failed[0].error).toContain('No se envió el pago')
    } finally { denied.mockRestore() }
  })

  // Falla si una cola antigua ambigüa se reenvía, pierde su cierre/hora o se elimina sin haber consultado el pago real.
  it('conserva pago antiguo y cierre dependiente en revisión sin POST ni descarte ciego', async () => {
    localStorage.setItem('waiter.outbox:burger-house', JSON.stringify({ entries: [payment(), closing], failed: [], ids: {} }))
    useOutboxStore.setState({ loaded: false })
    await useOutboxStore.getState().sync()
    const q = useOutboxStore.getState()
    expect(q.entries).toEqual([])
    expect(q.failed.map((f) => f.entry)).toEqual([payment(), closing])
    q.discard('pago-1'); q.discard('cierre-1')
    expect(useOutboxStore.getState().failed).toHaveLength(2)
    expect(sales.addPayment).not.toHaveBeenCalled()
    expect(sales.payOrder).not.toHaveBeenCalled()
  })

  // Falla si el resultado aceptado identificado en el servidor provoca otro POST de pago o se pierde la hora del cierre.
  it('confirma por clave y reanuda exclusivamente el cierre original', async () => {
    useOutboxStore.setState({ failed: [{ entry: payment(), error: 'Respuesta perdida' }, { entry: closing, error: 'Espera revisión' }] })
    jest.mocked(sales.getOrder).mockResolvedValue(proof())
    expect((await useOutboxStore.getState().review('pago-1')).payment?.amount).toBe(38900)
    await useOutboxStore.getState().confirmReview('pago-1')
    expect(useOutboxStore.getState().failed.map((f) => f.entry.id)).toEqual(['cierre-1'])
    await useOutboxStore.getState().confirmReview('cierre-1')
    jest.mocked(sales.payOrder).mockResolvedValue(proof({ state: 'paid' }))
    await useOutboxStore.getState().sync()
    expect(sales.getOrder).toHaveBeenCalledWith(41, { offlineFallback: false })
    expect(sales.payOrder).toHaveBeenCalledTimes(1)
    expect(sales.payOrder).toHaveBeenCalledWith(41, '2026-10-08T11:59:00Z')
    expect(sales.addPayment).not.toHaveBeenCalled()
    expect(useOutboxStore.getState().failed).toEqual([])
  })

  // Falla si un pago bancario confirmado sin efectivo y con referencia normalizada no puede conciliarse sin volver a enviarlo.
  it('conciliación bancaria respeta efectivo null y referencia normalizada', async () => {
    useOutboxStore.setState({ failed: [{ entry: payment({ received: null, reference: '  terminal-41  ' }), error: 'Revisar' }] })
    jest.mocked(sales.getOrder).mockResolvedValue(proof({ payments: [{ ...proof().payments[0], received: null, reference: 'terminal-41', method: 'Datáfono' }] }))
    await useOutboxStore.getState().confirmReview('pago-1')
    expect(useOutboxStore.getState().failed).toEqual([])
    expect(sales.addPayment).not.toHaveBeenCalled()
    expect(sales.payOrder).not.toHaveBeenCalled()
  })

  // Falla si saldo cero por otros pagos basta para cerrar antes de resolver la entrada ambigua, o se usa el UUID de otro pedido.
  it('el cierre espera la identidad del pago y la consulta verifica el pedido resuelto', async () => {
    useOutboxStore.setState({ ids: { 'p-1': 41 }, failed: [{ entry: payment({ order: { uuid: 'p-1' } }), error: 'Revisar' }, { entry: closing, error: 'Revisar' }] })
    jest.mocked(sales.getOrder).mockResolvedValueOnce(proof()).mockResolvedValueOnce(proof({ uuid: 'otro-pedido' }))
    await expect(useOutboxStore.getState().confirmReview('cierre-1')).rejects.toMatchObject({ code: 'payment_unverified' })
    await expect(useOutboxStore.getState().confirmReview('pago-1')).rejects.toMatchObject({ code: 'review_changed' })
    expect(useOutboxStore.getState().failed).toHaveLength(2)
    expect(useOutboxStore.getState().entries).toEqual([])
  })

  // Falla si un saldo ya pagado genera un POST de importe cero o un fallo del cuerpo elimina el pago y su cierre pendiente.
  it('saldo cero no crea pago y una respuesta incierta conserva el payload y cierre', async () => {
    useOutboxStore.getState().enqueue(payment())
    jest.mocked(sales.getOrder).mockResolvedValueOnce(proof())
    await useOutboxStore.getState().sync()
    expect(sales.addPayment).not.toHaveBeenCalled()
    useOutboxStore.getState().enqueue(payment({ amount: 38900 }))
    useOutboxStore.getState().enqueue(closing)
    jest.mocked(sales.addPayment).mockRejectedValueOnce(new CoreError(0, 'unreachable', 'La operación puede haberse aplicado.'))
    await useOutboxStore.getState().sync()
    expect(useOutboxStore.getState().entries.map((e) => e.kind)).toEqual(['payment', 'pay'])
    expect(useOutboxStore.getState().failed).toEqual([])
    expect(useOutboxStore.getState().entries[0]).toMatchObject({ amount: 38900, requestKey: 'offline-identidad-0001' })
    expect(sales.payOrder).not.toHaveBeenCalled()
  })

  // Falla si se confirma una clave, un medio, una referencia, un efectivo o un importe incompatible con la operación guardada.
  it.each([
    { request_key: null }, { request_key: 'otra-clave' }, { method_id: 3 }, { reference: 'otra-referencia' }, { received: null }, { amount: 1000 },
  ])('rechaza un pago incompatible: %j', async (patch) => {
    useOutboxStore.setState({ failed: [{ entry: payment({ amount: 38900 }), error: 'Revisar' }] })
    jest.mocked(sales.getOrder).mockResolvedValue(proof({ payments: [{ ...proof().payments[0], ...patch }] }))
    await expect(useOutboxStore.getState().confirmReview('pago-1')).rejects.toMatchObject({ code: 'payment_unverified' })
    expect(useOutboxStore.getState().failed).toHaveLength(1)
    expect(sales.addPayment).not.toHaveBeenCalled()
  })

  // Falla si una respuesta consultada anteriormente basta para confirmar aunque el servidor ya no dé una prueba concluyente.
  it('reconsulta al confirmar y conserva cierre con saldo pendiente o pedido cancelado', async () => {
    useOutboxStore.setState({ failed: [{ entry: payment(), error: 'Revisar' }, { entry: closing, error: 'Revisar' }] })
    jest.mocked(sales.getOrder).mockResolvedValueOnce(proof()).mockResolvedValueOnce(proof({ payments: [] }))
    expect((await useOutboxStore.getState().review('pago-1')).canConfirm).toBe(true)
    await expect(useOutboxStore.getState().confirmReview('pago-1')).rejects.toMatchObject({ code: 'payment_unverified' })
    useOutboxStore.setState({ failed: [{ entry: closing, error: 'Revisar' }] })
    jest.mocked(sales.getOrder).mockResolvedValueOnce(proof({ total: 43900 })).mockResolvedValueOnce(proof({ state: 'cancelled' }))
    await expect(useOutboxStore.getState().confirmReview('cierre-1')).rejects.toMatchObject({ code: 'payment_unverified' })
    await expect(useOutboxStore.getState().confirmReview('cierre-1')).rejects.toMatchObject({ code: 'payment_unverified' })
    expect(useOutboxStore.getState().entries).toEqual([])
    expect(useOutboxStore.getState().failed).toHaveLength(1)
  })

  // Falla si cambiar de sesión durante la consulta permite confirmar el resultado anterior, o un doble clic resuelve dos veces.
  it('invalida la sesión anterior y serializa confirmaciones de la misma entrada', async () => {
    useOutboxStore.setState({ failed: [{ entry: payment(), error: 'Revisar' }, { entry: closing, error: 'Revisar' }] })
    let complete!: (order: sales.CoreOrder) => void
    jest.mocked(sales.getOrder).mockReturnValueOnce(new Promise((resolve) => { complete = resolve }))
    const previous = useOutboxStore.getState().confirmReview('pago-1')
    await expect(useOutboxStore.getState().confirmReview('pago-1')).rejects.toMatchObject({ code: 'review_busy' })
    endCacheSession(); startCacheSession()
    complete(proof())
    await expect(previous).rejects.toMatchObject({ code: 'review_changed' })
    expect(useOutboxStore.getState().failed).toHaveLength(2)
    jest.mocked(sales.getOrder).mockResolvedValue(proof({ state: 'paid' }))
    await useOutboxStore.getState().confirmReview('pago-1')
    expect(useOutboxStore.getState().failed).toEqual([])
    expect(useOutboxStore.getState().entries).toEqual([])
    expect(sales.payOrder).not.toHaveBeenCalled()
    expect(sales.addPayment).not.toHaveBeenCalled()
  })
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
