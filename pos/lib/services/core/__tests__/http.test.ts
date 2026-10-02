import { CoreError, coreFetch } from '@/lib/services/core/http'

// jsdom no trae Response: una respuesta mínima con lo que usa coreFetch.
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })
const fetchMock = jest.fn()
beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock as unknown as typeof fetch; process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house' })

// Falla si las peticiones del POS no llevan la organización, no viajan por el mismo origen con cookies, o si la ruta
// cambia (las del sistema propio van sin barra final).
it('habla con el sistema propio por el mismo origen y con la organización', async () => {
  fetchMock.mockResolvedValue(reply(200, { ok: true }))
  await coreFetch('auth/login', { method: 'POST', body: { login: 'sofia' } })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/experience/api/pos/v1/auth/login')
  expect(init.credentials).toBe('include')
  expect(init.headers['X-Waiter-Org']).toBe('burger-house')
  expect(init.body).toBe('{"login":"sofia"}')
  await coreFetch('team', { scope: 'platform' })
  expect(fetchMock.mock.calls[1][0]).toBe('/experience/api/platform/v1/team')
  expect(fetchMock.mock.calls[1][1].headers['X-Waiter-Org']).toBeUndefined()
})

// Falla si un error del servidor no llega con su código y su mensaje en español, o si la red caída no se distingue.
it('convierte los errores en CoreError con código y mensaje', async () => {
  fetchMock.mockResolvedValue(reply(403, { error: 'outside_hours', message: 'Fuera de tu turno.', window: '14:00–22:00' }))
  const failure = coreFetch('auth/login', { method: 'POST', body: {} })
  await expect(failure).rejects.toBeInstanceOf(CoreError)
  await expect(failure).rejects.toMatchObject({ status: 403, code: 'outside_hours', message: 'Fuera de tu turno.', detail: { window: '14:00–22:00' } })
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(coreFetch('org')).rejects.toMatchObject({ status: 0, code: 'unreachable' })
})
