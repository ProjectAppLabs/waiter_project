import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { Home } from '../Home'
import { Account } from '../Account'
import { Signup } from '../Signup'
import { Code } from '../Code'
import { Pay } from '../Pay'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { AccountOrder, Entry } from '@/lib/types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/services/api')
const inicial = useDinerStore.getInitialState()
const cuenta = { id: 'ana', nombre: 'Ana Ruiz', correo: 'ana@example.invalid', verificada: true }
const marca = { nombre: 'Casa', lema: '', logo: null, saludo: 'Bienvenida', mesero: 'Luis', bienvenida: 'Disfruta tu visita', color: '#112233', colorTexto: '#FFFFFF', colorSuave: '#EEEEEE', fuente: 'serif', radio: 14 }
const entrada: Entry = { contexto: { restaurante: { slug: 'casa', nombre: 'Casa' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: { numero: 3, token: 'MESA' }, marca }, carta: { restaurante: 'casa', categorias: [{ id: 1, nombre: 'Sopas', productos: [{ id: 7, nombre: 'Sopa', precio: 12000, agotado: false, categorias: [1] }] }] } }
const props = { entry: entrada, rest: 'casa', venue: 'centro', token: 'MESA', id: null }
const pedido: AccountOrder = { id: 'pedido-1', local: 'Casa septiembre', fecha: '2026-09-15T18:00:00Z', estado: 'pagado', total: 24000, descuento: 1000, mesa: 3, items: 2, lineas: [{ producto_id: 7, nombre: 'Sopa', cantidad: 2, precio: 12000 }] }
const montar = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const pulsar = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
beforeEach(() => {
  jest.resetAllMocks()
  useDinerStore.setState({ ...inicial, template: { ...DEFAULT_TEMPLATE, layouts: { ...DEFAULT_TEMPLATE.layouts, registro: 'banner5', codigo: 'casillas', historial: 'porMes', pago: 'generico' } }, loadAccount: jest.fn().mockResolvedValue(undefined) }, true)
})
afterEach(() => { useDinerStore.setState(inicial, true); jest.useRealTimers() })

// Falla si la portada pierde el QR al navegar, agrega otro plato o anuncia al mesero sin haberlo avisado.
it('explora los recomendados y llama al mesero desde la portada de la mesa', async () => {
  const agregar = jest.fn().mockResolvedValue(undefined), llamar = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  useDinerStore.setState({ add: agregar, call: llamar })
  montar(<Home {...props} />)
  pulsar(/Ver la carta/)
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/carta')
  pulsar('Ver todos')
  pulsar('Foto del plato Sopa')
  expect(mockPush).toHaveBeenLastCalledWith('/casa/centro/t/MESA/plato/7')
  pulsar('Agregar: Sopa')
  expect(agregar).toHaveBeenCalledWith(7, 1, '')
  await act(async () => pulsar('Llamar al mesero'))
  expect(screen.getByRole('button', { name: 'Llamar al mesero' })).toBeVisible()
  await act(async () => pulsar('Llamar al mesero'))
  expect(screen.getByRole('button', { name: 'Listo, ya viene alguien.' })).toBeVisible()
})

// Falla si explorar el local sin mesa ofrece llamar al salón o inventa platos recomendados.
it('presenta una portada sin mesa ni recomendados cuando la carta está vacía', () => {
  montar(<Home {...props} token={null} entry={{ ...entrada, contexto: { ...entrada.contexto, mesa: null, marca: { ...marca, mesero: '' } }, carta: { restaurante: 'casa', categorias: [] } }} />)
  expect(screen.queryByRole('button', { name: 'Llamar al mesero' })).not.toBeInTheDocument()
  expect(screen.queryByText('Sopa')).not.toBeInTheDocument()
  pulsar(/Ver la carta/)
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/carta')
})

// Falla si crear una cuenta navega pese al rechazo del registro o pierde el formulario enviado.
it('crea una cuenta y continúa al código solo cuando el registro tiene éxito', async () => {
  const registrar = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('ana')
  useDinerStore.setState({ register: registrar })
  montar(<Signup {...props} />)
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana Ruiz' } })
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: cuenta.correo } })
  fireEvent.click(screen.getByLabelText(/Acepto/))
  await act(async () => pulsar(/Crear cuenta y aplicar/))
  expect(mockPush).not.toHaveBeenCalled()
  await act(async () => pulsar(/Crear cuenta y aplicar/))
  expect(registrar).toHaveBeenLastCalledWith({ nombre: 'Ana Ruiz', correo: cuenta.correo, celular: '', aceptaDatos: true, novedades: false })
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/cuenta/codigo')
  pulsar('Seguir sin registrarme')
  expect(mockPush).toHaveBeenLastCalledWith('/casa/centro/t/MESA/pago')
})

// Falla si entrar a verificar sin registro previo deja al comensal sin forma de crear su cuenta.
it('invita a registrarse cuando no hay código pendiente', () => {
  montar(<Code {...props} />)
  expect(screen.getByText('No hay ningún registro pendiente de verificar.')).toBeVisible()
  pulsar('Crear cuenta')
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/cuenta/registro')
})

// Falla si verificar navega con un código rechazado o el reenvío y la vuelta pierden la mesa.
it('verifica el código, permite renovarlo y vuelve al registro', async () => {
  jest.useFakeTimers()
  const verificar = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), reenviar = jest.fn().mockResolvedValue(true)
  useDinerStore.setState({ pendingAccount: { id: 'ana', form: { nombre: 'Ana', correo: cuenta.correo, celular: '', aceptaDatos: true, novedades: false } }, verify: verificar, resendCode: reenviar })
  montar(<Code {...props} />)
  fireEvent.change(screen.getByLabelText('Dígito 1 de 6'), { target: { value: '123456' } })
  await act(async () => pulsar('Confirmar código'))
  expect(mockPush).not.toHaveBeenCalled()
  await act(async () => pulsar('Confirmar código'))
  expect(verificar).toHaveBeenCalledWith('123456')
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/cuenta')
  await act(async () => jest.advanceTimersByTime(38000))
  pulsar('Reenviar el código')
  expect(reenviar).toHaveBeenCalledTimes(1)
  pulsar('Usar mi celular')
  expect(screen.getByText('En la demo el código llega por el mismo canal.')).toBeVisible()
  pulsar('Volver')
  expect(mockPush).toHaveBeenLastCalledWith('/casa/centro/t/MESA/cuenta/registro')
})

// Falla si una cuenta sin pedidos no invita a explorar o si cerrar sesión no ejecuta la salida.
it('muestra el historial vacío, permite explorar y cerrar sesión', () => {
  const salir = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({ account: cuenta, logout: salir })
  montar(<Account {...props} />)
  expect(screen.getByText('Todavía nada por aquí')).toBeVisible()
  pulsar(/Ver la carta/)
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/carta')
  pulsar('Cerrar sesión')
  expect(salir).toHaveBeenCalledTimes(1)
})

// Falla si el historial no ordena los meses, pierde descuentos o repite cantidades distintas del pedido elegido.
it('ordena el historial por mes y vuelve a pedir las cantidades originales', async () => {
  const agregar = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({ account: cuenta, add: agregar, accountOrders: [{ ...pedido, id: 'agosto', local: 'Casa agosto', fecha: '2026-08-15T18:00:00Z', mesa: null, lineas: [], descuento: 0, estado: 'servido' }, pedido, { ...pedido, id: 'septiembre', local: 'Otra visita', fecha: '2026-09-10T18:00:00Z', lineas: [] }] })
  montar(<Account {...props} />)
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([expect.stringContaining('Casa septiembre'), expect.stringContaining('Otra visita'), expect.stringContaining('Casa agosto')])
  expect(screen.getAllByText('Ahorraste $ 1.000')).toHaveLength(2)
  expect(screen.getByText('Pendiente')).toBeVisible()
  await act(async () => pulsar('Volver a pedir'))
  expect(agregar).toHaveBeenCalledWith(7, 2, '')
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/pedido')
})

// Falla si la cuenta invitada no permite registrarse desde su invitación.
it('abre el registro desde una cuenta invitada', () => {
  montar(<Account {...props} />)
  pulsar(/Crear.*cuenta/)
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/cuenta/registro')
})

// Falla si el pago usa una cotización vieja, omite el método elegido o no limpia el estado al salir.
it('espera la cotización, paga con el método elegido y limpia el resultado al salir', async () => {
  let terminar!: () => void
  const cotizar = jest.fn(() => new Promise<void>(resolve => { terminar = resolve })), pagar = jest.fn().mockResolvedValue(null), limpiar = jest.fn()
  useDinerStore.setState({ refreshBill: cotizar, simulatePay: pagar, resetPay: limpiar, bill: { total: 24000, mio: 24000, ok: true, partes: 1, porParte: 24000, porComensal: [] } })
  const vista = montar(<Pay {...props} />)
  expect(screen.getByText('Cargando…')).toBeVisible()
  await act(async () => terminar())
  fireEvent.click(screen.getByRole('radio', { name: 'PSE' }))
  pulsar(/Pagar.*24/)
  expect(pagar).toHaveBeenCalledWith('pse', 'all')
  fireEvent.click(screen.getAllByRole('button', { name: 'Volver al pedido' })[0])
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/pedido')
  vista.unmount()
  expect(limpiar).toHaveBeenCalledTimes(1)
})

// Falla si tras un rechazo no se puede reintentar ni confirmar para pagar con el mesero.
it('ofrece reintentar y pagar con el mesero tras un rechazo', async () => {
  const confirmar = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('pedido-1'), limpiar = jest.fn()
  useDinerStore.setState({ refreshBill: jest.fn().mockResolvedValue(undefined), confirm: confirmar, resetPay: limpiar, payState: 'declined', bill: { total: 24000, mio: 24000, ok: true, partes: 1, porParte: 24000, porComensal: [] } })
  montar(<Pay {...props} />)
  await screen.findByRole('alert')
  pulsar('Intentar con otra tarjeta')
  expect(limpiar).toHaveBeenCalledTimes(1)
  await act(async () => pulsar('Que el mesero cobre en la mesa'))
  expect(mockPush).not.toHaveBeenCalled()
  await act(async () => pulsar('Que el mesero cobre en la mesa'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA/la-cuenta'))
})

// Falla si al repetir un pedido con un plato agotado se agregan los siguientes y se navega como si todo hubiera salido bien
// (error real que encontró esta prueba; corregido el 2026-10-04).
it('conserva el historial y detiene la repetición cuando el restaurante rechaza un plato', async () => {
  const agregar = jest.fn(async () => { useDinerStore.setState({ error: 'Sopa agotada' }) })
  useDinerStore.setState({ account: cuenta, add: agregar, accountOrders: [{ ...pedido, lineas: [...pedido.lineas!, { producto_id: 8, nombre: 'Jugo', cantidad: 1, precio: 6000 }] }] })
  montar(<Account {...props} />)
  await act(async () => pulsar('Volver a pedir'))
  expect(agregar).toHaveBeenCalledTimes(1)
  expect(mockPush).not.toHaveBeenCalled()
})
