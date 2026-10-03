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
  // Plan X: precios del cliente (lo que se aparta del estándar), los que se aplican y su saldo a favor.
  pricing?: ClientPricing; effective_pricing?: EffectivePricing; account_credit?: number
}
export interface OrganizationInput {
  name: string; slug: string; legal_name: string; tax_id: string; billing_email: string; billing_contact: string
  plan: string; monthly_price: number; max_restaurants: number; trial_ends: string | null; timezone: string
  owner: { name: string; email: string; username?: string }
  pricing?: ClientPricing
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

// Contrato M: métricas por cliente y cobro de la suscripción.
export interface OrgMetrics {
  slug: string; name: string; status: OrganizationStatus; plan: string; monthly_price: number; restaurants: number; restaurants_limit: number
  accounts_active: number; sales: number; orders: number; ticket: number; last_order_at: string | null; last_login_at: string | null; overdue_amount: number
}
export interface MetricsTotals { organizations: number; active: number; trial: number; suspended: number; mrr: number; sales: number; orders: number; restaurants: number }
export interface PlatformMetrics { totals: MetricsTotals; organizations: OrgMetrics[] }
export type ChargeState = 'pending' | 'paid' | 'overdue' | 'void'
export type ChargeMethod = 'transferencia' | 'nequi' | 'efectivo' | 'otro'
export interface Charge {
  kind?: 'mensualidad' | 'recarga'
  id: number; organization: { slug: string; name: string } | string; period: string; amount: number; due_date: string; state: ChargeState
  paid_at: string | null; method: ChargeMethod | '' | null; reference: string; notes: string; recorded_by?: { name: string } | null; created_at: string
  // Plan W: mensualidad por local y uso, línea por línea.
  lines?: ChargeLine[]
}
export interface ChargeLine { concept: string; module: string; unit: string; quantity: number; unit_price: number; total: number }
export interface ChargesSummary { pending: number; overdue: number; paid_this_month: number }
export interface BillingRules { billing_day: number; grace_days: number; suspend_after_days: number; reminder_days: number
  // Plan W: precio por unidad de uso, «módulo.unidad» (p. ej. «asistente_menu.mensaje_ia»).
  unit_prices?: Record<string, number> }

const qs = (p: Record<string, string | undefined>) => Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')
export const platformMetrics = (from: string, to: string) => platform<PlatformMetrics>(`metrics?${qs({ from, to })}`)
export const listCharges = (filters: { state?: string; period?: string } = {}) => platform<{ charges: Charge[]; summary: ChargesSummary }>(`charges?${qs(filters)}`)
export const organizationCharges = (slug: string) => platform<{ charges: Charge[]; summary: ChargesSummary }>(`organizations/${slug}/charges`)
export const createCharge = (slug: string, period: string, amount?: number) => platform<{ charge: Charge }>(`organizations/${slug}/charges`, { method: 'POST', body: { period, ...(amount !== undefined && { amount }) } })
export const payCharge = (id: number, body: { method: ChargeMethod; reference: string; notes: string; paid_at?: string }) => platform<{ charge: Charge }>(`charges/${id}/pay`, { method: 'POST', body })
export const voidCharge = (id: number, notes: string) => platform<{ charge: Charge }>(`charges/${id}/void`, { method: 'POST', body: { notes } })
export const billingRules = () => platform<BillingRules>('settings/billing')
export const saveBillingRules = (patch: Partial<BillingRules>) => platform<BillingRules>('settings/billing', { method: 'PATCH', body: patch })
export const chargeOrg = (c: Charge) => (typeof c.organization === 'string' ? { slug: c.organization, name: c.organization } : c.organization)

// Plan W: módulos de una organización (contrato en docs/planes/2026-10-03-plan-W-modularizacion.md).
export type ModuleSource = 'plan' | 'organization' | 'restaurant'
export interface ModuleState { key: string; active: boolean; source: ModuleSource; starts: string | null; ends: string | null; limits: Record<string, number> | null; price: number | null; notes: string }
export interface CatalogModule { key: string; name: string; depends: string[]; depends_any?: string[]; units: string[]; required: boolean; available: boolean }
export interface OrganizationModules {
  plan: string; plans: { key: string; name: string }[]; catalog: CatalogModule[]
  organization: ModuleState[]; restaurants: { id: number; name: string; modules: ModuleState[] }[]
}
export type ModuleChange = { plan: string } | { key: string; active: boolean; restaurant_id: number | null; ends?: string | null; limits?: Record<string, number> | null; price?: number | null; notes?: string }
  | { key: string; restaurant_id: number | null; clear: true }
export const organizationModules = (slug: string) => platform<OrganizationModules>(`organizations/${slug}/modules`)
export const changeOrganizationModules = (slug: string, change: ModuleChange) => platform<OrganizationModules>(`organizations/${slug}/modules`, { method: 'PATCH', body: change })

export interface UsageRow { module: string; module_name: string; unit: string; unit_name: string; quantity: number; restaurant_id: number | null; restaurant_name: string | null }
export interface OrganizationUsage { period: string; rows: UsageRow[]; totals: { module: string; unit: string; quantity: number }[] }
export const organizationUsage = (slug: string, period: string) => platform<OrganizationUsage>(`organizations/${slug}/usage?${qs({ period })}`)

// Plan X: lista de precios estándar y precios de cada cliente (contrato en
// docs/planes/2026-10-03-plan-X-precios-recargas-prorrateo.md).
export type OnExhausted = 'cobrar' | 'bloquear'
export interface WhatsappPlan { key: string; name: string; monthly_price: number; included: Record<string, number> }
export interface RechargePack { key: string; name: string; module: string; unit: string; quantity: number; price: number }
export interface PriceBook {
  local_monthly: number; modules: Record<string, number>; unit_prices: Record<string, number>
  whatsapp_plans: WhatsappPlan[]; recharge_packs: RechargePack[]; on_exhausted: OnExhausted
}
export interface ClientPricing {
  mode: 'estandar' | 'personalizado'
  local_monthly?: number; unit_prices?: Record<string, number>; modules?: Record<string, number>
  whatsapp_plan?: string | null; whatsapp?: { monthly_price: number; included: Record<string, number> } | null
  recharge_packs?: RechargePack[]; on_exhausted?: OnExhausted
}
export type EffectivePricing = PriceBook & { whatsapp_plan: string | null }
export const priceBook = () => platform<PriceBook>('settings/pricing')
export const savePriceBook = (patch: Partial<PriceBook>) => platform<PriceBook>('settings/pricing', { method: 'PATCH', body: patch })

export interface CreditBalance { module: string; unit: string; unit_name: string; balance: number }
export interface CreditMovement { id: number; at: string; kind: 'recarga' | 'cortesia' | 'consumo'; module: string; unit: string; quantity: number; amount: number | null; reference: string; actor: { name: string } | null }
export interface OrganizationCredits { balances: CreditBalance[]; movements: CreditMovement[] }
export const organizationCredits = (slug: string) => platform<OrganizationCredits>(`organizations/${slug}/credits`)
export const grantCredits = (slug: string, body: { module: string; unit: string; quantity: number; reason: string }) =>
  platform<OrganizationCredits>(`organizations/${slug}/credits`, { method: 'POST', body })
