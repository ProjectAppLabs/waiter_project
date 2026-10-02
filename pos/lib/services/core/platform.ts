import { coreFetch } from '@/lib/services/core/http'

// Plan T0: la API de la plataforma de ProjectApp (contrato en docs/planes/2026-10-01-plan-T-sistema-propio.md).
export type PlatformRole = 'admin' | 'operator'
export interface PlatformUser { id: string; name: string; username: string; email: string; role: PlatformRole; status?: 'active' | 'pending'; active?: boolean }
export type OrganizationStatus = 'trial' | 'active' | 'suspended'
export interface OrganizationOwner { name: string; email: string; username: string; status: 'pending' | 'active' }
export interface Organization {
  id: string; slug: string; name: string; legal_name: string; tax_id: string; billing_email: string; billing_contact: string
  plan: string; monthly_price: number; status: OrganizationStatus; trial_ends: string | null; max_restaurants: number
  timezone: string; suspended_at: string | null; suspended_reason: string; created_at: string
  owner?: OrganizationOwner; restaurants_count?: number
}
export interface OrganizationInput {
  name: string; slug: string; legal_name: string; tax_id: string; billing_email: string; billing_contact: string
  plan: string; monthly_price: number; max_restaurants: number; trial_ends: string | null; timezone: string
  owner: { name: string; email: string; username?: string }
}
export interface AuditEntry { id: string; action: string; detail: Record<string, unknown>; at: string; actor: { name: string } | null }
export interface OrganizationDetail { organization: Organization; owner: OrganizationOwner; restaurants: { id: string; slug: string; name: string }[]; audit: AuditEntry[] }

const platform = <T>(path: string, options: Parameters<typeof coreFetch>[1] = {}) => coreFetch<T>(path, { ...options, scope: 'platform' })

export const platformLogin = (login: string, password: string) => platform<{ user: PlatformUser }>('auth/login', { method: 'POST', body: { login, password } })
export const platformLogout = () => platform<{ ok: true }>('auth/logout', { method: 'POST' })
export const platformMe = () => platform<{ user: PlatformUser }>('auth/me')
export const platformRequestCode = (login: string) => platform<{ ok: true }>('auth/request_code', { method: 'POST', body: { login } })
export const platformActivate = (login: string, code: string, password: string) => platform<{ ok: true }>('auth/activate', { method: 'POST', body: { login, code, password } })

export const listOrganizations = () => platform<{ organizations: Organization[] }>('organizations').then((r) => r.organizations)
export const createOrganization = (input: OrganizationInput) => platform<{ organization: Organization }>('organizations', { method: 'POST', body: input }).then((r) => r.organization)
export const getOrganization = (slug: string) => platform<OrganizationDetail>(`organizations/${slug}`)
export const updateOrganization = (slug: string, patch: Partial<Omit<OrganizationInput, 'slug' | 'owner'>>) =>
  platform<{ organization: Organization }>(`organizations/${slug}`, { method: 'PATCH', body: patch }).then((r) => r.organization)
export const suspendOrganization = (slug: string, reason: string) => platform<{ organization: Organization }>(`organizations/${slug}/suspend`, { method: 'POST', body: { reason } }).then((r) => r.organization)
export const reactivateOrganization = (slug: string) => platform<{ organization: Organization }>(`organizations/${slug}/reactivate`, { method: 'POST' }).then((r) => r.organization)
export const resendOwnerInvite = (slug: string) => platform<{ ok: true; sent: boolean }>(`organizations/${slug}/resend_invite`, { method: 'POST' })

export const listPlatformTeam = () => platform<{ users: PlatformUser[] }>('team').then((r) => r.users)
export const invitePlatformUser = (input: { name: string; email: string; username?: string; role: PlatformRole }) => platform<{ user: PlatformUser }>('team', { method: 'POST', body: input }).then((r) => r.user)
export const deactivatePlatformUser = (id: string) => platform<{ ok: true }>(`team/${id}/deactivate`, { method: 'POST' })
export const resendPlatformInvite = (id: string) => platform<{ ok: true }>(`team/${id}/resend_invite`, { method: 'POST' })
