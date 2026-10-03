import { coreFetch } from '@/lib/services/core/http'
import type { LoginResult } from '@/lib/services/core/pos'

// Plan Y4: acceso de soporte de ProjectApp con permiso del dueño (contrato en docs/planes/2026-10-03-plan-Y-huecos.md).
export type SupportState = 'pedido' | 'vigente' | 'revocado' | 'vencido'
export interface SupportGrant {
  id: number; state: SupportState; reason: string; hours: number
  starts_at: string | null; ends_at: string | null; created_at: string
  requested_by: { name: string } | null; approved_by: { name: string } | null; revoked_by?: { name: string } | null
}
export const SUPPORT_STATE: Record<SupportState, string> = { pedido: 'Pedido, sin aprobar', vigente: 'Vigente', revocado: 'Revocado', vencido: 'Vencido' }
export const SUPPORT_MAX_HOURS = 72

// La consola del dueño.
export const listSupport = () => coreFetch<{ grants: SupportGrant[] }>('support').then((r) => r.grants)
export const grantSupport = (hours: number, reason: string) => coreFetch<{ grant: SupportGrant }>('support', { method: 'POST', body: { hours, reason } }).then((r) => r.grant)
export const approveSupport = (id: number) => coreFetch<{ grant: SupportGrant }>(`support/${id}/approve`, { method: 'POST' }).then((r) => r.grant)
export const revokeSupport = (id: number) => coreFetch<{ grant: SupportGrant }>(`support/${id}/revoke`, { method: 'POST' }).then((r) => r.grant)
// El POS cambia el token de un solo uso por una sesión de soporte.
export const enterSupport = (token: string) => coreFetch<LoginResult>('auth/support', { method: 'POST', body: { token } })

// La consola de ProjectApp, desde la ficha del cliente.
const platform = <T>(path: string, options: Parameters<typeof coreFetch>[1] = {}) => coreFetch<T>(path, { ...options, scope: 'platform' })
export const organizationSupport = (slug: string) => platform<{ grants: SupportGrant[] }>(`organizations/${slug}/support`).then((r) => r.grants)
export const requestSupport = (slug: string, reason: string, hours: number) => platform<{ grant: SupportGrant }>(`organizations/${slug}/support`, { method: 'POST', body: { reason, hours } }).then((r) => r.grant)
export const supportEntryUrl = (slug: string) => platform<{ url: string }>(`organizations/${slug}/support/enter`, { method: 'POST' }).then((r) => r.url)

export const supportWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
