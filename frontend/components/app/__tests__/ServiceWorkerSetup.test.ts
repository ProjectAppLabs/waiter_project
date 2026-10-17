import { registersHere, removeServiceWorker } from '@/components/app/ServiceWorkerSetup'

function setup(controlled: boolean, registrations = 1) {
  const unregister = jest.fn(async () => true)
  const reload = jest.fn()
  const deleted: string[] = []
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    getRegistrations: jest.fn(async () => Array.from({ length: registrations }, () => ({ unregister }))),
    controller: controlled ? {} : null,
  } })
  Object.defineProperty(window, 'caches', { configurable: true, value: {
    keys: jest.fn(async () => ['waiter-app-v4', 'otra-cosa']), delete: jest.fn(async (n: string) => { deleted.push(n); return true }),
  } })
  return { unregister, reload, deleted }
}

// Falla si en desarrollo queda vivo el service worker de una prueba de producción (servía CSS viejo y en escritorio
// aparecía la franja del menú móvil), si quedan sus copias, o si la página que ya controlaba no se recarga.
it('en desarrollo quita el service worker viejo, borra sus copias y recarga una vez', async () => {
  const { unregister, reload, deleted } = setup(true)
  await removeServiceWorker(reload)
  expect(unregister).toHaveBeenCalled()
  expect(deleted).toEqual(['waiter-app-v4'])
  expect(reload).toHaveBeenCalledTimes(1)
})

// Falla si sin service worker la página se recarga igual (quedaría recargando en cada visita).
it('sin service worker no recarga', async () => {
  const { reload } = setup(false, 0)
  await removeServiceWorker(reload)
  expect(reload).not.toHaveBeenCalled()
})

// Falla si el service worker del POS se registra en el dominio base, donde con alcance «/» tomaría las páginas de la
// landing, o si deja de registrarse en el subdominio de una organización, la consola o una tableta por la IP.
it('solo se registra donde hay POS o consola', () => {
  expect(registersHere('waiter.projectapp.co')).toBe(false)
  expect(registersHere('frisby.waiter.projectapp.co')).toBe(true)
  expect(registersHere('platform.waiter.projectapp.co')).toBe(true)
  expect(registersHere('192.168.56.10:3000')).toBe(true)
  expect(registersHere('localhost:3000')).toBe(true)
})
