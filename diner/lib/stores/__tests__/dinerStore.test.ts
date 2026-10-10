/** @jest-environment jsdom */
import { DEFAULT_TEMPLATE, encodePreview } from '@/lib/domain/template'
import { ApiError } from '@/lib/services/api'
import { AUTHORIZING_MS, payableTotal, useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry, Template, TemplateSpec } from '@/lib/types'

jest.mock('@/lib/services/api', () => {
  class ApiError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message) } }
  return {
    ApiError,
    confirmOrder: jest.fn(),
    openSession: jest.fn(),
    getCart: jest.fn(),
    getOrder: jest.fn(), getEntry: jest.fn(), addLine: jest.fn(), updateLine: jest.fn(), removeLine: jest.fn(), callWaiter: jest.fn(), requestBill: jest.fn(), quoteBill: jest.fn(),
    getTemplates: jest.fn(), registerAccount: jest.fn(), verifyAccount: jest.fn(), getAccount: jest.fn(), logoutAccount: jest.fn(), simulatePayment: jest.fn(),
  }
})

const api = jest.requireMock('@/lib/services/api')
const keys = { rest: 'la-provincia', venue: 'centro', token: 'Z2XUVG' }
const initial = useDinerStore.getInitialState()
const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: '', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
const venueTemplate: Template = { ...DEFAULT_TEMPLATE, codigo: 'C2', familia: 'C', tokens: { ...DEFAULT_TEMPLATE.tokens, acento: '#111111' } }
const entryOf = (plantilla?: Template): Entry => ({ contexto: { restaurante: { slug: 'la-provincia', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: null, marca: brand, plantilla }, carta: { restaurante: 'la-provincia', categorias: [] } })
const a1Spec: TemplateSpec = { codigo: 'A1', nombre: 'Carta editorial', familia: 'A', fotos: { requiere: 'ninguna', recorte: 'ninguno' }, tokens: { ...DEFAULT_TEMPLATE.tokens, acento: '#7A2E2A' }, pantallas: { menu: { layout: 'A1' }, carrito: { layout: 'familia-A' }, pago: { layout: 'familia-A' }, registro: { patron: 'portada' }, codigo: { patron: 'revisaCorreo' }, historial: { patron: 'tablaCufe' } } }

beforeEach(() => { jest.resetAllMocks(); useDinerStore.setState(initial, true) })
afterEach(() => { jest.useRealTimers() })

// Falla si, cuando el salón ya cobró la cuenta (409), el comensal se queda pegado a la sesión vieja en vez de
// empezar una visita limpia.
test('a 409 on confirm reopens a fresh session and keeps the message for the diner', async () => {
  useDinerStore.setState({ keys, session: { id: 'old' } as never, cart: { lineas: [1] } as never, order: { id: 'p1' } as never })
  api.confirmOrder.mockRejectedValue(new ApiError('La cuenta de esta mesa ya se pagó.', 409, 'session_paid'))
  api.openSession.mockResolvedValue({ sesion: { id: 'new' } })
  api.getCart.mockResolvedValue({ lineas: [] })

  const result = await useDinerStore.getState().confirm()

  expect(result).toBeNull()
  const state = useDinerStore.getState()
  expect(state.session?.id).toBe('new')
  expect(state.cart).toEqual({ lineas: [] })
  expect(state.order).toBeNull()
  expect(state.error).toMatch(/ya se pagó/)
})

// Falla si un 409 que no es «la cuenta ya se pagó» (por ejemplo, la sede sin caja abierta) borra el pedido del comensal
// o se calla: debe conservar la visita y dejar el motivo para mostrarlo.
test('a 409 for a closed venue keeps the session and the message', async () => {
  useDinerStore.setState({ keys, session: { id: 'old' } as never, cart: { lineas: [1] } as never })
  api.openSession.mockClear()
  api.confirmOrder.mockRejectedValue(new ApiError('Por ahora no tenemos abierto. Podrás pedir cuando abramos.', 409, 'restaurant_closed'))
  expect(await useDinerStore.getState().confirm()).toBeNull()
  expect(useDinerStore.getState().session?.id).toBe('old')
  expect(useDinerStore.getState().cart).toEqual({ lineas: [1] })
  expect(useDinerStore.getState().error).toMatch(/no tenemos abierto/)
  expect(api.openSession).not.toHaveBeenCalled()
})

// Falla si cualquier error al confirmar (no solo el 409) descarta la sesión del comensal y abre otra.
test('other errors do not touch the session', async () => {
  useDinerStore.setState({ keys, session: { id: 'old' } as never })
  api.openSession.mockClear()
  api.confirmOrder.mockRejectedValue(new ApiError('Error 500', 500))
  await useDinerStore.getState().confirm()
  expect(useDinerStore.getState().session?.id).toBe('old')
  expect(api.openSession).not.toHaveBeenCalled()
})

// Falla si la plantilla del contexto no manda sobre la B1 embebida, o si una experience/ sin `plantilla` deja el motor sin tokens.
test('the template comes from the context and falls back to the embedded B1', async () => {
  api.getEntry.mockResolvedValue(entryOf(venueTemplate))
  await useDinerStore.getState().load(keys)
  expect(useDinerStore.getState().template.codigo).toBe('C2')
  api.getEntry.mockResolvedValue(entryOf(undefined))
  await useDinerStore.getState().load({ ...keys, token: null })
  expect(useDinerStore.getState().template).toBe(DEFAULT_TEMPLATE)
})

// Falla si la vista previa no parte de los tokens del catálogo (previsualizaría la paleta de la sede), si no manda sobre el contexto,
// si sin catálogo no cae a la plantilla actual, o si quitar el parámetro no vuelve a lo guardado.
test('the preview param overrides the template from the catalog and clears when removed', async () => {
  api.getEntry.mockResolvedValue(entryOf(venueTemplate))
  api.getTemplates.mockResolvedValue({ familias: {}, plantillas: [a1Spec] })
  await useDinerStore.getState().load(keys)
  await useDinerStore.getState().applyPreviewParam(encodePreview({ plantilla: 'A1', paleta: { acento: '#00FF00' } }))
  let s = useDinerStore.getState()
  expect(s.preview?.codigo).toBe('A1')
  expect(s.template.codigo).toBe('A1')
  expect(s.template.tokens.acento).toBe('#00FF00')
  expect(s.template.layouts.registro).toBe('portada')
  // La entrada se recarga después (la página carga en paralelo): la vista previa sigue mandando.
  await useDinerStore.getState().load({ ...keys, token: null })
  expect(useDinerStore.getState().template.codigo).toBe('A1')

  api.getTemplates.mockRejectedValue(new ApiError('Error 503', 503))
  await useDinerStore.getState().applyPreviewParam(encodePreview({ plantilla: 'A1', tipografia: { display: 'Fraunces' } }))
  s = useDinerStore.getState()
  expect(s.template.codigo).toBe('C2')
  expect(s.template.tokens.displayFont).toBe('Fraunces')
  expect(s.error).toBeNull()

  await useDinerStore.getState().applyPreviewParam(null)
  s = useDinerStore.getState()
  expect(s.preview).toBeNull()
  expect(s.template.codigo).toBe('C2')
})

// Falla si el registro no guarda el id pendiente, si verificar no liga la cuenta y la carga, o si un código con registro pendiente
// ausente intenta verificar algo.
test('register keeps the pending account and verify links it and loads the profile', async () => {
  const form = { nombre: 'Camila Ruiz', correo: 'camila@correo.com', celular: '3105554821', aceptaDatos: true, novedades: false }
  expect(await useDinerStore.getState().verify('123456')).toBe(false)
  expect(api.verifyAccount).not.toHaveBeenCalled()
  api.registerAccount.mockResolvedValue({ id: 'acc-1', codigoDemo: true })
  expect(await useDinerStore.getState().register(form)).toBe('acc-1')
  expect(api.registerAccount).toHaveBeenCalledWith(form)
  expect(useDinerStore.getState().pendingAccount).toEqual({ id: 'acc-1', form })

  api.verifyAccount.mockResolvedValue({ ok: true })
  api.getAccount.mockResolvedValue({ cuenta: { id: 'acc-1', nombre: 'Camila Ruiz', correo: 'camila@correo.com', verificada: true }, pedidos: [{ id: 'o1' }] })
  expect(await useDinerStore.getState().verify('123456')).toBe(true)
  expect(api.verifyAccount).toHaveBeenCalledWith('acc-1', '123456')
  const s = useDinerStore.getState()
  expect(s.account?.verificada).toBe(true)
  expect(s.accountOrders).toEqual([{ id: 'o1' }])
  expect(s.pendingAccount).toBeNull()

  api.logoutAccount.mockResolvedValue(undefined)
  await useDinerStore.getState().logout()
  expect(useDinerStore.getState().account).toBeNull()
})

// Falla si no tener cuenta (401/404) se muestra como error, o si un fallo real sí se calla.
test('loading the account treats 401/404 as "no account" and other failures as errors', async () => {
  useDinerStore.setState({ account: { id: 'a', nombre: 'x', correo: 'x@x.co', verificada: true } })
  api.getAccount.mockRejectedValue(new ApiError('Error 404', 404))
  await useDinerStore.getState().loadAccount()
  expect(useDinerStore.getState().account).toBeNull()
  expect(useDinerStore.getState().error).toBeNull()
  api.getAccount.mockRejectedValue(new ApiError('Error 500', 500))
  await useDinerStore.getState().loadAccount()
  expect(useDinerStore.getState().error).toBe('Error 500')
})

// Falla si el pago simulado no pasa por «Autorizando» al menos AUTHORIZING_MS, si no manda método y monto al endpoint, si aprobado no
// termina en 'paid' (y rechazado en 'declined'), o si un fallo de red deja al comensal en «Autorizando».
test('simulatePay authorizes for a while, then lands on paid or declined, never on card data', async () => {
  jest.useFakeTimers()
  useDinerStore.setState({ keys, session: { id: 's1', estado: 'abierta', mesa: 14 }, cart: { sesion: 's1', lineas: [], total: 97812, mio: 97812, por_comensal: [] } })
  expect(payableTotal(useDinerStore.getState())).toBe(97812)
  api.confirmOrder.mockResolvedValue({ pedido: 'p1', cuenta: { total: 90000 } })
  api.getOrder.mockResolvedValue({ id: 'p1', total: 90000 })
  api.getCart.mockResolvedValue({ lineas: [], total: 0 })
  api.simulatePayment.mockResolvedValue({ estado: 'aprobado', referencia: 'DEMO-1', demo: true, metodo: 'tarjeta', monto: 90000 })
  const pending = useDinerStore.getState().simulatePay('tarjeta')
  await Promise.resolve()
  expect(useDinerStore.getState().payState).toBe('authorizing')
  await jest.advanceTimersByTimeAsync(0)
  expect(api.simulatePayment).toHaveBeenCalledWith('s1', 'tarjeta', 'all')
  expect(api.confirmOrder.mock.invocationCallOrder[0]).toBeLessThan(api.simulatePayment.mock.invocationCallOrder[0])
  await jest.advanceTimersByTimeAsync(AUTHORIZING_MS - 100)
  expect(useDinerStore.getState().payState).toBe('authorizing')
  await jest.advanceTimersByTimeAsync(200)
  expect((await pending)?.estado).toBe('aprobado')
  expect(useDinerStore.getState().payState).toBe('paid')
  expect(useDinerStore.getState().payResult).toEqual({ estado: 'aprobado', referencia: 'DEMO-1', demo: true, metodo: 'tarjeta', monto: 90000 })

  useDinerStore.getState().resetPay()
  expect(useDinerStore.getState().payState).toBe('idle')
  api.simulatePayment.mockResolvedValue({ estado: 'rechazado', referencia: 'DEMO-2', demo: true })
  const declined = useDinerStore.getState().simulatePay('pse')
  await jest.advanceTimersByTimeAsync(AUTHORIZING_MS + 10)
  await declined
  expect(useDinerStore.getState().payState).toBe('declined')

  api.simulatePayment.mockRejectedValue(new ApiError('Sin conexión', 0))
  const failed = useDinerStore.getState().simulatePay('nequi')
  await jest.advanceTimersByTimeAsync(AUTHORIZING_MS + 10)
  expect(await failed).toBeNull()
  expect(useDinerStore.getState().payState).toBe('idle')
  expect(useDinerStore.getState().error).toBe('Sin conexión')
})


// Falla si se llama a la pasarela cuando confirmar falló o un doble toque duplica el pago.
test('failed confirmation prevents payment and concurrent taps are ignored', async () => {
  useDinerStore.setState({ keys, session: { id: 's1' } as never })
  api.confirmOrder.mockRejectedValue(new ApiError('Odoo no responde', 503))
  const pending = useDinerStore.getState().simulatePay('tarjeta')
  expect(await useDinerStore.getState().simulatePay('tarjeta')).toBeNull()
  expect(await pending).toBeNull()
  expect(api.simulatePayment).not.toHaveBeenCalled()
  expect(useDinerStore.getState().payState).toBe('idle')
})

// Falla si salir del pago borra el aviso de demostración de la visita o deja el resultado del pago anterior.
test('demo notice survives leaving payment but stays tied to the visit', async () => {
  useDinerStore.setState({ demoSession: 's1', payState: 'paid', payResult: { demo: true } as never })
  useDinerStore.getState().resetPay()
  expect(useDinerStore.getState().demoSession).toBe('s1')
  expect(useDinerStore.getState().payResult).toBeNull()
})


// Falla si refrescar la cuenta llama al mesero, confirma el pedido o conserva un total viejo.
test('refreshBill reads a fresh personal split without calling the waiter or confirming', async () => {
  useDinerStore.setState({ keys, session: { id: 's1' } as never, bill: { total: 99999 } as never })
  api.quoteBill.mockResolvedValue({ total: 20000, mio: 5000, partes: 4, porParte: 5000 })
  await useDinerStore.getState().refreshBill()
  expect(api.quoteBill).toHaveBeenCalledWith('s1')
  expect(useDinerStore.getState().bill?.mio).toBe(5000)
  expect(api.requestBill).not.toHaveBeenCalled()
  expect(api.confirmOrder).not.toHaveBeenCalled()
})

// Falla si dos pedidos simultáneos de sesión abren dos sesiones y la segunda reemplaza la cookie de la cuenta.
test('deduplicates concurrent session requests so the account cookie is not replaced', async () => {
  useDinerStore.setState({ keys, session: null })
  api.openSession.mockResolvedValue({ sesion: { id: 'one-session' } })
  const [one, two] = await Promise.all([useDinerStore.getState().ensureSession(), useDinerStore.getState().ensureSession()])
  expect(one).toEqual(two)
  expect(api.openSession).toHaveBeenCalledTimes(1)
})

// Falla si en la vista previa se puede agregar, confirmar un pedido o simular un pago contra la API.
test('preview cannot send a command, register an account or simulate a payment', async () => {
  useDinerStore.setState({ keys, preview: DEFAULT_TEMPLATE })
  await useDinerStore.getState().add(3, 1, '')
  await useDinerStore.getState().confirm()
  await useDinerStore.getState().simulatePay('tarjeta')
  expect(api.addLine).not.toHaveBeenCalled()
  expect(api.confirmOrder).not.toHaveBeenCalled()
  expect(api.simulatePayment).not.toHaveBeenCalled()
  expect(useDinerStore.getState().error).toMatch(/vista previa/)
})
