import { currentOrg } from '@/lib/domain/tenant'
import { cacheSessionEnded, captureCacheContext, isCurrentCacheContext, recall, remember } from '@/lib/offline/cache'
import { markOffline, markOnline } from '@/lib/offline/network'

// Plan T: el transporte hacia el sistema propio (Django). Mismo origen: Next reescribe /experience/* hacia Django, y así
// viajan las cookies HttpOnly de sesión (`waiter_sid`, `waiter_platform_sid`). Cada petición del POS lleva la
// organización en `X-Waiter-Org`; la plataforma de ProjectApp no la lleva.
const BASE = '/experience/api'

export class CoreError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'CoreError'
  }
}

export type CoreScope = 'pos' | 'platform'
interface Options { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; scope?: CoreScope }

export async function coreFetch<T>(path: string, { method = 'GET', body, scope = 'pos' }: Options = {}): Promise<T> {
  const context = captureCacheContext()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (scope === 'pos') { const org = currentOrg(); if (org) headers['X-Waiter-Org'] = org }
  // Las rutas del sistema propio van sin barra final (así las define `tenancy/urls.py`); Django no redirige los POST,
  // así que la ruta se envía tal cual.
  const url = `${BASE}/${scope}/v1/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`
  const relative = path.replace(/^\/+/, '').replace(/\/+$/, '')
  const assertCurrentRead = () => {
    if (scope === 'pos' && method === 'GET' && !isCurrentCacheContext(context)) {
      throw new CoreError(401, 'session_changed', 'La sesión cambió. Vuelve a consultar desde tu cuenta.')
    }
  }
  // Una salida local sigue vigente aunque el servidor no haya recibido el cierre de la cookie.
  if (scope === 'pos' && relative === 'auth/me' && method === 'GET' && cacheSessionEnded(context)) {
    throw new CoreError(401, 'unauthenticated', 'Inicia sesión para continuar.')
  }
  // Plan U2: sin red, las lecturas que el POS necesita salen de la última respuesta guardada.
  const unreachable = () => {
    assertCurrentRead()
    markOffline()
    const cached = scope === 'pos' && method === 'GET' ? recall(relative, context) : null
    if (cached !== null) return JSON.parse(cached) as T
    throw new CoreError(0, 'unreachable', 'No se pudo conectar con el servidor. Revisa la conexión de este dispositivo.')
  }
  let response: Response
  try {
    response = await fetch(url, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    return unreachable()
  }
  // El proxy responde 502–504 cuando el servidor no está: es lo mismo que no tener red.
  if (response.status >= 502 && response.status <= 504) return unreachable()
  const text = await response.text()
  assertCurrentRead()
  markOnline()
  if (response.ok && scope === 'pos' && method === 'GET') remember(relative, text, context)
  let data: Record<string, unknown> = {}
  try { data = text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { /* respuesta sin JSON: se trata abajo */ }
  if (!response.ok) {
    const code = typeof data.error === 'string' ? data.error : `http_${response.status}`
    const message = typeof data.message === 'string' ? data.message : `El servidor respondió ${response.status}.`
    throw new CoreError(response.status, code, message, data)
  }
  return data as T
}
