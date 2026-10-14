import { coreFetch } from '@/lib/services/core/http'

// Plan Y2: el historial de cambios de la organización (contrato en docs/planes/2026-10-03-plan-Y-huecos.md).
export interface AuditEntry {
  id: number; at: string; restaurant: { id: number; name: string } | null
  actor: { kind: 'account' | 'platform' | 'system'; id: number | string | null; name: string }
  action: string; action_name: string; entity: string; entity_id: string | number | null; summary: string
  before: Record<string, unknown> | null; after: Record<string, unknown> | null
}
export interface AuditQuery { from?: string; to?: string; restaurant_id?: number | null; account_id?: number | null; action?: string; q?: string; limit?: number; offset?: number }
const qs = (p: AuditQuery) => new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
export const listAudit = (p: AuditQuery) => coreFetch<{ entries: AuditEntry[]; total: number }>(`audit?${qs(p)}`)
export const auditActions = () => coreFetch<{ actions: { key: string; name: string }[] }>('audit/actions').then((r) => r.actions)
