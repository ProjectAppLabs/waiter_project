'use client'

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
  const { data } = await http.post<JsonRpcResponse<T>>(path, {
    jsonrpc: '2.0', method: 'call', id: nextId++, params,
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
  const { employee, session } = useAuthStore.getState()
  const context = { ...((kwargs.context as Record<string, unknown>) ?? {}) }
  if (employee?.token) context.waiter_pos_identity = { id: employee.id, token: employee.token, config_id: session?.configId }
  return jsonRpc<T>('/web/dataset/call_kw', { model, method, args, kwargs: employee?.token ? { ...kwargs, context } : kwargs })
}
