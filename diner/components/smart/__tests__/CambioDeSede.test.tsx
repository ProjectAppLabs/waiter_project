import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MOVE_DELAY, useVenueSwitch, VenueGuide } from '../VenueGuide'
import { areaBounds, carryTo, takeCarried } from '@/lib/domain/venueRedirect'
import { addLine, quoteDelivery } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Entry } from '@/lib/types'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
jest.mock('next/dynamic', () => () => function Mapa() { return null })
const inicial = useDinerStore.getInitialState()
const sinMesa = { domicilio: { enabled: true, buscador: true, centro: { lat: 6.2, lng: -75.5 }, radio_km: 5 }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry
const pedido = { lineas: [{ mio: true, cantidad: 2, producto_id: 7, nombre: 'Hamburguesa', nota: 'Sin cebolla' }, { mio: true, cantidad: 1, producto_id: 9, nombre: 'Malteada', nota: '' },
  { mio: false, cantidad: 1, producto_id: 3, nombre: 'De otro comensal', nota: '' }] } as unknown as Cart
beforeEach(() => { jest.resetAllMocks(); sessionStorage.clear(); useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'poblado', token: null }, entry: sinMesa }, true) })
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si al pasar a otra sede no se avisa antes (dirección guardada y a qué sede va), si se salta sin dar tiempo de
// leerlo, si no se llevan los platos del comensal (con cantidad y nota), si se llevan los de otros comensales, o si con
// platos no se abre el pedido en la sede nueva.
it('avisa y lleva el pedido a la otra sede', () => {
  jest.useFakeTimers()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  useDinerStore.setState({ cart: pedido })
  let go: ReturnType<typeof useVenueSwitch>['go'] = () => undefined
  function Probe() { go = useVenueSwitch().go; return <VenueGuide /> }
  render(<Probe />)
  act(() => go('duitama', 'Duitama', { lat: 5.8, lng: -73, direccion: 'Calle 15' }))
  expect(screen.getByRole('heading', { name: 'Te llevamos a la sede Duitama' })).toBeInTheDocument()
  expect(screen.getByText('Calle 15')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(MOVE_DELAY))
  expect(push).toHaveBeenCalledWith('/demo/duitama/pedido')
  jest.useRealTimers()
  const llevado = takeCarried('demo', 'duitama')!
  expect(llevado.lines).toEqual([{ producto_id: 7, cantidad: 2, nota: 'Sin cebolla', nombre: 'Hamburguesa' }, { producto_id: 9, cantidad: 1, nota: '', nombre: 'Malteada' }])
})

// Falla si al llegar no se agregan los platos que traía, si uno no disponible en esta sede detiene los demás o no se
// avisa cuál faltó, si la ubicación no queda lista para el domicilio, si el aviso de paso no se quita o si no se pide
// reabrir la confirmación del pedido.
it('al llegar agrega lo que traía y avisa lo que no está', async () => {
  useDinerStore.setState({ keys: { rest: 'demo', venue: 'duitama', token: null }, venueMove: { nombre: 'Duitama', direccion: 'Calle 15' }, ensureSession: jest.fn().mockResolvedValue({ id: 'visita-2' }) as never,
    entry: { ...sinMesa, contexto: { mesa: null, sede: { slug: 'duitama', nombre: 'Duitama' } } } as unknown as Entry })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  carryTo('demo', 'duitama', { lat: 5.83, lng: -73.03, direccion: 'Calle 15' }, 'Te pasamos a la sede Duitama.', [
    { producto_id: 7, cantidad: 2, nota: 'Sin cebolla', nombre: 'Hamburguesa' }, { producto_id: 9, cantidad: 1, nota: '', nombre: 'Malteada' }])
  jest.mocked(addLine).mockResolvedValueOnce({ lineas: [] } as never).mockRejectedValueOnce(new Error('agotado'))
  render(<VenueGuide />)
  expect(await screen.findByText(/Trajimos tu pedido\. No están disponibles aquí: Malteada\./)).toBeInTheDocument()
  expect(addLine).toHaveBeenCalledWith('visita-2', 7, 2, 'Sin cebolla')
  expect(useDinerStore.getState().deliveryDraft).toEqual({ lat: 5.83, lng: -73.03, direccion: 'Calle 15' })
  expect(useDinerStore.getState().venueMove).toBeNull()
  expect(useDinerStore.getState().reopenDelivery).toBe(true)
  expect(screen.queryByRole('heading', { name: /Te llevamos/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
  expect(screen.queryByText(/Trajimos/)).toBeNull()
})

// Falla si se vuelve a pedir la ubicación al cargar la sede (debe pedirse en contexto: al escoger domicilio o con el
// botón de la portada).
it('no pide la ubicación al cargar', async () => {
  const pedir = jest.fn()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: pedir } })
  render(<VenueGuide />)
  await act(async () => undefined)
  expect(pedir).not.toHaveBeenCalled()
  expect(quoteDelivery).not.toHaveBeenCalled()
})

// Falla si la ubicación que se lleva a otra sede se lee en una sede distinta o dos veces, o si la zona del mapa no
// contiene el radio de domicilio.
it('lleva la ubicación una sola vez y calcula la zona del mapa', () => {
  carryTo('demo', 'duitama', { lat: 5.8, lng: -73, direccion: 'Calle 15' }, 'motivo')
  expect(takeCarried('demo', 'poblado')).toBeNull()
  expect(takeCarried('demo', 'duitama')).toEqual({ location: { lat: 5.8, lng: -73, direccion: 'Calle 15' }, motivo: 'motivo', lines: [] })
  expect(takeCarried('demo', 'duitama')).toBeNull()
  const [[w, s], [e, n]] = areaBounds({ lat: 6.2, lng: -75.5 }, 5)
  expect(n - 6.2).toBeCloseTo(6.5 / 111, 4)
  expect(e - (-75.5)).toBeGreaterThan(n - 6.2)
  expect([w, s]).toEqual([-75.5 - (e + 75.5), 6.2 - (n - 6.2)])
})

// Falla si al escoger «A domicilio» no se pide la ubicación (el momento indicado), si se pide cuando el cliente ya la
// negó, o si una ubicación que atiende otra sede no lleva al cliente allá.
it('pide la ubicación al escoger domicilio y lo lleva a su sede', async () => {
  const { DeliverySheet } = await import('../DeliverySheet')
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  api.reverseAddress.mockResolvedValue('')
  api.quoteDelivery.mockResolvedValue({ cobertura: true, sede: { slug: 'duitama', nombre: 'Duitama' }, distancia_km: .5, envio: 3000, minimo: 0, metodos: ['cash'] })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 5.83, longitude: -73.03 } }) } })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: jest.fn().mockResolvedValue({ state: 'prompt' }) } })
  render(<DeliverySheet onReady={jest.fn()} />)
  await waitFor(() => expect(push).toHaveBeenCalledWith('/demo/duitama/carta'))
  push.mockClear(); api.quoteDelivery.mockClear()
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: jest.fn().mockResolvedValue({ state: 'denied' }) } })
  render(<DeliverySheet onReady={jest.fn()} />)
  await act(async () => undefined)
  expect(api.quoteDelivery).not.toHaveBeenCalled()
})
