import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LocateDelivery } from '../LocateDelivery'
import { SavedAddresses } from '../SavedAddresses'
import { SmartCart } from '../SmartOrder'
import { deleteAddress, getLocateLink, revokeData, savedAddresses, sendLocateLink } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Entry } from '@/lib/types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockPush }), useSearchParams: () => null }))
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
// se cotiza, si no se le confirma al cliente la dirección y se sigue con el pedido (categorías de un toque), si no queda
// lista para el pedido o si fuera de zona no se ofrece recoger.
it('comparte la ubicación desde el chat del mesero', async () => {
  const { ChatDelivery } = await import('../ChatDelivery')
  const { quoteDelivery, getVenueLocation, reverseAddress } = jest.requireMock('@/lib/services/api')
  jest.mocked(getVenueLocation).mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  jest.mocked(reverseAddress).mockResolvedValue('Calle 9A 37-16, El Poblado, Medellín')
  jest.mocked(quoteDelivery).mockResolvedValueOnce({ cobertura: true, sede: { slug: 'salon', nombre: 'El Poblado' }, distancia_km: 0.9, envio: 4000, minimo: 20000, metodos: ['cash'] })
    .mockResolvedValueOnce({ cobertura: false, motivo: 'fuera_de_zona', recoger: [{ slug: 'salon', nombre: 'El Poblado', direccion: '' }] })
  useDinerStore.setState({ entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [
    { id: 1, nombre: 'Hamburguesas', productos: [{ id: 3 }] }, { id: 2, nombre: 'Vacía', productos: [] }] } } as unknown as Entry })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 6.21, longitude: -75.57 } }) } })
  const salir = jest.fn(), enviar = jest.fn()
  render(<ChatDelivery pedido="/demo/salon/pedido" onLeave={salir} onSend={enviar} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '📍 Compartir mi ubicación' })))
  expect(quoteDelivery).toHaveBeenCalledWith('demo', 6.21, -75.57)
  expect(await screen.findByText('Calle 9A 37-16, El Poblado, Medellín')).toBeInTheDocument()
  expect(screen.getByText(/Te lo lleva El Poblado/)).toBeInTheDocument()
  expect(screen.getByText('¡Listo! Continuemos con tu pedido: ¿qué te gustaría ordenar?')).toBeInTheDocument()
  expect(useDinerStore.getState().deliveryDraft).toEqual({ lat: 6.21, lng: -75.57, direccion: 'Calle 9A 37-16, El Poblado, Medellín' })
  expect(screen.queryByRole('button', { name: 'Vacía' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Hamburguesas' }))
  expect(enviar).toHaveBeenCalledWith('Hamburguesas')
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta completa' }))
  expect(salir).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar la ubicación' }))
  fireEvent.click(screen.getByRole('button', { name: 'Es para otra persona' }))
  fireEvent.click(screen.getByRole('button', { name: 'Marcar en el mapa' }))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 80' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Usar esta ubicación' })))
  expect(await screen.findByText('Ninguna de nuestras sedes tiene cobertura en esa dirección.')).toBeInTheDocument()
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


// Falla si al asentar el pin no aparece su dirección aproximada (y no llena el campo), si buscar la dirección escrita no
// lleva el mapa hasta allá, o si el pin pisa la dirección encontrada.
it('dirección y mapa en las dos direcciones', async () => {
  const { DeliverySheet } = await import('../DeliverySheet')
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  api.reverseAddress.mockResolvedValue('Calle 9A 37-16, El Poblado, Medellín')
  api.searchAddress.mockResolvedValue({ resultados: [{ texto: 'Cl 10 #43-12, El Poblado, Medellín, Antioquia', lat: 6.2098, lng: -75.5684 }], fueraDeCobertura: false })
  useDinerStore.setState({ session: { id: 'visita', estado: 'abierta', mesa: null }, entry: { domicilio: { enabled: true, buscador: true }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  render(<DeliverySheet onReady={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Marcar en el mapa' }))
  expect(await screen.findByText('Calle 9A 37-16, El Poblado, Medellín', {}, { timeout: 2000 })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 9A 37-16, El Poblado, Medellín'))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 10 # 43-12' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buscar' })))
  expect(api.searchAddress).toHaveBeenCalledWith('demo', 'Calle 10 # 43-12')
  expect(screen.getByLabelText('Centro del mapa')).toHaveTextContent('6.2098,-75.5684')
  await waitFor(() => expect(api.reverseAddress).toHaveBeenLastCalledWith('demo', 6.2098, -75.5684), { timeout: 2000 })
  expect(screen.getByLabelText('Dirección')).toHaveValue('Cl 10 #43-12, El Poblado, Medellín, Antioquia')
})


// Falla si buscar gasta más de una consulta por dirección (repetir la misma búsqueda o buscar mientras se escribe), si
// con varias coincidencias no deja escoger sin otra consulta, o si una dirección incompleta se busca en vez de pedir más.
it('busca la dirección una sola vez y deja escoger entre varias', async () => {
  const { AddressSearch } = await import('../AddressSearch')
  const api = jest.requireMock('@/lib/services/api')
  api.searchAddress.mockResolvedValue({ resultados: [{ texto: 'Cl 10 #43-12, El Poblado, Medellín', lat: 6.21, lng: -75.57 }, { texto: 'Cl 10 #43-12, Envigado', lat: 6.17, lng: -75.59 }], fueraDeCobertura: false })
  const escoger = jest.fn()
  function Campo() { const [v, setV] = require('react').useState(''); return <AddressSearch rest="demo" value={v} enabled onType={setV} onPick={escoger} /> }
  render(<Campo />)
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'cl 10' } })
  await act(async () => fireEvent.keyDown(screen.getByLabelText('Dirección'), { key: 'Enter' }))
  expect(screen.getByText(/Escribe la dirección completa/)).toBeInTheDocument()
  expect(api.searchAddress).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 10 # 43-12' } })
  expect(api.searchAddress).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buscar' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buscar' })))
  expect(api.searchAddress).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cl 10 #43-12, Envigado' }))
  expect(escoger).toHaveBeenCalledWith({ texto: 'Cl 10 #43-12, Envigado', lat: 6.17, lng: -75.59 })
  expect(api.searchAddress).toHaveBeenCalledTimes(1)
  // Existe, pero lejos de todas las sedes: se dice que no hay cobertura, no que no se encontró.
  api.searchAddress.mockResolvedValue({ resultados: [], fueraDeCobertura: true })
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Carrera 7 # 72-41 Bogotá' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buscar' })))
  expect(screen.getByText('Ninguna de nuestras sedes tiene cobertura en esa dirección.')).toBeInTheDocument()
})

// Falla si una dirección que atiende otra sede se guarda en esta, si sin platos no se lleva al cliente a esa sede con su
// ubicación, o si con platos se le cambia de sede sin preguntarle.
it('manda a la sede que atiende la dirección', async () => {
  const { DeliverySheet } = await import('../DeliverySheet')
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  api.reverseAddress.mockResolvedValue('')
  api.quoteDelivery.mockResolvedValue({ cobertura: true, sede: { slug: 'duitama', nombre: 'Duitama' }, distancia_km: .5, envio: 3000, minimo: 0, metodos: ['cash'] })
  useDinerStore.setState({ cart: { lineas: [{ mio: true, cantidad: 1 }] } as never, session: { id: 'visita', estado: 'abierta', mesa: null }, entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  render(<DeliverySheet onReady={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Marcar en el mapa' }))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 15 # 16-55' } })
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '3001234567' } })
  fireEvent.click(screen.getByLabelText(/Acepto el tratamiento de datos/))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continuar al pago' })))
  expect(api.setDelivery).not.toHaveBeenCalled()
  expect(screen.getByText(/la atiende la sede/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la sede Duitama con mi pedido' }))
  expect(JSON.parse(sessionStorage.getItem('waiter:domicilio:demo')!)).toMatchObject({ venue: 'duitama', location: { lat: 6.2, lng: -75.57, direccion: 'Calle 15 # 16-55' } })
})


// Falla si una dirección encontrada fuera de la zona de esta sede (otra ciudad) se queda sin respuesta: si otra sede la
// cubre debe transferir allá; si ninguna, decir que ninguna sede tiene cobertura y ofrecer recoger.
it('una dirección de otra ciudad transfiere o dice que no hay cobertura', async () => {
  const { DeliverySheet } = await import('../DeliverySheet')
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: 5.83, longitud: -73.03 })
  api.reverseAddress.mockResolvedValue('')
  api.searchAddress.mockResolvedValue({ resultados: [{ texto: 'Cl 10 #43-12, El Poblado, Medellín', lat: 6.21, lng: -75.57 }], fueraDeCobertura: false })
  api.quoteDelivery.mockResolvedValueOnce({ cobertura: false, motivo: 'fuera_de_zona', recoger: [{ slug: 'duitama', nombre: 'Duitama', direccion: '' }] })
    .mockResolvedValue({ cobertura: true, sede: { slug: 'poblado', nombre: 'Poblado' }, distancia_km: .9, envio: 4000, minimo: 0, metodos: ['cash'] })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  const duitama = { domicilio: { enabled: true, buscador: true, centro: { lat: 5.8267, lng: -73.0337 }, radio_km: 5 }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry
  useDinerStore.setState({ keys: { rest: 'demo', venue: 'duitama', token: null }, session: { id: 'visita', estado: 'abierta', mesa: null }, entry: duitama })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  const { unmount } = render(<DeliverySheet onReady={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 10 # 43-12 Medellín' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buscar' })))
  expect(await screen.findByText('Ninguna de nuestras sedes tiene cobertura en esa dirección. Puedes recogerlo en Duitama.')).toBeInTheDocument()
  expect(screen.getByLabelText('Centro del mapa')).toHaveTextContent('sin punto')
  unmount()
  render(<DeliverySheet onReady={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 10 # 43-12 El Poblado' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buscar' })))
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem('waiter:domicilio:demo') ?? '{}')).toMatchObject({ venue: 'poblado', location: { lat: 6.21, lng: -75.57, direccion: 'Cl 10 #43-12, El Poblado, Medellín' } }))
})

// Falla si fuera del horario de la sede el menú no dice que está cerrada y cuándo abre, si deja seguir al pago, o si el
// domicilio a una dirección cuya sede está cerrada no lo explica (dice «sin cobertura» en vez de cuándo abre).
it('sede cerrada: avisa cuándo abre y no deja confirmar', async () => {
  const { ClosedBanner } = await import('../ClosedBanner')
  const { ChatDelivery } = await import('../ChatDelivery')
  const { quoteDelivery, getVenueLocation, reverseAddress } = jest.requireMock('@/lib/services/api')
  const carrito: Cart = { sesion: 'v', total: 9000, mio: 9000, por_comensal: [], lineas: [{ id: 1, producto_id: 7, nombre: 'Sopa', cantidad: 1, precio: 9000, subtotal: 9000, mio: true, comensal: 'a', nota: '' }] }
  const entry = { horario: { configurado: true, abierto: false, abre: { cuando: 'hoy', hora: '6 p. m.', fecha: '2026-10-10' } },
    domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry
  useDinerStore.setState({ cart: carrito, entry })
  const { unmount } = render(<><ClosedBanner entry={entry} /><SmartCart /></>)
  expect(screen.getByText('Cerrado ahora · abre hoy a las 6 p. m.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeDisabled()
  unmount()
  jest.mocked(getVenueLocation).mockResolvedValue({ direccion: '', latitud: 6.2, longitud: -75.5 })
  jest.mocked(reverseAddress).mockResolvedValue('Calle 9')
  jest.mocked(quoteDelivery).mockResolvedValue({ cobertura: false, motivo: 'cerrado', sede: { slug: 'salon', nombre: 'El Poblado' },
    mensaje: 'La sede El Poblado está cerrada en este momento. Abre hoy a las 6 p. m.', recoger: [] })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 6.21, longitude: -75.57 } }) } })
  render(<ChatDelivery pedido="/demo/salon/pedido" onLeave={jest.fn()} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '📍 Compartir mi ubicación' })))
  expect(await screen.findByText('La sede El Poblado está cerrada en este momento. Abre hoy a las 6 p. m.')).toBeInTheDocument()
  expect(screen.queryByText(/Ninguna de nuestras sedes/)).toBeNull()
})

// Falla si una sede abierta (o sin horario) muestra el aviso de cerrado.
it('sede abierta o sin horario: sin aviso', async () => {
  const { ClosedBanner } = await import('../ClosedBanner')
  const { container } = render(<><ClosedBanner entry={{ horario: { configurado: true, abierto: true, cierra: '10 p. m.' } } as unknown as Entry} />
    <ClosedBanner entry={{} as unknown as Entry} /></>)
  expect(container).toBeEmptyDOMElement()
})

// Falla si con platos y la ubicación puesta el chat no termina el domicilio paso a paso (nombre, teléfono, indicaciones y
// la autorización del tratamiento de datos),
// si el resumen no muestra el envío gratis y el total del servidor, o si pagar contra entrega no confirma el pedido con
// ese método y lleva a su estado.
it('termina el domicilio en el chat del mesero', async () => {
  const { ChatCheckout } = await import('../ChatCheckout')
  const { setDelivery, confirmOrder, getOrder, getCart } = jest.requireMock('@/lib/services/api')
  const carrito: Cart = { sesion: 'v', total: 9000, mio: 9000, por_comensal: [], lineas: [{ id: 1, producto_id: 7, nombre: 'Sopa', cantidad: 1, precio: 9000, subtotal: 9000, mio: true, comensal: 'a', nota: '' }] }
  const domicilio = { lat: 6.2, lng: -75.5, direccion: 'Calle 9', indicaciones: 'Torre 2', telefono: '+573001234567', nombre: 'Ana', envio: 0, distancia_km: 1,
    sede: { slug: 'salon', nombre: 'El Poblado' }, metodos: ['online', 'cash'], minimo: 0, recargo: 8, gratis_desde: 5000 }
  jest.mocked(setDelivery).mockResolvedValue({ domicilio, carrito: { ...carrito, lineas: [{ ...carrito.lineas[0], precio: 9720, subtotal: 9720 }], total: 9720, envio: 0, domicilio } })
  jest.mocked(confirmOrder).mockResolvedValue({ pedido: 'p1', estado: 'enviado', total: 9720, cuenta: {} })
  jest.mocked(getOrder).mockResolvedValue({ id: 'p1' })
  jest.mocked(getCart).mockResolvedValue(carrito)
  useDinerStore.setState({ session: { id: 's1', estado: 'abierta', mesa: null }, cart: carrito, deliveryDraft: { lat: 6.2, lng: -75.5, direccion: 'Calle 9' },
    entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  const cerrar = jest.fn()
  render(<ChatCheckout onClose={cerrar} />)
  fireEvent.click(screen.getByRole('button', { name: '🛵 Terminar mi domicilio aquí' }))
  fireEvent.change(screen.getByLabelText('¿A nombre de quién va el pedido?'), { target: { value: 'Ana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
  fireEvent.change(screen.getByLabelText(/A qué número te llamamos/), { target: { value: '12' } })
  expect(screen.getByRole('button', { name: 'Seguir' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/A qué número te llamamos/), { target: { value: '300 123 4567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
  fireEvent.change(screen.getByLabelText(/Alguna indicación/), { target: { value: 'Torre 2' } })
  expect(screen.getByRole('button', { name: 'Seguir' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/Acepto el tratamiento de datos/))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Seguir' })))
  expect(setDelivery).toHaveBeenCalledWith('s1', expect.objectContaining({ nombre: 'Ana', telefono: '300 123 4567', indicaciones: 'Torre 2', direccion: 'Calle 9', guardar: false, acepta_datos: true }))
  expect(screen.getByText('Envío:').textContent).toContain('gratis')
  expect(screen.getByText(/Precios para domicilio \(\+8 %\)/)).toBeInTheDocument()
  expect(screen.getByText(/Total:/).textContent).toContain('9.720')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Efectivo al recibir' })))
  expect(confirmOrder).toHaveBeenCalledWith('s1', false, { notas: '', alergenos: '', metodo_pago: 'cash' })
  expect(cerrar).toHaveBeenCalled()
  expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('estado'))
})

// Falla si en modo domicilio la carta no muestra los precios con el recargo (al peso, como el servidor), si no se puede
// volver a los precios de siempre o si el aviso no dice que el envío va incluido cuando el domicilio es gratis.
it('precios para domicilio con recargo', async () => {
  const { markedPrice, pricedEntry, deliveryPricesText, freeFromText } = await import('@/lib/domain/deliveryPricing')
  expect(markedPrice(36900, 8)).toBe(39852)
  expect(markedPrice(9950, 10)).toBe(10945)
  const entry = { domicilio: { enabled: true, buscador: false, cobro: 'free', recargo: 10 }, contexto: { mesa: null },
    carta: { categorias: [{ id: 1, nombre: 'Sopas', productos: [{ id: 7, nombre: 'Sopa', precio: 20000, agotado: false, categorias: [1], atributos: { tamanos: [{ nombre: 'Grande', precio: 25000 }] } }] }] } } as unknown as Entry
  const priced = pricedEntry(entry, 10)
  expect(priced.carta.categorias[0].productos[0].precio).toBe(22000)
  expect(priced.carta.categorias[0].productos[0].atributos?.tamanos?.[0].precio).toBe(27500)
  expect(deliveryPricesText(priced)).toBe('Domicilio gratis: el envío va incluido en estos precios (+10 %).')
  expect(pricedEntry(priced, 0)).toBe(entry)
  expect(freeFromText(60000, 48000, (n) => `$ ${n}`)).toBe('Envío gratis desde $ 60000 en platos · te faltan $ 12000')
  expect(freeFromText(60000, 61000, (n) => `$ ${n}`)).toBeNull()
})

// Falla si al dar la ubicación la carta del store no pasa a precios para domicilio con su aviso, o si al quitarla (o en
// una mesa) no vuelve a los precios de siempre.
it('la carta cambia a precios para domicilio con la ubicación', async () => {
  const { useDeliveryPricing, DeliveryPricesNote } = await import('../DeliveryPricing')
  const entry = { domicilio: { enabled: true, buscador: false, cobro: 'distance', recargo: 5 }, contexto: { mesa: null },
    carta: { categorias: [{ id: 1, nombre: 'Sopas', productos: [{ id: 7, nombre: 'Sopa', precio: 20000, agotado: false, categorias: [1] }] }] } } as unknown as Entry
  useDinerStore.setState({ entry })
  function Probe() { useDeliveryPricing(); return <DeliveryPricesNote /> }
  render(<Probe />)
  expect(screen.queryByRole('status')).toBeNull()
  act(() => useDinerStore.setState({ deliveryDraft: { lat: 6.2, lng: -75.5, direccion: '' } }))
  await waitFor(() => expect(useDinerStore.getState().entry?.carta.categorias[0].productos[0].precio).toBe(21000))
  expect(screen.getByRole('status')).toHaveTextContent('Precios para domicilio (+5 %).')
  act(() => useDinerStore.setState({ deliveryDraft: null }))
  await waitFor(() => expect(useDinerStore.getState().entry).toBe(entry))
})

// Falla si el enlace de pago de WhatsApp no lleva al pago de la sede del pedido o si un enlace vencido no lo explica.
it('el enlace de pago de WhatsApp abre el pago', async () => {
  const { openPayLink } = jest.requireMock('@/lib/services/api')
  const navigation = jest.requireMock('next/navigation')
  navigation.useSearchParams = () => new URLSearchParams('token=abc')
  const { default: PayDeliveryPage } = await import('@/app/[rest]/domicilio/pagar/page')
  jest.mocked(openPayLink).mockResolvedValue({ restaurante: 'demo', sede: 'salon' })
  const { unmount } = render(<PayDeliveryPage />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/demo/salon/pago'))
  expect(openPayLink).toHaveBeenCalledWith('abc')
  unmount()
  jest.mocked(openPayLink).mockRejectedValue(new Error('El enlace de pago venció.'))
  render(<PayDeliveryPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de pago venció.')
})
