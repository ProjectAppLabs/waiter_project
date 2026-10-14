import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SmartAccount, SmartAccountEdit, SmartCode, SmartHistory, SmartReceipt, SmartSignup } from '../SmartAccount'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { updateAccount } from '@/lib/services/api'
import type { AccountOrder } from '@/lib/types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
const inicial = useDinerStore.getInitialState()
const cuenta = { id: 'ana', nombre: 'Ana Ruiz', correo: 'ana@example.invalid', verificada: true, celular: '3001234567', novedades: false }
const formulario = { nombre: cuenta.nombre, correo: cuenta.correo, celular: '', aceptaDatos: true, novedades: false }
const pedido: AccountOrder = { id: 'pedido-1', local: 'La cocina', fecha: '2026-09-15T18:00:00Z', estado: 'pagado', total: 24000, descuento: 1000, mesa: 3, items: 2, restaurante: 'demo', sede: 'salon', lineas: [{ producto_id: 7, nombre: 'Sopa', cantidad: 2, precio: 12000 }] }
const pulsar = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const cambiar = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
beforeEach(() => {
  jest.resetAllMocks()
  sessionStorage.clear()
  useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'salon', token: null }, loadAccount: jest.fn().mockResolvedValue(undefined) }, true)
})
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si el registro pierde los datos, permite envíos duplicados o no lleva a verificar la cuenta creada.
it('registra los datos y preferencias una sola vez y abre la verificación', async () => {
  sessionStorage.setItem('smart-menu:signup-email', cuenta.correo)
  let terminar!: (id: string) => void
  const registrar = jest.fn(() => new Promise<string>(resolve => { terminar = resolve }))
  useDinerStore.setState({ register: registrar })
  render(<SmartSignup />)
  expect(screen.getByLabelText('Correo electrónico')).toHaveValue(cuenta.correo)
  cambiar('Tu nombre', cuenta.nombre)
  cambiar(/Celular/, '3001234567')
  cambiar('Contraseña', 'Clave-de-prueba-123')
  fireEvent.click(screen.getByLabelText(/Acepto el uso/))
  fireEvent.click(screen.getByLabelText(/Quiero recibir/))
  pulsar('Sobre tus datos')
  expect(screen.getByText(/Las novedades son opcionales/)).toBeVisible()
  pulsar('Continuar')
  expect(screen.getByRole('button', { name: 'Creando cuenta…' })).toBeDisabled()
  fireEvent.submit(screen.getByLabelText('Tu nombre').closest('form')!)
  expect(registrar).toHaveBeenCalledTimes(1)
  expect(registrar).toHaveBeenCalledWith({ ...formulario, celular: '3001234567', clave: 'Clave-de-prueba-123', novedades: true })
  await act(async () => terminar('ana'))
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/cuenta/codigo')
})

// Falla si un registro rechazado oculta el error o impide continuar como invitado.
it('permite corregir un registro rechazado o continuar como invitado', async () => {
  useDinerStore.setState({ register: jest.fn().mockResolvedValue(null), error: 'Este correo ya tiene cuenta' })
  render(<SmartSignup />)
  fireEvent.submit(screen.getByLabelText('Tu nombre').closest('form')!)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled())
  expect(screen.getByRole('alert')).toHaveTextContent('Este correo ya tiene cuenta')
  expect(mockPush).not.toHaveBeenCalled()
  pulsar('Seguir como invitado')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/carta')
})

// Falla si la verificación acepta letras, anuncia una renovación fallida o navega antes de verificar.
it('renueva el código y verifica únicamente seis dígitos', async () => {
  const verificar = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const renovar = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  useDinerStore.setState({ pendingAccount: { id: 'ana', form: formulario }, verify: verificar, resendCode: renovar })
  render(<SmartCode />)
  cambiar('Código de verificación', '12a3')
  expect(screen.getByLabelText('Código de verificación')).toHaveValue('123')
  expect(screen.getByRole('button', { name: 'Verificar y entrar' })).toBeDisabled()
  await act(async () => pulsar('Renovar código demo'))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await act(async () => pulsar('Renovar código demo'))
  expect(screen.getByRole('status')).toHaveTextContent('Código renovado')
  cambiar('Código de verificación', '123456')
  await act(async () => pulsar('Verificar y entrar'))
  expect(mockPush).not.toHaveBeenCalled()
  await act(async () => pulsar('Verificar y entrar'))
  expect(verificar).toHaveBeenCalledWith('123456')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/cuenta/lista')
  pulsar('Opciones de verificación')
  expect(mockPush).toHaveBeenLastCalledWith('/demo/salon/cuenta/canal')
})

// Falla si alguien sin cuenta queda atrapado en el perfil, la edición o la verificación.
it.each([
  [SmartAccount, 'Crear mi cuenta', 'cuenta/registro'],
  [SmartAccountEdit, 'Mi cuenta', 'cuenta'],
  [SmartCode, 'Crear cuenta', 'cuenta/registro'],
] as const)('ofrece una salida desde %p sin cuenta', (Componente, accion, destino) => {
  render(<Componente />)
  pulsar(accion)
  expect(mockPush).toHaveBeenCalledWith(`/demo/salon/${destino}`)
})

// Falla si el perfil cambia las novedades sin confirmación del servidor o sale pese a fallar el cierre de sesión.
it('guarda las novedades confirmadas y conserva la sesión si salir falla', async () => {
  const salir = jest.fn().mockImplementationOnce(async () => { useDinerStore.setState({ error: 'Sin conexión' }) }).mockImplementationOnce(async () => { useDinerStore.setState({ error: null }) })
  useDinerStore.setState({ account: cuenta, logout: salir })
  jest.mocked(updateAccount).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ cuenta: { ...cuenta, novedades: true }, pedidos: [] })
  render(<SmartAccount />)
  fireEvent.click(screen.getByRole('switch'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(screen.getByRole('switch')).not.toBeChecked()
  await act(async () => fireEvent.click(screen.getByRole('switch')))
  expect(screen.getByRole('switch')).toBeChecked()
  expect(updateAccount).toHaveBeenLastCalledWith({ novedades: true })
  expect(screen.getByRole('link', { name: /Mis pedidos/ })).toHaveAttribute('href', '/demo/salon/historial')
  await act(async () => pulsar('Cerrar sesión'))
  expect(mockPush).not.toHaveBeenCalled()
  await act(async () => pulsar('Cerrar sesión'))
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/carta')
})

// Falla si editar el perfil pierde las alergias, modifica el correo o anuncia éxito después de un rechazo.
it('edita contacto y alergias, conserva el correo y permite reintentar', async () => {
  useDinerStore.setState({ account: cuenta })
  jest.mocked(updateAccount).mockRejectedValueOnce(new Error('No se pudo guardar')).mockResolvedValueOnce({ cuenta: { ...cuenta, nombre: 'Ana María' }, pedidos: [pedido] })
  render(<SmartAccountEdit />)
  cambiar('Tu nombre', ' Ana María ')
  cambiar('Celular', ' 3007654321 ')
  cambiar(/Alergias/, ' maní ')
  fireEvent.click(screen.getByLabelText(/Quiero recibir/))
  expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('readonly')
  pulsar('Guardar cambios')
  expect(await screen.findByRole('status')).toHaveTextContent('No se pudo guardar')
  pulsar('Guardar cambios')
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados'))
  expect(updateAccount).toHaveBeenLastCalledWith({ nombre: 'Ana María', celular: '3007654321', alergenos: 'maní', novedades: true })
  expect(useDinerStore.getState().accountOrders).toEqual([pedido])
})

// Falla si el historial mezcla sedes, mantiene pedidos pagados en curso o repite cantidades incorrectas.
it('filtra la sede y los pedidos en curso y permite repetir una visita', async () => {
  const agregar = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({ account: cuenta, accountOrders: [pedido, { ...pedido, id: 'ajeno', sede: 'otra', local: 'Otra sede' }], add: agregar })
  render(<SmartHistory />)
  expect(screen.queryByText('Otra sede')).not.toBeInTheDocument()
  pulsar('En curso')
  expect(screen.getByText('No tienes pedidos en curso.')).toBeVisible()
  pulsar('Explorar el menú')
  expect(mockPush).toHaveBeenCalledWith('/demo/salon/carta')
  pulsar('Todos')
  await act(async () => pulsar('Volver a pedir'))
  expect(agregar).toHaveBeenCalledWith(7, 2, '')
  expect(mockPush).toHaveBeenLastCalledWith('/demo/salon/pedido')
})

// Falla si al agotarse el primer plato se añaden los siguientes o se abandona el historial.
it('detiene la repetición del pedido cuando un plato no puede agregarse', async () => {
  const agregar = jest.fn(async () => { useDinerStore.setState({ error: 'Sopa agotada' }) })
  useDinerStore.setState({ account: cuenta, accountOrders: [{ ...pedido, lineas: [...pedido.lineas!, { ...pedido.lineas![0], producto_id: 8 }] }], add: agregar })
  render(<SmartHistory />)
  await act(async () => pulsar('Volver a pedir'))
  expect(agregar).toHaveBeenCalledTimes(1)
  expect(mockPush).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Volver a pedir' })).toBeEnabled()
})

// Falla si el recibo muestra pedidos de otra sede o pierde las cantidades y el descuento de la visita.
it('muestra el recibo propio y ofrece volver cuando el pedido no pertenece a la sede', () => {
  useDinerStore.setState({ accountOrders: [pedido] })
  const vista = render(<SmartReceipt id={pedido.id} />)
  expect(screen.getAllByText('Sopa')[0]).toBeVisible()
  expect(screen.getByText('Descuento')).toBeVisible()
  expect(screen.getByRole('link', { name: /Volver a mis pedidos/ })).toHaveAttribute('href', '/demo/salon/historial')
  act(() => useDinerStore.setState({ keys: { rest: 'demo', venue: 'otra', token: null } }))
  expect(screen.getByText('No encontramos este pedido en tu cuenta')).toBeVisible()
  pulsar('Mis pedidos')
  expect(mockPush).toHaveBeenLastCalledWith('/demo/otra/historial')
  vista.unmount()
})
