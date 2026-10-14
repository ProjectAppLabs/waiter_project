import * as pagos from '../payments'
import { http } from '../api'

jest.mock('../api', () => ({ http: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }))
const respuesta = { id: 'pago-1', status: 'PENDING', reference: 'referencia', amount_in_cents: 2400000 }
const fetchOriginal = global.fetch
beforeEach(() => {
  jest.resetAllMocks()
  global.fetch = jest.fn()
  jest.mocked(http.get).mockResolvedValue({ data: respuesta })
  jest.mocked(http.post).mockResolvedValue({ data: respuesta })
  jest.mocked(http.delete).mockResolvedValue({ data: {} })
})
afterEach(() => { global.fetch = fetchOriginal })

// Falla si consultar, crear y seguir un pago dejan de referirse a la misma visita o se pierde el importe del servidor.
it('consulta los medios, crea el pago y sigue su resultado en la visita', async () => {
  expect(await pagos.paymentContext('visita')).toEqual(respuesta)
  expect(http.get).toHaveBeenLastCalledWith('/api/v1/sesiones/visita/pagos/', { timeout: 25000 })
  const datos = { method: 'NEQUI', phone: '3001234567' }
  expect(await pagos.createPayment('visita', datos)).toEqual(respuesta)
  expect(http.post).toHaveBeenCalledWith('/api/v1/sesiones/visita/pagos/', datos, { timeout: 45000 })
  expect(await pagos.readPayment('visita', 'pago-1')).toEqual(respuesta)
  expect(http.get).toHaveBeenLastCalledWith('/api/v1/sesiones/visita/pagos/pago-1/', { timeout: 25000 })
  await pagos.finishPaymentTest('visita', 'pago-1')
  expect(http.delete).toHaveBeenCalledWith('/api/v1/sesiones/visita/pagos/pago-1/')
})

// Falla si el anticipo pierde o interpreta como ruta parte del token del enlace de reserva.
it('paga y consulta una reserva con el token completo del enlace', async () => {
  const ruta = '/api/v1/casa/centro/reservas/token%2Fcon%20espacio/pagos/'
  expect(await pagos.reservationPayContext('casa', 'centro', 'token/con espacio')).toEqual(respuesta)
  expect(http.get).toHaveBeenLastCalledWith(ruta, { timeout: 25000 })
  expect(await pagos.createReservationPayment('casa', 'centro', 'token/con espacio', { method: 'NEQUI' })).toEqual(respuesta)
  expect(http.post).toHaveBeenCalledWith(ruta, { method: 'NEQUI' }, { timeout: 45000 })
  expect(await pagos.readReservationPayment('casa', 'centro', 'token/con espacio', 'pago-1')).toEqual(respuesta)
  expect(http.get).toHaveBeenLastCalledWith(`${ruta}pago-1/`, { timeout: 25000 })
  await pagos.finishReservationPaymentTest('casa', 'centro', 'token/con espacio', 'pago-1')
  expect(http.delete).toHaveBeenCalledWith(`${ruta}pago-1/`)
})

// Falla si los datos de tarjeta pasan por la API del restaurante o se envían con cookies o al entorno equivocado.
it.each([['test', 'sandbox'], ['prod', 'production']] as const)('tokeniza directamente en el entorno %s sin cookies', async (entorno, host) => {
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'CREATED', data: { id: 'token-tarjeta' } }) } as Response)
  const tarjeta = { number: '4242424242424242', cvc: '123', exp_month: '12', exp_year: '30', card_holder: 'Ana Ruiz' }
  expect(await pagos.tokenizeCard(entorno, 'llave-publica', tarjeta)).toBe('token-tarjeta')
  expect(fetch).toHaveBeenCalledWith(`https://${host}.wompi.co/v1/tokens/cards`, expect.objectContaining({ method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer llave-publica' }, body: JSON.stringify(tarjeta) }))
  expect(http.post).not.toHaveBeenCalled()
})

// Falla si una tarjeta rechazada o una respuesta incompleta se interpreta como token válido.
it.each([
  [false, {}, 'No pudimos validar la tarjeta'],
  [true, { status: 'ERROR' }, 'Wompi no pudo validar la tarjeta'],
  [true, { status: 'CREATED', data: { id: 17 } }, 'Wompi no pudo validar la tarjeta'],
])('rechaza la tokenización inválida %j %j', async (ok, data, mensaje) => {
  jest.mocked(fetch).mockResolvedValue({ ok, json: async () => data } as Response)
  await expect(pagos.tokenizeCard('test', 'llave', {})).rejects.toThrow(mensaje)
  expect(http.post).not.toHaveBeenCalled()
})
