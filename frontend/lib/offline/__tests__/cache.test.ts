import { captureCacheContext, endCacheSession, recall, remember, startCacheSession } from '@/lib/offline/cache'

beforeEach(() => {
  localStorage.clear()
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  startCacheSession()
})
afterEach(() => { jest.restoreAllMocks(); startCacheSession() })

// Falla si salir deja una identidad o lecturas anteriores recuperables al recargar, o elimina operaciones pendientes.
it('retira lecturas antiguas de esta organización y conserva su cola y las otras organizaciones', () => {
  localStorage.setItem('waiter.cache:burger-house:auth/me', '{"account":{"id":"vieja"}}')
  remember('auth/me', '{"account":{"id":"2"}}')
  remember('notifications', '{"notifications":[{"id":7}]}')
  localStorage.setItem('waiter.cache:frisby:auth/me', '{"account":{"id":"otra"}}')
  localStorage.setItem('waiter.outbox:burger-house', '{"entries":[{"id":"pendiente"}]}')

  endCacheSession()
  expect(recall('auth/me')).toBeNull()
  expect(recall('notifications')).toBeNull()
  expect(localStorage.getItem('waiter.cache:burger-house:auth/me')).toBeNull()
  expect(localStorage.getItem('waiter.cache:frisby:auth/me')).toBe('{"account":{"id":"otra"}}')
  expect(localStorage.getItem('waiter.outbox:burger-house')).toBe('{"entries":[{"id":"pendiente"}]}')

  // Incluso una entrada de la versión anterior que reaparezca no vale después de la salida persistida.
  localStorage.setItem('waiter.cache:burger-house:auth/me', '{"account":{"id":"vieja"}}')
  jest.isolateModules(() => {
    const reloaded = jest.requireActual<typeof import('@/lib/offline/cache')>('@/lib/offline/cache')
    expect(reloaded.recall('auth/me')).toBeNull()
  })
})

// Falla si una sesión vigente pierde las lecturas que necesita para seguir operando sin servidor.
it('conserva la identidad, la carta y la caja durante la misma sesión', () => {
  const readings = {
    'auth/me': '{"account":{"id":"2"}}',
    'catalog?restaurant_id=1': '{"products":[{"id":1}]}',
    'shifts/open?restaurant_id=1': '{"shift":{"id":16}}',
  }
  for (const [path, text] of Object.entries(readings)) {
    remember(path, text)
    expect(recall(path)).toBe(text)
  }
})

// Falla si el acceso de otra cuenta hereda avisos, pedidos o identidad de la anterior en la misma organización.
it('un nuevo acceso empieza sin lecturas personales de la cuenta anterior', () => {
  remember('auth/me', '{"account":{"id":"2"}}')
  remember('notifications', '{"notifications":[{"id":7}]}')
  startCacheSession()
  expect(recall('auth/me')).toBeNull()
  expect(recall('notifications')).toBeNull()
  remember('auth/me', '{"account":{"id":"3"}}')
  expect(recall('auth/me')).toBe('{"account":{"id":"3"}}')
})

// Falla si la organización de una lectura se decide al terminar en vez de conservar la que la pidió.
it('aísla lecturas y descarta respuestas de una organización que ya no está abierta', () => {
  remember('auth/me', '{"account":{"id":"burger"}}')
  const burger = captureCacheContext()
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'frisby'
  expect(recall('auth/me')).toBeNull()
  remember('auth/me', '{"account":{"id":"frisby"}}')
  remember('auth/me', '{"account":{"id":"tardía"}}', burger)
  expect(recall('auth/me', burger)).toBeNull()
  expect(recall('auth/me')).toBe('{"account":{"id":"frisby"}}')
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  expect(recall('auth/me')).toBe('{"account":{"id":"burger"}}')
})

// Falla si una respuesta pendiente vuelve a guardar datos después de salir o pisa los de la siguiente cuenta.
it('una lectura iniciada antes de salir no puede repoblar ninguna sesión posterior', () => {
  const previous = captureCacheContext()
  endCacheSession()
  remember('auth/me', '{"account":{"id":"vieja"}}', previous)
  expect(recall('auth/me')).toBeNull()
  startCacheSession()
  remember('auth/me', '{"account":{"id":"nueva"}}')
  remember('auth/me', '{"account":{"id":"vieja"}}', previous)
  expect(recall('auth/me')).toBe('{"account":{"id":"nueva"}}')
})

// Falla si denegar las escrituras del navegador permite que una respuesta tardía reactive la caché de esta pestaña.
it('la salida también invalida lecturas cuando el navegador no permite limpiar ni guardar', () => {
  const identity = '{"account":{"id":"2"}}'
  remember('auth/me', identity)
  const storedKey = Object.keys(localStorage).find((key) => key.startsWith('waiter.cache:') && key.endsWith(':auth/me'))!
  const previous = captureCacheContext()
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Sin almacenamiento') })
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Sin almacenamiento') })
  endCacheSession()
  remember('auth/me', '{"account":{"id":"2"}}', previous)
  expect(recall('auth/me')).toBeNull()
  expect(localStorage.getItem(storedKey)).toBe(identity)
})
