import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SmartBill, SmartCart, SmartDemoPay, SmartStatus } from '../SmartOrder'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Entry, OrderStatus } from '@/lib/types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
const inicial = useDinerStore.getInitialState()
const entrada = { contexto: { mesa: { numero: 3 } }, carta: { categorias: [] } } as unknown as Entry
const carrito: Cart = { sesion: 'visita', total: 24000, mio: 24000, por_comensal: [], lineas: [{ id: 1, producto_id: 7, nombre: 'Sopa', cantidad: 2, precio: 12000, subtotal: 24000, mio: true, comensal: 'ana', nota: 'Sin sal' }] }
const cuenta = { total: 24000, mio: 12000, ok: false, partes: 2, porParte: 12000, porComensal: [] }
const pulsar = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
beforeEach(() => {
  jest.resetAllMocks()
  useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'salon', token: null }, entry: entrada }, true)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { useDinerStore.setState(inicial, true); jest.useRealTimers() })

// Falla si el pedido no permite actualizarse cuando falta el carrito o explorar la carta cuando está vacío.
it('ofrece recuperar el carrito y empezar un pedido vacío', async () => {
  const refrescar = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({ refreshCart: refrescar })
  render(<SmartCart />)
  pulsar('Actualizar')
  expect(refrescar).toHaveBeenCalledTimes(1)
  act(() => useDinerStore.setState({ cart: { ...carrito, lineas: [] } }))
  pulsar('Explorar el menú')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/carta')
})

// Falla si el comensal no puede ajustar sus platos, si las notas y alergias no están en Mi pedido o si la cocina las pierde
// (o la modalidad) al confirmar.
it('ajusta platos y confirma para llevar con las alergias revisadas', async () => {
  const cantidad = jest.fn().mockResolvedValue(undefined), quitar = jest.fn().mockResolvedValue(undefined)
  const confirmar = jest.fn().mockResolvedValue('pedido-1')
  useDinerStore.setState({ cart: carrito, setQty: cantidad, remove: quitar, confirm: confirmar, account: { id: 'ana', nombre: 'Ana', correo: 'ana@example.invalid', verificada: true, alergenos: 'Maní' } })
  render(<SmartCart />)
  pulsar('Menos Sopa'); pulsar('Más Sopa'); pulsar('Eliminar Sopa')
  expect(cantidad.mock.calls).toEqual([[1, 1], [1, 3]])
  expect(quitar).toHaveBeenCalledWith(1)
  pulsar('Ver opciones de pago')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/pago')
  mockPush.mockClear()
  // Las notas y alergias se escriben en Mi pedido, junto a los platos (no en el diálogo de la entrega).
  expect(screen.getByLabelText(/Alergias/)).toHaveValue('Maní')
  fireEvent.change(screen.getByLabelText(/Notas para/), { target: { value: ' Salsa aparte ' } })
  fireEvent.change(screen.getByLabelText(/Alergias/), { target: { value: ' Leche ' } })
  pulsar('Continuar al pago')
  const dialogo = screen.getByRole('dialog')
  expect(within(dialogo).queryByLabelText(/Alergias/)).toBeNull()
  pulsar('Para llevar')
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar al pago' })))
  expect(confirmar).toHaveBeenCalledWith(true, { notas: 'Salsa aparte', alergenos: 'Leche' })
  expect(dialogo).not.toHaveAttribute('open')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/pago')
})

// Falla si un rechazo cierra el diálogo o permite duplicar una confirmación mientras está pendiente.
it('mantiene el diálogo para reintentar una confirmación fallida y bloquea el doble toque', async () => {
  let resolver!: (id: string | null) => void
  const confirmar = jest.fn(() => new Promise<string | null>(resolve => { resolver = resolve }))
  useDinerStore.setState({ cart: carrito, confirm: confirmar })
  render(<SmartCart />)
  pulsar('Continuar al pago')
  pulsar('Para llevar'); pulsar('Comer aquí')
  const dialogo = screen.getByRole('dialog')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar al pago' }))
  const esperando = within(dialogo).getByRole('button', { name: 'Preparando…' })
  expect(esperando).toBeDisabled()
  fireEvent.click(esperando)
  await act(async () => resolver(null))
  expect(confirmar).toHaveBeenCalledTimes(1)
  expect(mockPush).not.toHaveBeenCalled()
  expect(dialogo).toHaveAttribute('open')
  pulsar('Cerrar modalidad del pedido')
  expect(dialogo).not.toHaveAttribute('open')
})

// Falla si el reparto no cambia el importe personal o si se puede dividir entre menos de dos o más de veinte.
it('reparte la cuenta y permite volver a avisar al mesero', async () => {
  const pedir = jest.fn().mockResolvedValue(cuenta)
  useDinerStore.setState({ bill: cuenta, askBill: pedir })
  render(<SmartBill />)
  await screen.findByText('¿Cómo quieres repartirla?')
  expect(screen.getByRole('status')).toHaveTextContent('No pudimos avisar')
  pulsar('Lo mío')
  expect(screen.getByText('$ 12.000')).toBeVisible()
  pulsar('Dividir')
  fireEvent.change(screen.getByLabelText('Número de personas'), { target: { value: '4' } })
  expect(screen.getByText('$ 6.000')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Número de personas'), { target: { value: '100' } })
  expect(screen.getByLabelText('Número de personas')).toHaveValue(20)
  fireEvent.change(screen.getByLabelText('Número de personas'), { target: { value: '0' } })
  expect(screen.getByLabelText('Número de personas')).toHaveValue(2)
  pulsar('Toda la mesa')
  expect(screen.getByText('$ 24.000')).toBeVisible()
  pulsar('Volver a avisar')
  expect(pedir).toHaveBeenCalledTimes(2)
  pulsar('Volver al menú')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/carta')
})

// Falla si una cuenta sin consumo inventa un monto o deja al comensal sin volver a la carta.
it('vuelve a la carta cuando no hay consumo por cobrar', async () => {
  useDinerStore.setState({ askBill: jest.fn().mockResolvedValue(null) })
  render(<SmartBill />)
  await screen.findByText('No hay consumo por cobrar')
  pulsar('Ver el menú')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/carta')
})

// Falla si el seguimiento deja de actualizarse, duplica avisos al mesero o sigue consultando después de salir.
it('actualiza la preparación cada ocho segundos y avisa una vez al mesero', async () => {
  jest.useFakeTimers()
  const refrescar = jest.fn().mockResolvedValue(undefined), llamar = jest.fn().mockResolvedValue(true)
  const pedido: OrderStatus = { id: 'pedido-1', sesion: 'visita', estado: 'en_cocina', total: 24000, impuestos: 0, intentos: 1, lineas: [{ producto_id: 7, nombre: 'Sopa', cantidad: 2, precio: 12000 }] }
  useDinerStore.setState({ order: pedido, refreshOrder: refrescar, call: llamar })
  const vista = render(<SmartStatus id="pedido-1" />)
  expect(screen.getByRole('status')).toHaveTextContent('Ya estamos cocinando')
  await act(async () => jest.advanceTimersByTime(8000))
  expect(refrescar).toHaveBeenCalledTimes(2)
  await act(async () => pulsar('Llamar al mesero'))
  expect(screen.getByRole('button', { name: 'El mesero está avisado' })).toBeDisabled()
  expect(llamar).toHaveBeenCalledTimes(1)
  pulsar('Pedir la cuenta')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/la-cuenta')
  pulsar('Volver al menú')
  expect(mockPush).toHaveBeenLastCalledWith('/demo/salon/carta')
  vista.unmount()
  await act(async () => jest.advanceTimersByTime(16000))
  expect(refrescar).toHaveBeenCalledTimes(2)
})

// Falla si un pedido fallido o pendiente de pago envía al comensal a una pantalla que no resuelve su estado.
it.each([['fallido', 'Reintentar envío', 'pedido'], ['pendiente_pago', 'Continuar al pago', 'pago'], ['servido', 'Ver opciones de pago', 'pago']] as const)('ofrece la acción correspondiente al pedido %s', (estado, accion, destino) => {
  useDinerStore.setState({ order: { id: 'pedido-1', sesion: 'visita', estado, total: 24000, impuestos: 0, intentos: 1 }, refreshOrder: jest.fn().mockResolvedValue(undefined) })
  render(<SmartStatus id="pedido-1" />)
  pulsar(accion)
  expect(mockPush).toHaveBeenCalledWith(`/demo/salon/${destino}`)
})

// Falla si se muestra otro pedido mientras carga el solicitado o no se permite volver al historial tras un error.
it('evita mostrar un pedido ajeno y permite volver al historial', () => {
  useDinerStore.setState({ error: 'No existe', refreshOrder: jest.fn().mockResolvedValue(undefined) })
  render(<SmartStatus id="desconocido" />)
  expect(screen.getByText('No pudimos cargar el pedido')).toBeVisible()
  pulsar('Ver mis pedidos')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/historial')
})

// Falla si el pago demo usa todo el consumo al elegir lo propio o abandona la pantalla tras una confirmación fallida.
it('simula el consumo personal con el método elegido y ofrece pagar con el mesero', async () => {
  const simular = jest.fn().mockResolvedValue(null), reiniciar = jest.fn()
  const confirmar = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('pedido-1')
  useDinerStore.setState({ bill: cuenta, refreshBill: jest.fn().mockResolvedValue(undefined), simulatePay: simular, resetPay: reiniciar, confirm: confirmar })
  const vista = render(<SmartDemoPay />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Simular pago/ })).toBeEnabled())
  fireEvent.click(screen.getByText('Opciones del pago de prueba'))
  fireEvent.click(screen.getByRole('radio', { name: /Nequi/ }))
  pulsar('Mi consumo')
  pulsar(/Simular pago/)
  expect(simular).toHaveBeenCalledWith('nequi', 'mine')
  await act(async () => pulsar('Pagar con el mesero'))
  expect(mockPush).not.toHaveBeenCalled()
  await act(async () => pulsar('Pagar con el mesero'))
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/la-cuenta')
  act(() => useDinerStore.setState({ payState: 'declined' }))
  expect(screen.getByRole('alert')).toHaveTextContent('La simulación fue rechazada')
  act(() => useDinerStore.setState({ payState: 'paid', payResult: { referencia: 'DEMO-1', monto: 12000, estado: 'aprobado', demo: true, metodo: 'nequi' } }))
  expect(screen.getByText(/No se ha cobrado dinero/)).toBeVisible()
  expect(screen.getByText(/DEMO-1/)).toBeVisible()
  pulsar('Ver mis pedidos'); pulsar('Mis recompensas')
  expect(mockPush).toHaveBeenLastCalledWith('/demo/salon/recompensas')
  vista.unmount()
  expect(reiniciar).toHaveBeenCalledTimes(1)
})

// Falla si una visita sin mesa no ofrece el domicilio, si deja confirmar sin cotizar ni escoger cómo pagar, si el
// Falla si el domicilio no va en dos pasos (primero nombre, celular, dirección y la autorización del tratamiento de
// datos; luego el detalle con la dirección para confirmarla, platos, envío y total, y el medio de pago), si «Cambiar»
// no vuelve a los datos o si pagar contra entrega no confirma con ese método y lleva al estado del pedido.
it('pide a domicilio en dos pasos y paga contra entrega', async () => {
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: 'Calle 10', latitud: 6.2, longitud: -75.5 })
  const cotizado = { lat: 6.21, lng: -75.57, direccion: 'Calle 9 # 40-10', indicaciones: 'Apto 301', telefono: '+573001234567', nombre: 'Ana',
    envio: 5000, distancia_km: 2.4, sede: { slug: 'salon', nombre: 'El Poblado' }, metodos: ['online', 'cash'], minimo: 0 }
  api.setDelivery.mockResolvedValue({ domicilio: cotizado, carrito: { ...carrito, total: 29000, envio: 5000, domicilio: cotizado } })
  api.quoteDelivery.mockResolvedValue({ cobertura: true, sede: { slug: 'salon', nombre: 'El Poblado' }, distancia_km: 2.4, envio: 5000, minimo: 0, metodos: ['online', 'cash'] })
  const confirmar = jest.fn().mockResolvedValue('pedido-9')
  useDinerStore.setState({ cart: carrito, confirm: confirmar, session: { id: 'visita', estado: 'abierta', mesa: null }, entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 6.21, longitude: -75.57 } }) } })
  render(<SmartCart />)
  pulsar('Continuar al pago')
  expect(screen.queryByRole('button', { name: 'Comer aquí' })).toBeNull()
  pulsar('A domicilio')
  const dialogo = screen.getByRole('dialog')
  expect(within(dialogo).queryByLabelText(/Notas para tus platos/)).toBeNull()
  const campos = within(dialogo).getAllByRole('textbox').map((c) => c.closest('label')?.querySelector('span')?.textContent)
  expect(campos.slice(0, 3)).toEqual(['Nombre', 'Celular', 'Dirección'])
  const seguir = () => within(dialogo).getByRole('button', { name: 'Continuar al pago' })
  expect(seguir()).toBeDisabled()
  pulsar('Usar mi ubicación actual')
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } })
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 9 # 40-10' } })
  fireEvent.change(screen.getByLabelText(/Indicaciones/), { target: { value: 'Apto 301' } })
  expect(seguir()).toBeDisabled()
  expect(within(dialogo).getByRole('link', { name: 'tratamiento de datos' })).toHaveAttribute('href', '/demo/privacidad')
  fireEvent.click(screen.getByLabelText(/Acepto el tratamiento de datos/))
  expect(within(dialogo).queryByRole('button', { name: 'Calcular envío' })).toBeNull()
  await act(async () => fireEvent.click(seguir()))
  expect(api.setDelivery).toHaveBeenCalledWith('visita', expect.objectContaining({ lat: 6.21, lng: -75.57, direccion: 'Calle 9 # 40-10', telefono: '300 123 4567', guardar: false, acepta_datos: true }))
  expect(await within(dialogo).findByText('¿Es correcta la dirección?')).toBeInTheDocument()
  expect(within(dialogo).getByText('Calle 9 # 40-10')).toBeInTheDocument()
  expect(within(dialogo).getByText('Ana · 3001234567')).toBeInTheDocument()
  expect(within(dialogo).getByText('$ 5.000')).toBeInTheDocument()
  expect(within(dialogo).getByText('$ 29.000')).toBeInTheDocument()
  pulsar('Cambiar dirección o datos')
  expect(within(dialogo).getByLabelText('Dirección')).toHaveValue('Calle 9 # 40-10')
  await act(async () => fireEvent.click(seguir()))
  expect(within(dialogo).getByRole('button', { name: 'Escoge cómo pagar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo al recibir' }))
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar pedido' })))
  expect(confirmar).toHaveBeenCalledWith(false, { notas: '', alergenos: '', metodo_pago: 'cash' })
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/estado/pedido-9')
})

// Falla si se puede seguir sin aceptar el tratamiento de datos (también al guardar la dirección).
it('no sigue sin la autorización de datos', async () => {
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: null, longitud: null })
  useDinerStore.setState({ cart: carrito, session: { id: 'visita', estado: 'abierta', mesa: null }, entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 6.21, longitude: -75.57 } }) } })
  render(<SmartCart />)
  pulsar('Continuar al pago'); pulsar('A domicilio'); pulsar('Usar mi ubicación actual')
  const dialogo = screen.getByRole('dialog')
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 9' } })
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '3001234567' } })
  fireEvent.click(screen.getByLabelText('Guardar esta dirección para la próxima'))
  expect(within(dialogo).getByRole('button', { name: 'Continuar al pago' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/Acepto el tratamiento de datos/))
  expect(within(dialogo).getByRole('button', { name: 'Continuar al pago' })).toBeEnabled()
})

// Falla si al llegar de otra sede con su pedido no se reabre la confirmación en domicilio (el cliente venía pagando).
it('reabre la confirmación en domicilio al llegar con el pedido', async () => {
  const api = jest.requireMock('@/lib/services/api')
  api.getVenueLocation.mockResolvedValue({ direccion: '', latitud: 5.8, longitud: -73 })
  useDinerStore.setState({ cart: carrito, reopenDelivery: true, deliveryDraft: { lat: 5.83, lng: -73.03, direccion: 'Calle 15' },
    entry: { domicilio: { enabled: true, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  render(<SmartCart />)
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('open'))
  expect(screen.getByRole('button', { name: 'A domicilio' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 15')
  expect(useDinerStore.getState().reopenDelivery).toBe(false)
})
