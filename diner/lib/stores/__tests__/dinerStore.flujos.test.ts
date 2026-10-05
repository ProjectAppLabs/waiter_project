import { useDinerStore } from '../dinerStore'
import * as api from '@/lib/services/api'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import type { Cart, Entry } from '@/lib/types'

jest.mock('@/lib/services/api')
const inicial = useDinerStore.getInitialState()
const claves = { rest: 'casa', venue: 'centro', token: 'MESA' }
const cuenta = { id: 'ana', nombre: 'Ana', correo: 'ana@example.invalid', verificada: true }
const carrito: Cart = { sesion: 'visita', lineas: [], total: 0, mio: 0, por_comensal: [] }
const sesion = { id: 'visita', estado: 'abierta', mesa: 3 }
const form = { nombre: 'Ana', correo: cuenta.correo, celular: '', aceptaDatos: true, novedades: false }
beforeEach(() => { jest.resetAllMocks(); useDinerStore.setState({ ...inicial, keys: claves }, true) })
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si añadir un conjunto de platos pierde las notas o si ajustar y eliminar no actualiza el carrito del servidor.
it('abre la visita y conserva los carritos recalculados al agregar, ajustar y eliminar', async () => {
  jest.mocked(api.openSession).mockResolvedValue({ sesion, comensal: { id: 'ana' } })
  const lineas = [{ producto_id: 7, cantidad: 2, nota: 'Sin sal' }]
  jest.mocked(api.addBundle).mockResolvedValue({ ...carrito, total: 24000 })
  await useDinerStore.getState().addBundle(lineas)
  expect(api.addBundle).toHaveBeenCalledWith('visita', lineas)
  expect(useDinerStore.getState().cart?.total).toBe(24000)
  jest.mocked(api.updateLine).mockResolvedValue({ ...carrito, total: 36000 })
  await useDinerStore.getState().setQty(1, 3)
  expect(api.updateLine).toHaveBeenCalledWith('visita', 1, { cantidad: 3 })
  expect(useDinerStore.getState().cart?.total).toBe(36000)
  jest.mocked(api.removeLine).mockResolvedValue(carrito)
  await useDinerStore.getState().remove(1)
  expect(api.removeLine).toHaveBeenCalledWith('visita', 1)
  expect(useDinerStore.getState().cart).toEqual(carrito)
  expect(api.openSession).toHaveBeenCalledTimes(1)
})

// Falla si el refresco mantiene importes viejos o si pedir la cuenta no guarda la respuesta del salón.
it('refresca el carrito, llama al mesero y solicita la cuenta de la misma visita', async () => {
  useDinerStore.setState({ session: sesion })
  jest.mocked(api.getCart).mockResolvedValue(carrito)
  await useDinerStore.getState().refreshCart()
  expect(useDinerStore.getState().cart).toEqual(carrito)
  jest.mocked(api.callWaiter).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  expect(await useDinerStore.getState().call()).toBe(false)
  expect(await useDinerStore.getState().call()).toBe(true)
  expect(api.callWaiter).toHaveBeenLastCalledWith('visita')
  const bill = { total: 24000, mio: 12000, ok: true, partes: 2, porParte: 12000, porComensal: [] }
  jest.mocked(api.requestBill).mockResolvedValue(bill)
  expect(await useDinerStore.getState().askBill()).toEqual(bill)
  expect(useDinerStore.getState().bill).toEqual(bill)
  jest.mocked(api.getOrder).mockResolvedValue({ id: 'pedido-1', sesion: 'visita', estado: 'listo', total: 24000, impuestos: 0, intentos: 1 })
  await useDinerStore.getState().refreshOrder('pedido-1')
  expect(useDinerStore.getState().order?.estado).toBe('listo')
})

// Falla si renovar el código conserva el identificador vencido o borra el registro pendiente ante un fallo de red.
it('renueva el registro pendiente y conserva los datos cuando el reenvío falla', async () => {
  expect(await useDinerStore.getState().resendCode()).toBe(false)
  useDinerStore.setState({ pendingAccount: { id: 'anterior', form } })
  jest.mocked(api.registerAccount).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ id: 'nuevo', codigoDemo: true })
  expect(await useDinerStore.getState().resendCode()).toBe(false)
  expect(useDinerStore.getState().pendingAccount?.id).toBe('anterior')
  expect(useDinerStore.getState().error).toBe('Sin conexión')
  expect(await useDinerStore.getState().resendCode()).toBe(true)
  expect(useDinerStore.getState().pendingAccount).toEqual({ id: 'nuevo', form })
  expect(api.registerAccount).toHaveBeenLastCalledWith(form)
})

// Falla si favoritos se cambian antes de confirmarlos, se duplican por doble toque o se pierde la lista al fallar.
it('carga y alterna favoritos con confirmación del servidor y bloqueo de toques simultáneos', async () => {
  useDinerStore.setState({ account: cuenta })
  jest.mocked(api.getFavorites).mockResolvedValue([7])
  await useDinerStore.getState().loadFavorites()
  expect(useDinerStore.getState().favorites).toEqual([7])
  let terminar!: (ids: number[]) => void
  jest.mocked(api.setFavorite).mockImplementationOnce(() => new Promise(resolve => { terminar = resolve }))
  const pendiente = useDinerStore.getState().favorite(7)
  expect(useDinerStore.getState().favoritesBusy).toBe(true)
  expect(await useDinerStore.getState().favorite(7)).toBe(false)
  expect(api.setFavorite).toHaveBeenCalledTimes(1)
  expect(api.setFavorite).toHaveBeenCalledWith('casa', 'centro', 7, false)
  terminar([])
  expect(await pendiente).toBe(true)
  expect(useDinerStore.getState().favorites).toEqual([])
  jest.mocked(api.setFavorite).mockResolvedValueOnce([8]).mockRejectedValueOnce(new Error('Sin conexión'))
  expect(await useDinerStore.getState().favorite(8)).toBe(true)
  expect(api.setFavorite).toHaveBeenLastCalledWith('casa', 'centro', 8, true)
  expect(await useDinerStore.getState().favorite(8)).toBe(false)
  expect(useDinerStore.getState().favorites).toEqual([8])
  expect(useDinerStore.getState().favoritesBusy).toBe(false)
})

// Falla si una respuesta lenta de favoritos reaparece después de cerrar sesión o cambiar de local.
it('descarta favoritos que llegan después de abandonar la cuenta o la sede', async () => {
  let terminar!: (ids: number[]) => void
  useDinerStore.setState({ account: cuenta })
  jest.mocked(api.getFavorites).mockImplementation(() => new Promise(resolve => { terminar = resolve }))
  const pendiente = useDinerStore.getState().loadFavorites()
  useDinerStore.setState({ account: null })
  terminar([7])
  await pendiente
  expect(useDinerStore.getState().favorites).toEqual([])
  useDinerStore.setState({ account: cuenta })
  jest.mocked(api.setFavorite).mockImplementation(() => new Promise(resolve => { terminar = resolve }))
  const agregar = useDinerStore.getState().favorite(8)
  useDinerStore.setState({ keys: { ...claves, venue: 'otra' } })
  terminar([8])
  await agregar
  expect(useDinerStore.getState().favorites).toEqual([])
})

// Falla si una sesión abierta tarde reemplaza la visita de una mesa elegida después.
it('descarta una apertura de sesión cuando el comensal ya cambió de mesa', async () => {
  let terminar!: (value: Awaited<ReturnType<typeof api.openSession>>) => void
  jest.mocked(api.openSession).mockImplementation(() => new Promise(resolve => { terminar = resolve }))
  const pendiente = useDinerStore.getState().ensureSession()
  useDinerStore.setState({ keys: { ...claves, token: 'OTRA' } })
  terminar({ sesion, comensal: { id: 'ana' } })
  expect(await pendiente).toBeNull()
  expect(useDinerStore.getState().session).toBeNull()
})

// Falla si una entrada lenta de otro local reemplaza la carta que el comensal acaba de abrir.
it('conserva la última sede elegida aunque la anterior responda después', async () => {
  let terminar!: (value: Entry) => void
  const nueva = { contexto: { plantilla: DEFAULT_TEMPLATE }, carta: { categorias: [] } } as unknown as Entry
  jest.mocked(api.getEntry).mockImplementationOnce(() => new Promise(resolve => { terminar = resolve })).mockResolvedValueOnce(nueva)
  const pendiente = useDinerStore.getState().load(claves)
  await useDinerStore.getState().load({ ...claves, venue: 'otra' })
  terminar({ ...nueva, carta: { restaurante: 'anterior', categorias: [] } })
  await pendiente
  expect(useDinerStore.getState().entry).toBe(nueva)
  expect(useDinerStore.getState().keys?.venue).toBe('otra')
  expect(useDinerStore.getState().busy).toBe(false)
})

// Falla si desde un borrador se modifica el consumo, la cuenta o los favoritos del comensal.
it.each(['plantilla', 'enlace'])('impide acciones de escritura en la vista previa por %s', async modo => {
  useDinerStore.setState({ account: cuenta, session: sesion, pendingAccount: { id: 'ana', form }, ...(modo === 'plantilla' ? { preview: DEFAULT_TEMPLATE } : { draftToken: 'borrador' }) })
  const estado = useDinerStore.getState()
  await estado.addBundle([{ producto_id: 7, cantidad: 1, nota: '' }])
  await estado.setQty(1, 2); await estado.remove(1)
  expect(await estado.call()).toBe(false)
  expect(await estado.askBill()).toBeNull()
  expect(await estado.register(form)).toBeNull()
  expect(await estado.resendCode()).toBe(false)
  expect(await estado.verify('123456')).toBe(false)
  await estado.logout()
  expect(await estado.favorite(7)).toBe(false)
  for (const servicio of [api.addBundle, api.updateLine, api.removeLine, api.callWaiter, api.requestBill, api.registerAccount, api.verifyAccount, api.logoutAccount, api.setFavorite]) expect(servicio).not.toHaveBeenCalled()
  expect(useDinerStore.getState().account).toEqual(cuenta)
  expect(useDinerStore.getState().error).toContain('vista previa')
})
