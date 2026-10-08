import { CoreError, coreFetch } from '@/lib/services/core/http'
import { endCacheSession, recall, remember, startCacheSession } from '@/lib/offline/cache'
import { useNetworkStore } from '@/lib/offline/network'

// jsdom no trae Response: una respuesta mínima con lo que usa coreFetch.
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })
const fetchMock = jest.fn()
beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  useNetworkStore.setState({ online: true, since: null })
})

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

// Falla si una sesión vigente pierde su identidad, carta o caja guardadas cuando cae el servidor.
it.each([0, 502, 503, 504])('mantiene las lecturas offline de la sesión vigente ante un corte %s', async (status) => {
  const readings = {
    'auth/me': { account: { id: '2' } },
    'catalog?restaurant_id=1': { products: [{ id: 1 }] },
    'shifts/open?restaurant_id=1': { shift: { id: 16 } },
  }
  for (const [path, body] of Object.entries(readings)) {
    fetchMock.mockResolvedValueOnce(reply(200, body))
    await coreFetch(path)
  }
  if (status === 0) fetchMock.mockRejectedValue(new TypeError('Sin red'))
  else fetchMock.mockResolvedValue(reply(status, {}))
  for (const [path, body] of Object.entries(readings)) await expect(coreFetch(path)).resolves.toEqual(body)
  expect(useNetworkStore.getState().online).toBe(false)
  await expect(coreFetch('orders', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'unreachable' })
})

// Falla si una cookie que el servidor no pudo cerrar basta para devolver la identidad después de una salida local.
it('no consulta ni restaura auth/me después de salir hasta que haya otro acceso explícito', async () => {
  remember('auth/me', JSON.stringify({ account: { id: '2' } }))
  endCacheSession()
  localStorage.setItem('waiter.cache:burger-house:auth/me', '{"account":{"id":"2"}}')
  fetchMock.mockResolvedValue(reply(200, { account: { id: '2' } }))
  await expect(coreFetch('auth/me')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
  expect(fetchMock).not.toHaveBeenCalled()
  startCacheSession()
  fetchMock.mockResolvedValue(reply(200, { account: { id: '3' } }))
  await expect(coreFetch('auth/me')).resolves.toEqual({ account: { id: '3' } })
})

// Falla si un GET iniciado antes de salir repuebla la caché o entrega la identidad antigua a quien lo esperaba.
it('rechaza el GET tardío al salir y no guarda la identidad en una sesión nueva', async () => {
  let finish!: (response: ReturnType<typeof reply>) => void
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const pending = coreFetch('auth/me')
  endCacheSession()
  startCacheSession()
  remember('auth/me', '{"account":{"id":"nueva"}}')
  finish(reply(200, { account: { id: 'anterior' } }))
  await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
  expect(JSON.parse(recall('auth/me')!)).toEqual({ account: { id: 'nueva' } })
})

// Falla si se valida la sesión antes de leer el cuerpo y una salida durante esa lectura permite guardar datos antiguos.
it('descarta una respuesta cuyo cuerpo termina después de salir', async () => {
  let finish!: (text: string) => void
  let reading!: () => void
  const started = new Promise<void>((resolve) => { reading = resolve })
  fetchMock.mockResolvedValueOnce({
    ok: true, status: 200,
    text: () => { reading(); return new Promise<string>((resolve) => { finish = resolve }) },
  })
  const pending = coreFetch('catalog?restaurant_id=1')
  await started
  endCacheSession()
  finish('{"products":[{"id":1}]}')
  await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
  expect(recall('catalog?restaurant_id=1')).toBeNull()
})

// Falla si una lectura pendiente de una organización devuelve o guarda información en la organización siguiente.
it('conserva la organización de la petición y descarta respuestas al cambiarla', async () => {
  let finish!: (response: ReturnType<typeof reply>) => void
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const pending = coreFetch('auth/me')
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'frisby'
  remember('auth/me', '{"account":{"id":"frisby"}}')
  finish(reply(200, { account: { id: 'burger' } }))
  await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
  expect(fetchMock.mock.calls[0][1].headers['X-Waiter-Org']).toBe('burger-house')
  expect(JSON.parse(recall('auth/me')!)).toEqual({ account: { id: 'frisby' } })
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  expect(recall('auth/me')).toBeNull()
})

// Falla si una petición sin red iniciada en una organización toma la identidad guardada de otra al terminar.
it('el fallback offline también rechaza lecturas de una organización anterior', async () => {
  let fail!: (error: Error) => void
  fetchMock.mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
  const pending = coreFetch('auth/me')
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'frisby'
  remember('auth/me', '{"account":{"id":"frisby"}}')
  fail(new TypeError('Sin red'))
  await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
  expect(useNetworkStore.getState().online).toBe(true)
})
