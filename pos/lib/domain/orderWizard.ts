import { uuid } from '@/lib/domain/uuid'
import type { Product } from '@/lib/types'

export type OrderType = 'dineIn' | 'takeAway' | 'delivery'
export const ORDER_TYPES: OrderType[] = ['dineIn', 'takeAway', 'delivery']
export const TYPE_PREFIX: Record<OrderType, string> = { dineIn: 'DI', takeAway: 'TA', delivery: 'DE' }

export type WizardStep = 'customer' | 'table' | 'menu' | 'summary' | 'payment'
// En mesa elige mesa y va a cocina; para llevar y domicilio cobran antes de cocina (kit: Take Away / Pay.png).
export function stepsFor(type: OrderType): WizardStep[] {
  return type === 'dineIn' ? ['customer', 'table', 'menu', 'summary'] : ['customer', 'menu', 'summary', 'payment']
}

export interface CustomerInfo { type: OrderType; people: number; babyChair: boolean; name: string; address: string; phone: string }
export const DEFAULT_INFO: CustomerInfo = { type: 'dineIn', people: 2, babyChair: false, name: '', address: '', phone: '' }

export function customerInfoValid(info: CustomerInfo): boolean {
  if (info.people < 1) return false
  if (info.type === 'delivery') return info.name.trim() !== '' && info.address.trim() !== '' && info.phone.trim() !== ''
  return true
}

// Grupos de adiciones del modal "Add Order": atributos con price_extra (obligatorio, una opción) y combos (opcional, varias).
export type OptionKind = 'attribute' | 'combo'
export interface OptionChoice { id: number; name: string; priceExtra: number; kind: OptionKind; groupId: number; productId: number | null; taxIds: number[] }
export interface OptionGroup { id: number; name: string; kind: OptionKind; required: boolean; multiple: boolean; choices: OptionChoice[] }

export function toggleChoice(groups: OptionGroup[], chosen: OptionChoice[], choice: OptionChoice): OptionChoice[] {
  const group = groups.find((g) => g.id === choice.groupId && g.kind === choice.kind)
  const already = chosen.some((c) => c.id === choice.id && c.kind === choice.kind)
  if (group?.multiple) return already ? chosen.filter((c) => !(c.id === choice.id && c.kind === choice.kind)) : [...chosen, choice]
  const rest = chosen.filter((c) => !(c.groupId === choice.groupId && c.kind === choice.kind))
  return already ? rest : [...rest, choice]
}

// "Add to Cart" solo se habilita con todos los grupos obligatorios elegidos.
export function selectionComplete(groups: OptionGroup[], chosen: OptionChoice[]): boolean {
  return groups.filter((g) => g.required).every((g) => chosen.some((c) => c.groupId === g.id && c.kind === g.kind))
}

export interface CartLine { uuid: string; productId: number; templateId: number; name: string; unitPrice: number; qty: number; note: string; taxIds: number[]; options: OptionChoice[]; hasImage: boolean }

export function newLine(product: Product, qty: number, note: string, options: OptionChoice[]): CartLine {
  return { uuid: uuid(), productId: product.id, templateId: product.templateId, name: product.name, unitPrice: product.price, qty, note, taxIds: product.taxIds, options, hasImage: product.hasImage }
}

const optionKey = (options: OptionChoice[]) => options.map((o) => `${o.kind}:${o.id}`).sort().join('|')
const sameLine = (a: CartLine, b: CartLine) => a.productId === b.productId && a.note === b.note && optionKey(a.options) === optionKey(b.options)

// Mismo plato, mismas adiciones y misma nota: se suma la cantidad; si no, es otra línea.
export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const existing = lines.find((l) => sameLine(l, line))
  return existing ? lines.map((l) => (l === existing ? { ...l, qty: l.qty + line.qty } : l)) : [...lines, line]
}
export function setLineQty(lines: CartLine[], lineUuid: string, qty: number): CartLine[] {
  return qty <= 0 ? lines.filter((l) => l.uuid !== lineUuid) : lines.map((l) => (l.uuid === lineUuid ? { ...l, qty } : l))
}
export function replaceLine(lines: CartLine[], lineUuid: string, patch: Pick<CartLine, 'qty' | 'note' | 'options'>): CartLine[] {
  return lines.map((l) => (l.uuid === lineUuid ? { ...l, ...patch } : l))
}

export const extrasOf = (line: CartLine) => line.options.reduce((a, o) => a + o.priceExtra, 0)
export const lineUnitPrice = (line: CartLine) => line.unitPrice + extrasOf(line)
export const lineSubtotal = (line: CartLine) => lineUnitPrice(line) * line.qty
export const itemCount = (lines: CartLine[]) => lines.reduce((a, l) => a + l.qty, 0)
export const additionNames = (line: CartLine) => line.options.map((o) => o.name).join(', ')
export const fullProductName = (line: CartLine) => (line.options.length ? `${line.name} (${additionNames(line)})` : line.name)

// Impuestos reales de account.tax (porcentaje o fijo, incluido o no en el precio). Sin "12 %" inventado.
export interface TaxRate { id: number; name: string; amount: number; amountType: 'percent' | 'fixed' | 'division' | 'group'; priceInclude: boolean }
export interface CartTotals { subtotal: number; tax: number; total: number; taxNames: string[] }

function lineTax(line: CartLine, taxes: TaxRate[]): { tax: number; included: number } {
  const gross = lineSubtotal(line)
  let tax = 0
  let included = 0
  for (const id of line.taxIds) {
    const rate = taxes.find((t) => t.id === id)
    if (!rate) continue
    if (rate.amountType === 'fixed') { tax += rate.amount * line.qty; continue }
    if (rate.amountType !== 'percent') continue
    if (rate.priceInclude) { const part = gross - gross / (1 + rate.amount / 100); tax += part; included += part } else tax += (gross * rate.amount) / 100
  }
  return { tax, included }
}

export function cartTotals(lines: CartLine[], taxes: TaxRate[]): CartTotals {
  let subtotal = 0
  let tax = 0
  for (const line of lines) {
    const { tax: t, included } = lineTax(line, taxes)
    subtotal += lineSubtotal(line) - included
    tax += t
  }
  const names = [...new Set(lines.flatMap((l) => l.taxIds).map((id) => taxes.find((t) => t.id === id)?.name).filter((n): n is string => Boolean(n)))]
  return { subtotal: Math.round(subtotal), tax: Math.round(tax), total: Math.round(subtotal + tax), taxNames: names }
}

// La nota del pedido incluye silla de bebé y datos de domicilio para cocina.
export function orderNote(info: CustomerInfo, labels: { babyChair: string; delivery: (address: string, phone: string) => string }): string {
  const parts: string[] = []
  if (info.babyChair) parts.push(labels.babyChair)
  if (info.type === 'delivery') parts.push(labels.delivery(info.address.trim(), info.phone.trim()))
  return parts.join(' ')
}

export interface KitOrderPayload {
  uuid: string; type: OrderType; tableId: number | null; name: string; people: number; note: string
}


export function toKitPayload(args: { uuid: string; tableId: number | null; info: CustomerInfo; note: string }): KitOrderPayload {
  return { uuid: args.uuid, type: args.info.type, tableId: args.info.type === 'dineIn' ? args.tableId : null,
    name: args.info.name.trim(), people: args.info.people, note: args.note }
}

export function displayReference(type: OrderType, trackingNumber: string | number): string {
  const digits = String(trackingNumber).replace(/\D/g, '') || '0'
  return `${TYPE_PREFIX[type]}${digits.padStart(3, '0')}`
}
