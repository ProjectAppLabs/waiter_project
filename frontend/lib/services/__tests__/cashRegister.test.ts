import { useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore } from '@/lib/offline/outbox'
import { cashInOut } from '@/lib/services/cashRegister'

const fetchMock = jest.fn()
const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })
const originalFetch = global.fetch

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  useNetworkStore.setState({ online: true, since: null })
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: true })
})

afterEach(() => {
  localStorage.clear()
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

// Falla si una respuesta perdida crea una clave nueva y el servidor registra dos veces el mismo movimiento de caja.
it('conserva la clave de caja al reintentar una caída', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok({ expected_cash: 125000 }))

  await cashInOut(3, 'in', 5000, 'Cambio')

  const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { kind: string; amount: number; reason: string; request_key: string }
  const persisted = JSON.parse(localStorage.getItem('waiter.outbox:burger-house')!) as { entries: { requestKey: string }[] }
  expect(fetchMock.mock.calls[0][0]).toBe('/experience/api/pos/v1/shifts/3/moves')
  expect(firstBody).toMatchObject({ kind: 'in', amount: 5000, reason: 'Cambio', request_key: expect.stringMatching(/^cash-move-/) })
  expect(persisted.entries).toHaveLength(1)
  expect(persisted.entries[0].requestKey).toBe(firstBody.request_key)

  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: false })
  const restored = useOutboxStore.getState()
  restored.hydrate()
  await restored.sync()

  expect(fetchMock.mock.calls[1][0]).toBe('/experience/api/pos/v1/shifts/3/moves')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ kind: 'in', amount: 5000, reason: 'Cambio', request_key: firstBody.request_key })
  expect(useOutboxStore.getState().entries).toEqual([])
})
