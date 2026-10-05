import { currentOrg } from '@/lib/domain/tenant'
import * as coreBusiness from '@/lib/services/core/business'
import * as coreCatalog from '@/lib/services/core/catalog'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as sales from '@/lib/services/core/sales'
import * as coreTables from '@/lib/services/core/tables'
import type { Settings } from '@/lib/types'

export interface CompanyInfo { id: number; name: string; vat: string; phone: string; email: string; street: string; city: string }
export interface FloorInfo { id: number; name: string; tables: { id: number; number: number; seats: number; active: boolean }[] }
export interface PaymentMethodInfo { id: number; name: string; type: string }
export interface TaxInfo { id: number; name: string; amount: number }

export async function getCompany(): Promise<CompanyInfo> {
  // Plan T4: en el sistema propio la empresa es la organización, con sus datos de emisor.
  const c = await coreBusiness.company()
  return { id: 0, name: c.legal_name || c.name, vat: c.tax_id ? `${c.tax_id}${c.tax_id_dv ? '-' + c.tax_id_dv : ''}` : '', phone: c.phone, email: c.email, street: c.address, city: c.city }
}

export async function saveCompany(c: CompanyInfo): Promise<void> {
  const [nit, dv] = c.vat.split('-')
  await coreBusiness.saveCompany({ legal_name: c.name, tax_id: (nit ?? '').replace(/\D/g, ''), tax_id_dv: (dv ?? '').replace(/\D/g, ''), phone: c.phone, email: c.email, address: c.street, city: c.city })
  return
}

export type BrandRadius = '' | '4' | '14' | '24'
export interface BrandInfo { companyId: number; color: string; font: string; radius: BrandRadius; tagline: string; greeting: string; waiterName: string; welcome: string; hasLogo: boolean }
export type LogoChange = { base64: string } | { remove: true }

export async function getBrand(): Promise<BrandInfo> {
  const b = await coreBusiness.brand()
  return { companyId: 0, color: b.color, font: b.font, radius: (b.radius || '') as BrandRadius, tagline: b.tagline, greeting: b.greeting, waiterName: b.waiter_name, welcome: b.welcome, hasLogo: b.has_logo }
}

export async function getBrandLogo(companyId: number): Promise<string | null> {
  void companyId
  const response = await fetch(`/experience/api/pos/v1/brand/logo?org=${currentOrg()}`)
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function saveBrand(b: BrandInfo, logo?: LogoChange): Promise<void> {
  await coreBusiness.saveBrand({
    color: b.color.trim().toUpperCase(), font: b.font, radius: b.radius, tagline: b.tagline.trim(),
    greeting: b.greeting.trim(), waiter_name: b.waiterName.trim(), welcome: b.welcome.trim(),
    ...(logo && { logo: 'remove' in logo ? null : logo.base64 }),
  })
}

export async function saveBrandGreeting(greeting: string): Promise<void> {
  await coreBusiness.saveBrand({ greeting: greeting.trim() })
  return
}

export async function saveBrandLogo(logo: LogoChange): Promise<void> {
  await coreBusiness.saveBrand({ logo: 'remove' in logo ? null : logo.base64 })
  return
}

export async function listFloors(): Promise<FloorInfo[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await coreTables.listFloors(r, true)).map((f) => ({ id: f.id, name: f.name, tables: f.tables.map((t) => ({ id: t.id, number: t.number, seats: t.seats, active: t.active })) }))
}

export async function saveFloor(id: number | null, name: string, configId: number): Promise<number> {
  if (id === null) return (await coreTables.createFloor(configId, name)).id
  await coreTables.patchFloor(id, { name })
  return id
}

export async function saveTable(id: number | null, floorId: number, t: { number: number; seats: number; active: boolean }): Promise<number> {
  // Sin editor de plano a mano: la mesa entra o cambia dentro del plano del piso.
  const plan = await coreTables.readPlan(floorId)
  const tables = plan.tables.filter((x) => x.id !== id || t.active)
  const found = tables.find((x) => x.id === id)
  if (found) { found.number = t.number; found.seats = t.seats }
  else if (id === null && t.active) tables.push({ id: null, key: `n${Date.now()}`, number: t.number, seats: t.seats, zone: '', x: 20 + (t.number % 5) * 120, y: 20 + Math.floor(t.number / 5) * 120, width: 100, height: 100 })
  const saved = await coreTables.savePlan(floorId, { ...plan, tables, background: true })
  return id ?? saved.tables.find((x) => x.number === t.number)?.id ?? 0
}

export async function listPaymentMethods(): Promise<PaymentMethodInfo[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await sales.listMethods(r)).map((m) => ({ id: m.id, name: m.name, type: m.type }))
}

export async function listTaxes(): Promise<TaxInfo[]> {
  return (await coreCatalog.listTaxes()).taxes.map((t) => ({ id: t.id, name: t.name, amount: t.amount }))
}

export async function saveSettings(s: Settings): Promise<void> {
  await sales.patchSettings(s.configId, { alert_late_minutes: s.alertLateMinutes, alert_bill_minutes: s.alertBillMinutes, roi_hour_cost: s.roiHourCost, roi_minutes_per_order: s.roiMinutesPerOrder, roi_baseline_hours_per_100: s.roiBaselineHoursPer100, roi_monthly_cost: s.roiMonthlyCost, roi_start_date: s.roiStartDate || null })
  return
}
