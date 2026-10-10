import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LocateDelivery } from '../LocateDelivery'
import { SavedAddresses } from '../SavedAddresses'
import { SmartCart } from '../SmartOrder'
import { deleteAddress, getLocateLink, revokeData, savedAddresses, sendLocateLink } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Entry } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
// El mapa real necesita un navegador; aquí basta un pin que se mueve con un botón.
jest.mock('next/dynamic', () => () => function Mapa({ onChange, value }: { onChange: (p: { lat: number; lng: number }) => void; value: { lat: number; lng: number } | null }) {
  return <><button type="button" onClick={() => onChange({ lat: 6.2, lng: -75.57 })}>Marcar en el mapa</button><output aria-label="Centro del mapa">{value ? `${value.lat},${value.lng}` : 'sin punto'}</output></>
})
const inicial = useDinerStore.getInitialState()
beforeEach(() => { jest.resetAllMocks(); useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'salon', token: null } }, true) })
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si el enlace de WhatsApp no deja marcar la entrega y enviarla, si un enlace usado sigue sirviendo o si no se
// avisa cuando la dirección queda fuera de la zona.
it('ubica la entrega desde el enlace de WhatsApp', async () => {
  jest.mocked(getLocateLink).mockResolvedValueOnce({ restaurante: 'demo', sede: { slug: 'salon', nombre: 'El Poblado' }, usado: false })
  jest.mocked(sendLocateLink).mockResolvedValue({ ok: true, cobertura: false })
  const { unmount } = render(<LocateDelivery token="tok" />)
  expect(await screen.findByText('El Poblado')).toBeInTheDocument()
  const enviar = screen.getByRole('button', { name: 'Enviar ubicación' })
  expect(enviar).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar en el mapa' }))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 9 # 40-10' } })
  await act(async () => fireEvent.click(enviar))
  expect(sendLocateLink).toHaveBeenCalledWith('tok', { lat: 6.2, lng: -75.57, direccion: 'Calle 9 # 40-10', indicaciones: '' })
  expect(await screen.findByText(/fuera de nuestra zona/)).toBeInTheDocument()
  unmount()
  jest.mocked(getLocateLink).mockResolvedValueOnce({ restaurante: 'demo', usado: true })
  render(<LocateDelivery token="tok" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace ya no sirve')
})

// Falla si el comensal no puede borrar una dirección o retirar su autorización, o si sin direcciones aparece la sección.
it('borra direcciones y retira la autorización', async () => {
  jest.mocked(savedAddresses).mockResolvedValue([{ id: 3, etiqueta: 'Casa', direccion: 'Calle 9', indicaciones: 'Apto 301', lat: 6.2, lng: -75.5 }, { id: 4, etiqueta: 'Oficina', direccion: 'Carrera 43', indicaciones: '', lat: 6.2, lng: -75.5 }])
  jest.mocked(deleteAddress).mockResolvedValue()
  jest.mocked(revokeData).mockResolvedValue()
  render(<SavedAddresses />)
  expect(await screen.findByText(/Calle 9/)).toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Borrar' })[0]))
  expect(deleteAddress).toHaveBeenCalledWith('demo', 3)
  expect(screen.queryByText(/Calle 9/)).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retirar la autorización de mis datos' })))
  expect(revokeData).toHaveBeenCalledWith('demo')
  expect(screen.getByText(/retiraste la autorización/)).toBeInTheDocument()
})

// Falla si una sede sin domicilio ofrece «A domicilio» al confirmar.
it('no ofrece domicilio si la sede no lo tiene', async () => {
  const carrito: Cart = { sesion: 'v', total: 9000, mio: 9000, por_comensal: [], lineas: [{ id: 1, producto_id: 7, nombre: 'Sopa', cantidad: 1, precio: 9000, subtotal: 9000, mio: true, comensal: 'a', nota: '' }] }
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  useDinerStore.setState({ cart: carrito, entry: { domicilio: { enabled: false, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  render(<SmartCart />)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recoger en el local' })).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'A domicilio' })).toBeNull()
})

// Falla si al pedir domicilio en el chat no aparecen los dos caminos (mi ubicación u otra persona), si la ubicación no
// se cotiza, si no queda lista para el pedido o si fuera de zona no se ofrece recoger.
it('comparte la ubicación desde el chat del mesero', async () => {
  const { ChatDelivery } = await import('../ChatDelivery')
  const { quoteDelivery, getVenueLocation } = jest.requireMock('@/lib/services/api')
  jest.mocked(getVenueLocation).mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  jest.mocked(quoteDelivery).mockResolvedValueOnce({ cobertura: true, sede: { slug: 'salon', nombre: 'El Poblado' }, distancia_km: 0.9, envio: 4000, minimo: 20000, metodos: ['cash'] })
    .mockResolvedValueOnce({ cobertura: false, motivo: 'fuera_de_zona', recoger: [{ slug: 'salon', nombre: 'El Poblado', direccion: '' }] })
  useDinerStore.setState({ entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 6.21, longitude: -75.57 } }) } })
  const salir = jest.fn()
  render(<ChatDelivery pedido="/demo/salon/pedido" onLeave={salir} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '📍 Compartir mi ubicación' })))
  expect(quoteDelivery).toHaveBeenCalledWith('demo', 6.21, -75.57)
  expect(await screen.findByText(/Te lo lleva El Poblado/)).toBeInTheDocument()
  expect(useDinerStore.getState().deliveryDraft).toEqual({ lat: 6.21, lng: -75.57, direccion: '' })
  fireEvent.click(screen.getByRole('button', { name: 'Elegir mis platos →' }))
  expect(salir).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar la ubicación' }))
  fireEvent.click(screen.getByRole('button', { name: 'Es para otra persona' }))
  fireEvent.click(screen.getByRole('button', { name: 'Marcar en el mapa' }))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 80' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Usar esta ubicación' })))
  expect(await screen.findByText(/fuera de nuestra zona/)).toBeInTheDocument()
  expect(screen.getByText('Puedes recogerlo en El Poblado.')).toBeInTheDocument()
})

// Falla si desde una mesa el chat ofrece compartir la ubicación (ese pedido no puede ser domicilio).
it('en una mesa no ofrece domicilio', async () => {
  const { ChatDelivery } = await import('../ChatDelivery')
  useDinerStore.setState({ entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: { numero: 3 } }, carta: { categorias: [] } } as unknown as Entry })
  render(<ChatDelivery pedido="/demo/salon/pedido" onLeave={jest.fn()} />)
  expect(screen.queryByRole('button', { name: '📍 Compartir mi ubicación' })).toBeNull()
  expect(screen.getByText(/pidiendo desde una mesa/)).toBeInTheDocument()
})


// Falla si al asentar el pin no aparece su dirección aproximada (y no llena el campo), si escribir una dirección no
// lleva el mapa hasta allá, o si la dirección que el cliente escribió la pisa el pin.
it('dirección y mapa en las dos direcciones', async () => {
  const { DeliverySheet } = await import('../DeliverySheet')
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  api.reverseAddress.mockResolvedValue('Calle 9A 37-16, El Poblado, Medellín')
  api.searchAddress.mockResolvedValue([{ texto: 'Calle 10, El Poblado', lat: 6.2098, lng: -75.5684 }])
  useDinerStore.setState({ session: { id: 'visita', estado: 'abierta', mesa: null }, entry: { domicilio: { enabled: true, buscador: true }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  render(<DeliverySheet onReady={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Marcar en el mapa' }))
  expect(await screen.findByText('Calle 9A 37-16, El Poblado, Medellín', {}, { timeout: 2000 })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 9A 37-16, El Poblado, Medellín'))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 10 # 43-12' } })
  await act(async () => fireEvent.keyDown(screen.getByLabelText('Dirección'), { key: 'Enter' }))
  expect(api.searchAddress).toHaveBeenCalledWith('demo', 'Calle 10 # 43-12')
  expect(screen.getByLabelText('Centro del mapa')).toHaveTextContent('6.2098,-75.5684')
  await waitFor(() => expect(api.reverseAddress).toHaveBeenLastCalledWith('demo', 6.2098, -75.5684), { timeout: 2000 })
  expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 10 # 43-12')
})
