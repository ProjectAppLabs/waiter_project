import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { VenueGuide } from '../VenueGuide'
import { areaBounds, carryTo, takeCarried } from '@/lib/domain/venueRedirect'
import { quoteDelivery } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Entry } from '@/lib/types'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
jest.mock('next/dynamic', () => () => function Mapa() { return null })
const inicial = useDinerStore.getInitialState()
const sinMesa = { domicilio: { enabled: true, buscador: true, centro: { lat: 6.2, lng: -75.5 }, radio_km: 5 }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry
const conPlatos = { lineas: [{ mio: true, cantidad: 1 }] } as unknown as Cart
const gps = (lat: number, lng: number) => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lng } }) } })
beforeEach(() => { jest.resetAllMocks(); sessionStorage.clear(); useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'poblado', token: null }, entry: sinMesa }, true) })
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si al entrar sin mesa no se pide la ubicación, si no se lleva al cliente a la sede que le llega (con su ubicación
// lista y el aviso al llegar), si se pregunta más de una vez por pestaña o si se pide desde una mesa.
it('lleva al cliente a la sede más cercana al entrar', async () => {
  jest.mocked(quoteDelivery).mockResolvedValue({ cobertura: true, sede: { slug: 'duitama', nombre: 'Duitama' }, distancia_km: .5, envio: 3000, minimo: 0, metodos: ['cash'] })
  gps(5.83, -73.03)
  const { unmount } = render(<VenueGuide />)
  await waitFor(() => expect(push).toHaveBeenCalledWith('/demo/duitama/carta'))
  expect(quoteDelivery).toHaveBeenCalledWith('demo', 5.83, -73.03)
  unmount()
  useDinerStore.setState({ keys: { rest: 'demo', venue: 'duitama', token: null } })
  render(<VenueGuide />)
  expect(await screen.findByText(/Te mostramos la sede Duitama/)).toBeInTheDocument()
  expect(useDinerStore.getState().deliveryDraft).toEqual({ lat: 5.83, lng: -73.03, direccion: '' })
  expect(quoteDelivery).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
  expect(screen.queryByText(/Te mostramos/)).toBeNull()
})

// Falla si se le borra el pedido al cliente que ya tiene platos (debe avisarse y no saltar), o si desde una mesa se pide
// la ubicación.
it('no salta de sede con platos en el pedido ni pregunta desde una mesa', async () => {
  jest.mocked(quoteDelivery).mockResolvedValue({ cobertura: true, sede: { slug: 'duitama', nombre: 'Duitama' }, distancia_km: .5, envio: 3000, minimo: 0, metodos: ['cash'] })
  gps(5.83, -73.03)
  useDinerStore.setState({ cart: conPlatos })
  render(<VenueGuide />)
  expect(await screen.findByText(/La sede Duitama te queda más cerca/)).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
  sessionStorage.clear()
  jest.mocked(quoteDelivery).mockClear()
  useDinerStore.setState({ entry: { ...sinMesa, contexto: { mesa: { numero: 3 } } } as unknown as Entry })
  render(<VenueGuide />)
  await act(async () => undefined)
  expect(quoteDelivery).not.toHaveBeenCalled()
})

// Falla si la ubicación que se lleva a otra sede se lee en una sede distinta o dos veces, o si la zona del mapa no
// contiene el radio de domicilio.
it('lleva la ubicación una sola vez y calcula la zona del mapa', () => {
  carryTo('demo', 'duitama', { lat: 5.8, lng: -73, direccion: 'Calle 15' }, 'motivo')
  expect(takeCarried('demo', 'poblado')).toBeNull()
  expect(takeCarried('demo', 'duitama')).toEqual({ location: { lat: 5.8, lng: -73, direccion: 'Calle 15' }, motivo: 'motivo' })
  expect(takeCarried('demo', 'duitama')).toBeNull()
  const [[w, s], [e, n]] = areaBounds({ lat: 6.2, lng: -75.5 }, 5)
  expect(n - 6.2).toBeCloseTo(6.5 / 111, 4)
  expect(e - (-75.5)).toBeGreaterThan(n - 6.2)
  expect([w, s]).toEqual([-75.5 - (e + 75.5), 6.2 - (n - 6.2)])
})
