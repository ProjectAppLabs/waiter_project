import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import * as api from '../api'
import { setPreviewReadOnly, PREVIEW_MESSAGE } from '@/lib/domain/preview'

const transporte = jest.fn()
const adaptador = api.http.defaults.adapter
beforeEach(() => {
  transporte.mockReset()
  api.http.defaults.adapter = transporte
  setPreviewReadOnly(false)
})
afterEach(() => { api.http.defaults.adapter = adaptador; setPreviewReadOnly(false) })
function responder(data: unknown) {
  transporte.mockImplementationOnce(async (config: InternalAxiosRequestConfig) => ({ data, config, status: 200, statusText: 'OK', headers: {} }))
}
function enviado(method: string, url: string, datos?: unknown) {
  const config = transporte.mock.calls.at(-1)![0]
  expect(config).toMatchObject({ method, url, withCredentials: true })
  expect(config.data === undefined ? undefined : JSON.parse(config.data)).toEqual(datos)
}

// Falla si entrar por QR pierde la mesa o si explorar sin QR inventa un token al abrir la visita.
it('consulta el menú y abre la visita correspondiente a la mesa o al local', async () => {
  const entrada = { contexto: { mesa: { numero: 4 } }, carta: { categorias: [] } }
  responder(entrada)
  expect(await api.getEntry('casa', 'centro', 'MESA')).toEqual(entrada)
  enviado('get', '/api/v1/casa/centro/t/MESA/')
  responder(entrada)
  await api.getEntry('casa', 'centro', null)
  enviado('get', '/api/v1/casa/centro/')
  responder({ sesion: { id: 'visita' } })
  expect(await api.openSession('casa', 'centro', null)).toEqual({ sesion: { id: 'visita' } })
  enviado('post', '/api/v1/sesiones/', { restaurante: 'casa', sede: 'centro' })
})

// Falla si modificar el pedido manda cantidades o notas distintas, o deja de devolver el carrito recalculado.
it('agrega, ajusta y elimina platos usando el carrito que responde el servidor', async () => {
  const carrito = { lineas: [{ id: 3, cantidad: 2 }], total: 24000 }
  responder(carrito)
  expect(await api.addLine('visita', 7, 2, 'Sin cebolla')).toEqual(carrito)
  enviado('post', '/api/v1/sesiones/visita/lineas/', { producto_id: 7, cantidad: 2, nota: 'Sin cebolla' })
  responder(carrito)
  expect(await api.updateLine('visita', 3, { cantidad: 3, nota: 'Salsa aparte' })).toEqual(carrito)
  enviado('patch', '/api/v1/sesiones/visita/lineas/3/', { cantidad: 3, nota: 'Salsa aparte' })
  responder({ lineas: [], total: 0 })
  expect(await api.removeLine('visita', 3)).toEqual({ lineas: [], total: 0 })
  enviado('delete', '/api/v1/sesiones/visita/lineas/3/')
  responder(carrito)
  expect(await api.getCart('visita')).toEqual(carrito)
  enviado('get', '/api/v1/sesiones/visita/carrito/')
  const lineas = [{ producto_id: 8, cantidad: 1, nota: '' }]
  responder(carrito)
  expect(await api.addBundle('visita', lineas)).toEqual(carrito)
  enviado('post', '/api/v1/sesiones/visita/platos/', { lineas })
})

// Falla si confirmar pierde la modalidad, las notas o las alergias que debe recibir la cocina.
it.each([
  [undefined, undefined, undefined],
  [true, undefined, { para_llevar: true }],
  [false, { notas: 'Salsa aparte', alergenos: 'Maní' }, { para_llevar: false, notas: 'Salsa aparte', alergenos: 'Maní' }],
  [undefined, { notas: '', alergenos: 'Leche' }, { notas: '', alergenos: 'Leche' }],
])('confirma la modalidad %s y los detalles %j', async (modalidad, detalles, cuerpo) => {
  responder({ pedido: 'pedido-1', estado: 'pendiente_pago' })
  expect(await api.confirmOrder('visita', modalidad, detalles)).toMatchObject({ pedido: 'pedido-1' })
  enviado('post', '/api/v1/sesiones/visita/confirmar/', cuerpo)
})

// Falla si consultar la cuenta llama al mesero o si solicitar atención ignora su confirmación.
it('distingue consultar el consumo, pedir la cuenta y llamar al mesero', async () => {
  const cuenta = { total: 24000, mio: 12000, ok: true }
  responder(cuenta)
  expect(await api.quoteBill('visita')).toEqual(cuenta)
  enviado('get', '/api/v1/sesiones/visita/cuenta/')
  responder(cuenta)
  expect(await api.requestBill('visita')).toEqual(cuenta)
  enviado('post', '/api/v1/sesiones/visita/cuenta/')
  responder({ ok: false })
  expect(await api.callWaiter('visita')).toBe(false)
  enviado('post', '/api/v1/sesiones/visita/llamar/')
  responder({ estado: 'en_cocina' })
  expect(await api.getOrder('pedido-1')).toEqual({ estado: 'en_cocina' })
  enviado('get', '/api/v1/pedidos/pedido-1/')
})

// Falla si registro y verificación no comparten el identificador o si editar y salir usan una cuenta ajena.
it('registra, verifica, consulta y actualiza la cuenta de la cookie', async () => {
  const form = { nombre: 'Ana', correo: 'ana@example.invalid', celular: '', aceptaDatos: true, novedades: false }
  responder({ id: 'ana', codigoDemo: true })
  expect(await api.registerAccount(form)).toEqual({ id: 'ana', codigoDemo: true })
  enviado('post', '/api/v1/cuenta/registro/', form)
  responder({ ok: true })
  expect(await api.verifyAccount('ana', '123456')).toEqual({ ok: true })
  enviado('post', '/api/v1/cuenta/verificar/', { id: 'ana', codigo: '123456' })
  responder({ cuenta: form, pedidos: [] })
  expect(await api.getAccount()).toEqual({ cuenta: form, pedidos: [] })
  enviado('get', '/api/v1/cuenta/')
  responder({ cuenta: { ...form, alergenos: 'Maní' }, pedidos: [] })
  expect(await api.updateAccount({ alergenos: 'Maní' })).toMatchObject({ cuenta: { alergenos: 'Maní' } })
  enviado('patch', '/api/v1/cuenta/', { alergenos: 'Maní' })
  responder({ ok: true })
  await api.logoutAccount()
  enviado('post', '/api/v1/cuenta/salir/')
})

// Falla si favoritos o cupones se aplican a otra visita o si quitar uno mantiene el resultado anterior.
it('guarda favoritos y aplica o retira el cupón con la respuesta del restaurante', async () => {
  responder({ favoritos: [7] })
  expect(await api.getFavorites('casa', 'centro')).toEqual([7])
  enviado('get', '/api/v1/casa/centro/favoritos/')
  responder({ favoritos: [7, 8] })
  expect(await api.setFavorite('casa', 'centro', 8, true)).toEqual([7, 8])
  enviado('put', '/api/v1/casa/centro/favoritos/8/')
  responder({ favoritos: [7] })
  expect(await api.setFavorite('casa', 'centro', 8, false)).toEqual([7])
  enviado('delete', '/api/v1/casa/centro/favoritos/8/')
  responder({ total: 20000 })
  expect(await api.applyCoupon('visita', 'BIENVENIDA')).toEqual({ total: 20000 })
  enviado('put', '/api/v1/sesiones/visita/cupon/', { codigo: 'BIENVENIDA' })
  responder({ total: 24000 })
  expect(await api.applyCoupon('visita', null)).toEqual({ total: 24000 })
  enviado('delete', '/api/v1/sesiones/visita/cupon/')
})

// Falla si el asistente pierde el identificador del mensaje o agrega cantidades distintas de las elegidas.
it('recupera la conversación, envía una consulta, agrega una opción y empieza de nuevo', async () => {
  responder({ disponible: true, mensajes: [] })
  expect(await api.getChat('visita')).toEqual({ disponible: true, mensajes: [] })
  enviado('get', '/api/v1/sesiones/visita/asistente/')
  responder({ respuesta: 'Tenemos sopa' })
  expect(await api.sendChat('visita', 'mensaje-1', '¿Qué sopa hay?')).toEqual({ respuesta: 'Tenemos sopa' })
  enviado('post', '/api/v1/sesiones/visita/asistente/', { id: 'mensaje-1', mensaje: '¿Qué sopa hay?' })
  expect(transporte.mock.calls.at(-1)![0].timeout).toBe(45000)
  responder({ carrito: { total: 24000 }, selecciones: [] })
  expect(await api.addChatSelection('visita', 'mensaje-1', 7, 2, 'Sin sal')).toMatchObject({ carrito: { total: 24000 } })
  enviado('post', '/api/v1/sesiones/visita/asistente/agregar/', { mensaje: 'mensaje-1', producto: 7, cantidad: 2, nota: 'Sin sal' })
  responder({ disponible: true, mensajes: [] })
  expect(await api.newChat('visita')).toEqual({ disponible: true, mensajes: [] })
  enviado('delete', '/api/v1/sesiones/visita/asistente/')
})

// Falla si la simulación cobra un reparto distinto del elegido o pierde su aviso de demostración.
it('simula el pago de la mesa o del consumo personal', async () => {
  responder({ demo: true, estado: 'aprobado' })
  expect(await api.simulatePayment('visita', 'pse')).toMatchObject({ demo: true })
  enviado('post', '/api/v1/sesiones/visita/pago/simulado/', { metodo: 'pse', reparto: 'all' })
  responder({ demo: true, estado: 'rechazado' })
  expect(await api.simulatePayment('visita', 'nequi', 'mine')).toMatchObject({ estado: 'rechazado' })
  enviado('post', '/api/v1/sesiones/visita/pago/simulado/', { metodo: 'nequi', reparto: 'mine' })
})

// Falla si un error de red o del restaurante llega sin un mensaje utilizable por el comensal.
it.each([[409, 'La mesa ya se pagó', 'La mesa ya se pagó'], [503, {}, 'Error 503'], [0, undefined, 'Sin conexión']])('presenta el error %s al comensal', async (status, detail, mensaje) => {
  transporte.mockImplementationOnce(async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Fallo de transporte', 'ERR_BAD_RESPONSE', config, undefined, status ? { status, data: { detail }, config, headers: {}, statusText: '' } as AxiosResponse : undefined)
  })
  await expect(api.getCart('visita')).rejects.toMatchObject({ message: mensaje, status })
})

// Errores de dominio del restaurante: llegan como {error, message}; el detalle de DRF no gana sobre el mensaje.
const ERRORES_DE_DOMINIO: [object, string][] = [
  [{ error: 'restaurant_closed', message: 'El restaurante no está recibiendo pedidos en este momento' }, 'El restaurante no está recibiendo pedidos en este momento'],
  [{ message: 'Confirma el pedido antes de pagar.', detail: 'Conflicto' }, 'Confirma el pedido antes de pagar.'],
]
// Falla si un error de dominio del restaurante, como la caja cerrada al confirmar, se muestra como «Error 409» en vez de
// su mensaje, o si el detalle gana sobre el mensaje.
it.each(ERRORES_DE_DOMINIO)('presenta al comensal el mensaje de un error de dominio %#', async (data, mensaje) => {
  transporte.mockImplementationOnce(async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Fallo de transporte', 'ERR_BAD_RESPONSE', config, undefined, { status: 409, data, config, headers: {}, statusText: '' } as AxiosResponse)
  })
  await expect(api.confirmOrder('visita')).rejects.toMatchObject({ message: mensaje, status: 409 })
})

// Falla si un borrador permite modificar el pedido o bloquea la consulta de su menú.
it('bloquea escrituras en vista previa antes de alcanzar la red y permite leer', async () => {
  setPreviewReadOnly(true)
  await expect(api.addLine('visita', 7, 1, '')).rejects.toMatchObject({ message: PREVIEW_MESSAGE, status: 403 })
  expect(transporte).not.toHaveBeenCalled()
  responder({ carta: { categorias: [] } })
  await expect(api.getEntry('casa', 'centro', null)).resolves.toEqual({ carta: { categorias: [] } })
})

// Falla si explorar locales, ubicación, beneficios o diseño usa una sede diferente o rompe los tokens con caracteres especiales.
it('recupera el local y sus beneficios y permite consultar un borrador identificado por enlace', async () => {
  responder({ restaurantes: [] })
  expect(await api.getOrganization('mi casa')).toEqual({ restaurantes: [] })
  enviado('get', '/api/v1/mi%20casa/')
  responder({ direccion: 'Calle 10' })
  expect(await api.getVenueLocation('casa', 'centro')).toEqual({ direccion: 'Calle 10' })
  enviado('get', '/api/v1/casa/centro/ubicacion/')
  responder({ puntos: 30 })
  expect(await api.getRewards('casa', 'centro')).toEqual({ puntos: 30 })
  enviado('get', '/api/v1/casa/centro/recompensas/')
  responder({ plantilla: { codigo: 'S1' } })
  expect(await api.getThemeDraft('mi casa', 'el centro', 'a/b')).toEqual({ plantilla: { codigo: 'S1' } })
  enviado('get', '/api/v1/mi%20casa/el%20centro/borradores/a%2Fb/')
  responder({ plantillas: [] })
  expect(await api.getTemplates('casa', 'centro')).toEqual({ plantillas: [] })
  expect(transporte.mock.calls.at(-1)![0].params).toEqual({ restaurante: 'casa', sede: 'centro' })
  responder({ componentes: [] })
  expect(await api.getDesignContract()).toEqual({ componentes: [] })
  enviado('get', '/api/v1/diseno/')
})

// Falla si lo que recuerda el asistente pierde el orden por frecuencia, muestra claves en vez de nombres, repite un plato
// en los últimos pedidos o muestra un favorito que ya no está en la carta.
it('traduce la memoria del asistente a lo que lee el comensal', () => {
  expect(api.toMemory({
    profile: { preferences: { dulce: 1, picante: 3 }, favorites: { '7': 2, '9': 5 }, allergens: 'Maní, mariscos',
      last_orders: [{ product_id: 7, name: 'Sopa' }, { product_id: 7, name: 'Sopa' }, { product_id: 8, name: 'Limonada' }] },
    labels: { preferences: { picante: 'Picante' }, products: { '7': 'Sopa' } },
  })).toEqual({
    preferencias: [{ clave: 'picante', nombre: 'Picante', veces: 3 }, { clave: 'dulce', nombre: 'dulce', veces: 1 }],
    favoritos: [{ producto: 7, nombre: 'Sopa' }],
    ultimos: [{ producto: 7, nombre: 'Sopa' }, { producto: 8, nombre: 'Limonada' }],
    alergias: ['Maní', 'mariscos'],
  })
})
