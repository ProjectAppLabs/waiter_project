'use client'

import { onCore } from '@/lib/domain/backend'
import axios from 'axios'
import { useAuthStore } from '@/lib/stores/authStore'

import { OdooError } from '@/lib/services/errors'

interface JsonRpcResponse<T> {
  jsonrpc: '2.0'
  id: number | null
  result?: T
  error?: { message: string; data?: { name?: string; message?: string } }
}

// Mismo origen: Next reescribe /odoo/* hacia Odoo, y así viaja la cookie session_id.
export const http = axios.create({ baseURL: '/odoo', timeout: 60_000, withCredentials: true })

let nextId = 1

export async function jsonRpc<T>(path: string, params: Record<string, unknown>): Promise<T> {
  // Plan O: las pasarelas de administración del addon (/waiter/admin/*) necesitan saber qué restaurante se opera; la
  // organización la ponen ellas mismas.
  const configId = path.startsWith('/waiter/admin/') && !('config_id' in params) ? currentConfigId() : null
  const { data } = await http.post<JsonRpcResponse<T>>(path, {
    jsonrpc: '2.0', method: 'call', id: nextId++, params: configId !== null ? { ...params, config_id: configId } : params,
  })
  if (data.error) {
    const detail = data.error.data ?? {}
    throw new OdooError(detail.message ?? data.error.message, detail.name ?? 'odoo.exceptions.Error')
  }
  return data.result as T
}

export function callKw<T>(
  model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {},
): Promise<T> {
  const configId = currentConfigId()
  const { employee } = useAuthStore.getState()
  const context = { ...((kwargs.context as Record<string, unknown>) ?? {}) }
  if (employee?.token) context.waiter_pos_identity = { id: employee.id, token: employee.token, config_id: configId }
  // Plan O: el restaurante en uso viaja siempre; el addon lo usa para el almacén, los avisos y las pasarelas.
  if (configId !== null) context.waiter_config_id = configId
  const withContext = employee?.token || configId !== null
  return jsonRpc<T>('/web/dataset/call_kw', { model, method, args, kwargs: withContext ? { ...kwargs, context } : kwargs })
}

// El restaurante en uso (plan O): el de la caja abierta o, sin caja, el del dispositivo. null si no se sabe (una sede).
export function currentConfigId(): number | null {
  const { session, restaurant, restaurants } = useAuthStore.getState()
  // Plan T: en el sistema propio todavía no se elige restaurante en el dispositivo (T2); vale el primero de la organización.
  return session?.configId ?? restaurant?.id ?? (onCore() ? restaurants?.[0]?.id ?? null : null)
}
// Añade el filtro del restaurante en uso a un dominio de Odoo; sin restaurante conocido, lo deja igual.
export function inRestaurant(domain: unknown[], field = 'config_id'): unknown[] {
  const id = currentConfigId()
  return id === null ? domain : [...domain, [field, '=', id]]
}
