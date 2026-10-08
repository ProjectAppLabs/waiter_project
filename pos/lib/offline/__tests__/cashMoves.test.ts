import { CoreError } from '@/lib/services/core/http'
import { useOutboxStore, type OutboxEntry } from '@/lib/offline/outbox'
import * as sales from '@/lib/services/core/sales'

jest.mock('@/lib/services/core/sales', () => ({ cashMove: jest.fn() }))

beforeEach(() => {
  localStorage.clear()
  jest.resetAllMocks()
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: false })
})

afterEach(() => localStorage.clear())

// Falla si un movimiento antiguo sin clave se reenvía, o si su revisión impide sincronizar uno nuevo de la misma caja.
it('aísla el movimiento histórico sin clave al hidratar la caja', async () => {
  const historical = { id: 'histórico-1', at: '2026-10-07T08:00:00.000Z', label: 'Cambio', kind: 'cash_move', shiftId: 3, type: 'in', amount: 5000, reason: 'Cambio' }
  const current = { id: 'actual-1', at: '2026-10-07T08:01:00.000Z', label: 'Hielo', kind: 'cash_move', shiftId: 3, type: 'out', amount: 2500, reason: 'Hielo', requestKey: 'cash-move-actual-1' }
  localStorage.setItem('waiter.outbox:burger-house', JSON.stringify({ entries: [historical, current], failed: [], ids: {} }))
  jest.mocked(sales.cashMove).mockResolvedValue({} as never)

  const queue = useOutboxStore.getState()
  queue.hydrate()
  await queue.sync()

  expect(useOutboxStore.getState().failed).toEqual([{ entry: historical, error: 'Revisa este movimiento en el historial de caja antes de volver a registrarlo: se guardó sin identificador y pudo haberse aplicado.' }])
  expect(sales.cashMove).toHaveBeenCalledTimes(1)
  expect(sales.cashMove).toHaveBeenCalledWith(3, 'out', 2500, 'Hielo', 'cash-move-actual-1')
  expect(useOutboxStore.getState().entries).toEqual([])
})

// Falla si una sesión vencida descarta la clave del movimiento pendiente o si al volver a entrar lo duplica con otra.
it.each([
  { type: 'in' as const, amount: 5000, reason: 'Cambio', requestKey: 'cash-move-login-3' },
  { type: 'out' as const, amount: 5000, reason: 'Hielo', requestKey: 'cash-move-hielo-3' },
])('reintenta el movimiento $type pendiente con la misma clave tras entrar', async ({ type, amount, reason, requestKey }) => {
  jest.mocked(sales.cashMove)
    .mockRejectedValueOnce(new CoreError(401, 'unauthenticated', 'Inicia sesión para continuar.'))
    .mockResolvedValueOnce({} as never)
  const queue = useOutboxStore.getState()
  queue.enqueue({ kind: 'cash_move', shiftId: 3, type, amount, reason, requestKey, label: reason })

  await queue.sync()

  expect(useOutboxStore.getState()).toMatchObject({ needsLogin: true, failed: [], entries: [expect.objectContaining({ kind: 'cash_move', shiftId: 3, type, amount, reason, requestKey })] })
  expect(sales.cashMove).toHaveBeenNthCalledWith(1, 3, type, amount, reason, requestKey)

  queue.resumeAfterLogin()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(sales.cashMove).toHaveBeenCalledTimes(2)
  expect(sales.cashMove).toHaveBeenNthCalledWith(2, 3, type, amount, reason, requestKey)
  expect(useOutboxStore.getState()).toMatchObject({ needsLogin: false, entries: [], failed: [] })
})

// Falla si una cola ya cargada reenvía un movimiento sin clave o si deja de sincronizar el movimiento válido posterior.
it('cuarentena el movimiento histórico ya cargado antes de enviar la caja', async () => {
  const historical = { id: 'histórico-runtime-1', at: '2026-10-07T08:00:00.000Z', label: 'Cambio', kind: 'cash_move', shiftId: 3, type: 'in', amount: 5000, reason: 'Cambio' }
  const current = { id: 'actual-runtime-1', at: '2026-10-07T08:01:00.000Z', label: 'Cambio', kind: 'cash_move', shiftId: 3, type: 'in', amount: 5000, reason: 'Cambio', requestKey: 'cash-move-runtime-3' }
  jest.mocked(sales.cashMove).mockResolvedValue({} as never)
  useOutboxStore.setState({ entries: [historical, current] as unknown as OutboxEntry[], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: true })

  await useOutboxStore.getState().sync()

  const failure = { entry: historical, error: 'Revisa este movimiento en el historial de caja antes de volver a registrarlo: se guardó sin identificador y pudo haberse aplicado.' }
  expect(useOutboxStore.getState()).toMatchObject({ entries: [], failed: [failure] })
  expect(sales.cashMove).toHaveBeenCalledTimes(1)
  expect(sales.cashMove).toHaveBeenCalledWith(3, 'in', 5000, 'Cambio', 'cash-move-runtime-3')
  expect(JSON.parse(localStorage.getItem('waiter.outbox:burger-house')!)).toEqual({ entries: [], failed: [failure], ids: {} })
})
