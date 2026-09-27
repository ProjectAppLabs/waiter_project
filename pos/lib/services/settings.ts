import { callKw } from '@/lib/services/odoo'
import type { Role } from '@/lib/domain/roles'
import type { Settings } from '@/lib/types'

export interface CompanyInfo { id: number; name: string; vat: string; phone: string; email: string; street: string; city: string; waiter_latitude?: string; waiter_longitude?: string }
export interface FloorInfo { id: number; name: string; tables: { id: number; number: number; seats: number; active: boolean }[] }
export interface UserInfo { id: number; name: string; login: string; lastLogin: string | null; role: Role; activated: boolean }
export interface PaymentMethodInfo { id: number; name: string; type: string }
export interface TaxInfo { id: number; name: string; amount: number }

interface RawCompany { id: number; name: string; vat: string | false; phone: string | false; email: string | false; street: string | false; city: string | false; waiter_latitude?: string | false; waiter_longitude?: string | false }
interface RawFloor { id: number; name: string; table_ids: number[] }
interface RawTable { id: number; table_number: number; seats: number; active: boolean; floor_id: [number, string] }

export async function getCompany(): Promise<CompanyInfo> {
  const [c] = await callKw<RawCompany[]>('res.company', 'search_read', [[], ['name', 'vat', 'phone', 'email', 'street', 'city', 'waiter_latitude', 'waiter_longitude']], { limit: 1 })
  return { id: c.id, name: c.name, vat: c.vat || '', phone: c.phone || '', email: c.email || '', street: c.street || '', city: c.city || '', waiter_latitude: c.waiter_latitude || '', waiter_longitude: c.waiter_longitude || '' }
}

export async function saveCompany(c: CompanyInfo): Promise<void> {
  await callKw('res.company', 'write', [[c.id], { name: c.name, vat: c.vat || false, phone: c.phone || false, email: c.email || false, street: c.street || false, city: c.city || false, waiter_latitude: c.waiter_latitude?.trim() || false, waiter_longitude: c.waiter_longitude?.trim() || false }])
}

// Marca del comensal (Configuración › Marca). Vacío en Odoo significa "usar lo del registro", así que los
// strings vacíos viajan como false y los false vuelven como ''. El nombre del restaurante es res.company.name.
export type BrandRadius = '' | '4' | '14' | '24'
export interface BrandInfo { companyId: number; color: string; font: string; radius: BrandRadius; tagline: string; greeting: string; waiterName: string; welcome: string; hasLogo: boolean }
export type LogoChange = { base64: string } | { remove: true }
interface RawBrand { id: number; brand_color: string | false; brand_font: string | false; brand_radius: BrandRadius | false; brand_tagline: string | false; brand_greeting: string | false; brand_waiter_name: string | false; brand_welcome: string | false; brand_logo: string | number | false }
const BRAND_FIELDS = ['brand_color', 'brand_font', 'brand_radius', 'brand_tagline', 'brand_greeting', 'brand_waiter_name', 'brand_welcome', 'brand_logo']

// bin_size: Odoo devuelve el tamaño del binario en vez del base64; solo hace falta saber si hay logo.
export async function getBrand(): Promise<BrandInfo> {
  const [c] = await callKw<RawBrand[]>('res.company', 'search_read', [[], BRAND_FIELDS], { limit: 1, context: { bin_size: true } })
  return {
    companyId: c.id, color: c.brand_color || '', font: c.brand_font || '', radius: c.brand_radius || '', tagline: c.brand_tagline || '',
    greeting: c.brand_greeting || '', waiterName: c.brand_waiter_name || '', welcome: c.brand_welcome || '', hasLogo: Boolean(c.brand_logo),
  }
}

export async function getBrandLogo(companyId: number): Promise<string | null> {
  const [c] = await callKw<{ id: number; brand_logo: string | false }[]>('res.company', 'read', [[companyId], ['brand_logo']])
  return c?.brand_logo || null
}

// logo: base64 si se subió uno nuevo, remove si se quita; undefined no toca el campo.
// Se escribe por write_brand(vals) del addon (no por write): es el que exige el grupo de gerente del POS, admite solo
// la lista cerrada de campos brand_* y recorta los textos. Aquí se recorta igual para que lo que ve la vista previa
// sea lo que queda guardado, y el vacío viaja como false ("usar lo del registro").
export async function saveBrand(b: BrandInfo, logo?: LogoChange): Promise<void> {
  const text = (value: string): string | false => value.trim() || false
  const color = b.color.trim()
  const values: Record<string, string | false> = {
    brand_color: color ? color.toUpperCase() : false, brand_font: b.font || false, brand_radius: b.radius || false, brand_tagline: text(b.tagline),
    brand_greeting: text(b.greeting), brand_waiter_name: text(b.waiterName), brand_welcome: text(b.welcome),
  }
  if (logo) values.brand_logo = 'remove' in logo ? false : logo.base64
  await callKw('res.company', 'write_brand', [values])
}

// Saludo de la cabecera del menú (Configuración › Diseño del menú). Solo toca ese campo: colores, fuente y logo siguen intactos.
// Por write_brand, como saveBrand: `res.company.write` exige un permiso (base.group_erp_manager) que el administrador del
// POS no tiene, así que con su usuario fallaba. write_brand escribe en la compañía de quien llama.
export async function saveBrandGreeting(greeting: string): Promise<void> {
  await callKw('res.company', 'write_brand', [{ brand_greeting: greeting.trim() || false }])
}

export async function saveBrandLogo(logo: LogoChange): Promise<void> {
  await callKw('res.company', 'write_brand', [{ brand_logo: 'remove' in logo ? false : logo.base64 }])
}

export async function listFloors(): Promise<FloorInfo[]> {
  const [floors, tables] = await Promise.all([
    callKw<RawFloor[]>('restaurant.floor', 'search_read', [[], ['name', 'table_ids']], { order: 'sequence asc, id asc' }),
    callKw<RawTable[]>('restaurant.table', 'search_read', [[['active', 'in', [true, false]]], ['table_number', 'seats', 'active', 'floor_id']], { order: 'table_number asc' }),
  ])
  return floors.map((f) => ({ id: f.id, name: f.name, tables: tables.filter((t) => t.floor_id[0] === f.id).map((t) => ({ id: t.id, number: t.table_number, seats: t.seats, active: t.active })) }))
}

export async function saveFloor(id: number | null, name: string, configId: number): Promise<number> {
  if (id === null) return callKw<number>('restaurant.floor', 'create', [{ name, pos_config_ids: [[4, configId]] }])
  await callKw('restaurant.floor', 'write', [[id], { name }])
  return id
}

export async function saveTable(id: number | null, floorId: number, t: { number: number; seats: number; active: boolean }): Promise<number> {
  const values = { table_number: t.number, seats: t.seats, active: t.active, floor_id: floorId }
  if (id === null) return callKw<number>('restaurant.table', 'create', [{ ...values, position_h: 20 + (t.number % 5) * 120, position_v: 20 + Math.floor(t.number / 5) * 120 }])
  await callKw('restaurant.table', 'write', [[id], values])
  return id
}

export async function listPaymentMethods(): Promise<PaymentMethodInfo[]> {
  return callKw<PaymentMethodInfo[]>('pos.payment.method', 'search_read', [[], ['name', 'type']], { order: 'sequence asc, id asc' })
}

export async function listTaxes(): Promise<TaxInfo[]> {
  return callKw<TaxInfo[]>('account.tax', 'search_read', [[['type_tax_use', '=', 'sale']], ['name', 'amount']], { order: 'amount desc' })
}

export async function listUsers(): Promise<UserInfo[]> {
  const rows = await callKw<{ id: number; name: string; login: string; login_date: string | false; waiter_role: Role | false; waiter_activated: boolean }[]>('res.users', 'search_read', [[['share', '=', false]], ['name', 'login', 'login_date', 'waiter_role', 'waiter_activated']], { order: 'name asc' })
  return rows.map((r) => ({ id: r.id, name: r.name, login: r.login, lastLogin: r.login_date || null, role: r.waiter_role || 'waiter', activated: r.waiter_activated || Boolean(r.login_date) }))
}

// El administrador invita por correo: el usuario recibe un código y elige su contraseña en el login.
export async function inviteUser(u: { name: string; email: string; role: Role }): Promise<number> {
  const id = await callKw<number>('res.users', 'create', [{ name: u.name, login: u.email.trim().toLowerCase(), email: u.email.trim().toLowerCase(), waiter_role: u.role }])
  await callKw('res.users', 'send_waiter_invite', [[id]])
  return id
}

export async function resendInvite(id: number): Promise<void> {
  await callKw('res.users', 'send_waiter_invite', [[id]])
}

// Solo para contratos: el administrador obtiene el código sin enviar correo.
export async function inviteCodeDryRun(id: number): Promise<string> {
  return callKw<string>('res.users', 'send_waiter_invite', [[id]], { dry_run: true })
}

// Cambiar el rol reasigna los grupos de Odoo (lo hace el addon).
export async function setUserRole(id: number, role: Role): Promise<void> {
  await callKw('res.users', 'write', [[id], { waiter_role: role }])
}

export async function saveSettings(s: Settings): Promise<void> {
  await callKw('pos.config', 'write', [[s.configId], {
    waiter_can_charge: s.waiterCanCharge, waiter_can_edit_inventory: s.waiterCanEditInventory, alert_late_minutes: s.alertLateMinutes, alert_bill_minutes: s.alertBillMinutes, roi_hour_cost: s.roiHourCost, roi_minutes_per_order: s.roiMinutesPerOrder,
    roi_baseline_hours_per_100: s.roiBaselineHoursPer100, roi_monthly_cost: s.roiMonthlyCost, roi_start_date: s.roiStartDate || false,
  }])
}
