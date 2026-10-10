import axios from 'axios'
import { isPreviewReadOnly, PREVIEW_MESSAGE } from '@/lib/domain/preview'

import type { Account, AccountSummary, Bill, Cart, DesignContract, Entry, OrderStatus, PayMethod, PayScope, PayResult, RegisterForm, Session, Template, TemplateCatalog } from '@/lib/types'

// Único punto de I/O del comensal: la API pública del bloque 3, por el proxy same-origin (/api → experience).
export const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15_000 })

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

http.interceptors.request.use(config => {
  if (isPreviewReadOnly() && !['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    throw new ApiError(PREVIEW_MESSAGE, 403)
  }
  return config
})

http.interceptors.response.use((r) => r, (error) => {
  if (error instanceof ApiError) return Promise.reject(error)
  const status = error?.response?.status ?? 0
  // Los errores de dominio del restaurante llegan como {error, message} (p. ej. la caja cerrada); los de DRF, como {detail}.
  const data = error?.response?.data
  const text = [data?.message, data?.detail].find((value) => typeof value === 'string')
  return Promise.reject(new ApiError(text ?? (status ? `Error ${status}` : 'Sin conexión'), status))
})

const base = (rest: string, venue: string, token: string | null) => `/api/v1/${rest}/${venue}/${token ? `t/${token}/` : ''}`

export async function getEntry(rest: string, venue: string, token: string | null): Promise<Entry> {
  return (await http.get<Entry>(base(rest, venue, token))).data
}
// Plan O: los restaurantes de una organización, para su portada.
export async function getOrganization(rest: string): Promise<import('@/lib/types').OrganizationEntry> {
  return (await http.get(`/api/v1/${encodeURIComponent(rest)}/`)).data
}
export async function getThemeDraft(rest: string, venue: string, token: string): Promise<{plantilla: Template; caduca: string}> {
  return (await http.get(`/api/v1/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/borradores/${encodeURIComponent(token)}/`)).data
}
// Esquema e inventario del sistema de diseño (J5): describe cada componente y opción de la página viva.
export async function getDesignContract(): Promise<DesignContract> {
  return (await http.get<DesignContract>('/api/v1/diseno/')).data
}
export async function openSession(rest: string, venue: string, token: string | null): Promise<{ sesion: Session; comensal: { id: string } }> {
  return (await http.post('/api/v1/sesiones/', { restaurante: rest, sede: venue, token: token ?? undefined })).data
}
export async function getCart(sessionId: string): Promise<Cart> {
  return (await http.get<Cart>(`/api/v1/sesiones/${sessionId}/carrito/`)).data
}
export async function addLine(sessionId: string, productId: number, qty: number, note: string): Promise<Cart> {
  return (await http.post<Cart>(`/api/v1/sesiones/${sessionId}/lineas/`, { producto_id: productId, cantidad: qty, nota: note })).data
}
export async function updateLine(sessionId: string, lineId: number, patch: { cantidad?: number; nota?: string }): Promise<Cart> {
  return (await http.patch<Cart>(`/api/v1/sesiones/${sessionId}/lineas/${lineId}/`, patch)).data
}
export async function removeLine(sessionId: string, lineId: number): Promise<Cart> {
  return (await http.delete<Cart>(`/api/v1/sesiones/${sessionId}/lineas/${lineId}/`)).data
}
export async function confirmOrder(sessionId: string, takeaway?: boolean, details?: {notas: string; alergenos: string}): Promise<{ pedido: string; estado: string; total: number; cuenta: Bill }> {
  return (await http.post(`/api/v1/sesiones/${sessionId}/confirmar/`, details ? {...details, ...(takeaway === undefined ? {} : {para_llevar:takeaway})} : takeaway === undefined ? undefined : {para_llevar: takeaway})).data
}
export async function getOrder(orderId: string): Promise<OrderStatus> {
  return (await http.get<OrderStatus>(`/api/v1/pedidos/${orderId}/`)).data
}
export async function callWaiter(sessionId: string): Promise<boolean> {
  return (await http.post<{ ok: boolean }>(`/api/v1/sesiones/${sessionId}/llamar/`)).data.ok
}
export async function quoteBill(sessionId: string): Promise<Bill> {
  return (await http.get<Bill>(`/api/v1/sesiones/${sessionId}/cuenta/`)).data
}
export async function requestBill(sessionId: string): Promise<Bill> {
  return (await http.post<Bill>(`/api/v1/sesiones/${sessionId}/cuenta/`)).data
}

// ---- Plan H: plantillas, cuenta y pago maquetado (contrato 3). Si experience aún no expone estos endpoints, fallan con ApiError. ----
export async function getTemplates(restaurante?: string, sede?: string): Promise<TemplateCatalog> {
  return (await http.get<TemplateCatalog>('/api/v1/plantillas/', { params: { restaurante, sede } })).data
}
export async function registerAccount(form: RegisterForm): Promise<{ id: string; codigoDemo: boolean }> {
  return (await http.post('/api/v1/cuenta/registro/', form)).data
}
// En demo el backend acepta cualquier código de seis dígitos y liga la cuenta a la cookie del comensal.
export async function verifyAccount(id: string, codigo: string): Promise<{ ok?: boolean; cuenta?: Account }> {
  return (await http.post('/api/v1/cuenta/verificar/', { id, codigo })).data
}
export async function getAccount(): Promise<AccountSummary> {
  return (await http.get<AccountSummary>('/api/v1/cuenta/')).data
}
export async function logoutAccount(): Promise<void> {
  await http.post('/api/v1/cuenta/salir/')
}
// No toca Odoo: devuelve { estado: 'aprobado', referencia, demo: true }. El POS sigue cobrando en la mesa.
export async function simulatePayment(sessionId: string, metodo: PayMethod, reparto: PayScope = 'all'): Promise<PayResult> {
  return (await http.post<PayResult>(`/api/v1/sesiones/${sessionId}/pago/simulado/`, { metodo, reparto })).data
}

export async function getFavorites(rest: string, venue: string): Promise<number[]> {
  return (await http.get<{ favoritos: number[] }>(`/api/v1/${rest}/${venue}/favoritos/`)).data.favoritos
}
export async function setFavorite(rest: string, venue: string, productId: number, favorite: boolean): Promise<number[]> {
  const url = `/api/v1/${rest}/${venue}/favoritos/${productId}/`
  return (await (favorite ? http.put<{ favoritos: number[] }>(url) : http.delete<{ favoritos: number[] }>(url))).data.favoritos
}

export async function updateAccount(patch: Partial<{nombre: string; celular: string; novedades: boolean; alergenos: string}>): Promise<AccountSummary> {
  return (await http.patch<AccountSummary>('/api/v1/cuenta/', patch)).data
}

export async function addBundle(sessionId: string, lineas: {producto_id:number;cantidad:number;nota:string}[]): Promise<Cart> {
 return (await http.post<Cart>(`/api/v1/sesiones/${sessionId}/platos/`,{lineas})).data
}

export async function getVenueLocation(rest:string,venue:string):Promise<import('@/lib/types').VenueLocation> {
 return (await http.get(`/api/v1/${rest}/${venue}/ubicacion/`)).data
}
export async function getRewards(rest:string,venue:string):Promise<import('@/lib/types').DinerRewards> {
 return (await http.get(`/api/v1/${rest}/${venue}/recompensas/`)).data
}
export async function applyCoupon(sessionId:string,code:string|null):Promise<Cart> {
 const url=`/api/v1/sesiones/${sessionId}/cupon/`
 return (await (code===null?http.delete<Cart>(url):http.put<Cart>(url,{codigo:code}))).data
}

export interface ChatTurn {
  id: string
  mensaje: string
  respuesta: string
  accion: 'preguntar' | 'recomendar' | 'cotizar' | 'agregar' | 'humano'
  opciones?: string[]
  selecciones?: ChatSelection[]
  carrito?: Cart
  resultado_carrito?: string
  lineas: { producto: number; cantidad: number; nombre: string; nota?: string }[]
  aviso?: ChatNotice | null
}
// Plan AS: la escalera de avisos del asistente (recordatorio, advertencia, restricción, pausa y cupo del día).
export interface ChatNotice { tipo: 'recordatorio' | 'advertencia' | 'restringido' | 'pausado' | 'cupo'; hasta: string | null }
export async function getChat(sessionId: string): Promise<{ disponible: boolean; mensajes: ChatTurn[]; selecciones?: ChatSelection[] }> {
  return (await http.get(`/api/v1/sesiones/${sessionId}/asistente/`)).data
}
export async function sendChat(sessionId: string, id: string, mensaje: string): Promise<ChatTurn> {
  return (await http.post(`/api/v1/sesiones/${sessionId}/asistente/`, { id, mensaje }, { timeout: 45_000 })).data
}

export interface ChatSelection { message_id: string; product_id: number; qty: number }
export async function addChatSelection(sessionId: string, mensaje: string, producto: number, cantidad: number, nota: string): Promise<{carrito: Cart; selecciones: ChatSelection[]}> {
  return (await http.post(`/api/v1/sesiones/${sessionId}/asistente/agregar/`, {mensaje, producto, cantidad, nota}, {timeout: 45_000})).data
}

export async function newChat(sessionId: string): Promise<{disponible: boolean; mensajes: ChatTurn[]}> {
  return (await http.delete(`/api/v1/sesiones/${sessionId}/asistente/`)).data
}

// Plan AS: lo que el asistente aprendió del comensal en este restaurante; el comensal lo ve y lo borra.
export interface AssistantMemory {
  preferencias: { clave: string; nombre: string; veces: number }[]
  favoritos: { producto: number; nombre: string }[]
  ultimos: { producto: number; nombre: string }[]
  alergias: string[]
}
const memoryUrl = (rest: string, venue: string) => `/api/v1/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/assistant/profile`
interface RawMemory {
  profile: { preferences: Record<string, number>; favorites: Record<string, number>; last_orders: { product_id: number; name: string }[]; allergens: string }
  labels: { preferences: Record<string, string>; products: Record<string, string> }
}
// El servidor guarda contadores por clave; aquí se ordenan por frecuencia y se ponen los nombres que manda.
export function toMemory({ profile, labels }: RawMemory): AssistantMemory {
  const byCount = (counts: Record<string, number>) => Object.entries(counts).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  const seen = new Set<number>()
  return {
    preferencias: byCount(profile.preferences).map(([clave, veces]) => ({ clave, nombre: labels.preferences[clave] ?? clave, veces })),
    favoritos: byCount(profile.favorites).filter(([id]) => labels.products[id]).map(([id]) => ({ producto: Number(id), nombre: labels.products[id] })),
    ultimos: profile.last_orders.filter((o) => !seen.has(o.product_id) && seen.add(o.product_id)).slice(0, 5).map((o) => ({ producto: o.product_id, nombre: o.name })),
    alergias: profile.allergens.split(',').map((a) => a.trim()).filter(Boolean),
  }
}
export async function getAssistantMemory(rest: string, venue: string): Promise<AssistantMemory> {
  return toMemory((await http.get<RawMemory>(memoryUrl(rest, venue))).data)
}
export async function forgetAssistantMemory(rest: string, venue: string): Promise<void> {
  await http.delete(memoryUrl(rest, venue))
}
