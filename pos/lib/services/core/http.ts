import { currentOrg } from '@/lib/domain/tenant'

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
interface Options { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; scope?: CoreScope }

export async function coreFetch<T>(path: string, { method = 'GET', body, scope = 'pos' }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (scope === 'pos') { const org = currentOrg(); if (org) headers['X-Waiter-Org'] = org }
  // Django exige la barra final (APPEND_SLASH) y no redirige los POST: se envía siempre.
  const url = `${BASE}/${scope}/v1/${path.replace(/^\/+/, '').replace(/\/?$/, '/')}`
  let response: Response
  try {
    response = await fetch(url, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new CoreError(0, 'unreachable', 'No se pudo conectar con el servidor. Revisa la conexión de este dispositivo.')
  }
  const text = await response.text()
  let data: Record<string, unknown> = {}
  try { data = text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { /* respuesta sin JSON: se trata abajo */ }
  if (!response.ok) {
    const code = typeof data.error === 'string' ? data.error : `http_${response.status}`
    const message = typeof data.message === 'string' ? data.message : `El servidor respondió ${response.status}.`
    throw new CoreError(response.status, code, message, data)
  }
  return data as T
}
