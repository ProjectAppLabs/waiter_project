import { onCore } from '@/lib/domain/backend'
import * as core from '@/lib/services/core/sales'
import { toCashClosing } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { callKw } from '@/lib/services/odoo'

// Plan Q: lo del negocio que calcula Odoo (projectapp_ops ≥ 19.0.2.7.0, projectapp_pantry ≥ 19.0.2.6.0). Las fechas van
// como 'YYYY-MM-DD' inclusivas, en la zona de la empresa. Ver el contrato en docs/planes/2026-10-01-plan-Q-negocio-del-dueno.md.

export interface SummaryFigures { sales: number; orders: number; ticket: number; guests: number; tips: number }
export interface SummaryRow extends SummaryFigures { configId: number; name: string; previous: SummaryFigures }
export interface OrgSummary {
  currency: string; dateFrom: string; dateTo: string; previousFrom: string; previousTo: string
  restaurants: SummaryRow[]; total: SummaryFigures & { previous: SummaryFigures }
}
type RawFigures = SummaryFigures
type RawSummary = {
  currency: string; date_from: string; date_to: string; previous_from: string; previous_to: string
  restaurants: (RawFigures & { config_id: number; name: string; previous: RawFigures })[]; total: RawFigures & { previous: RawFigures }
}
const figures = (r: RawFigures): SummaryFigures => ({ sales: r.sales, orders: r.orders, ticket: r.ticket, guests: r.guests, tips: r.tips })

export async function orgSummary(dateFrom: string, dateTo: string): Promise<OrgSummary> {
  const r = await callKw<RawSummary>('pos.config', 'waiter_org_summary', [dateFrom, dateTo])
  return {
    currency: r.currency, dateFrom: r.date_from, dateTo: r.date_to, previousFrom: r.previous_from, previousTo: r.previous_to,
    restaurants: r.restaurants.map((x) => ({ ...figures(x), configId: x.config_id, name: x.name, previous: figures(x.previous) })),
    total: { ...figures(r.total), previous: figures(r.total.previous) },
  }
}

export interface CashClosing {
  sessionId: number; name: string; configId: number; configName: string; closedAt: string
  closedBy: { userId: number; name: string } | null; expected: number; counted: number; difference: number; notes: string; overTolerance: boolean
}
type RawClosing = {
  session_id: number; name: string; config_id: number; config_name: string; closed_at: string
  closed_by: { user_id: number; name: string } | false | null; expected: number; counted: number; difference: number; notes: string | false; over_tolerance: boolean
}
export async function cashClosings(dateFrom: string, dateTo: string, configIds: number[] | null = null, onlyDifferences = false): Promise<CashClosing[]> {
  if (onCore()) return (await core.cashClosings(dateFrom, dateTo, configIds, onlyDifferences)).closings.map(toCashClosing)
  const rows = await callKw<RawClosing[]>('pos.session', 'waiter_cash_closings', [dateFrom, dateTo, configIds, onlyDifferences])
  return rows.map((r) => ({
    sessionId: r.session_id, name: r.name, configId: r.config_id, configName: r.config_name, closedAt: r.closed_at,
    closedBy: r.closed_by ? { userId: r.closed_by.user_id, name: r.closed_by.name } : null,
    expected: r.expected, counted: r.counted, difference: r.difference, notes: r.notes || '', overTolerance: r.over_tolerance,
  }))
}
// Sin argumento solo lee; con un valor lo guarda (solo el dueño).
export async function cashSettings(tolerance?: number): Promise<{ tolerance: number; currency: string }> {
  if (onCore()) {
    if (tolerance !== undefined) return { ...(await core.setCashTolerance(tolerance)), currency: 'COP' }
    const r = currentRestaurantId()
    return { tolerance: r === null ? 0 : (await core.getSettings(r)).cash_tolerance ?? 0, currency: 'COP' }
  }
  return callKw<{ tolerance: number; currency: string }>('res.company', 'waiter_cash_settings', [], tolerance === undefined ? {} : { tolerance })
}

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog'
export interface DishProfit {
  templateId: number; name: string; category: string; price: number; cost: number | null; margin: number | null; foodCostPct: number | null
  units: number; revenue: number; grossProfit: number | null; menuClass: MenuClass | null
}
export interface Profitability { currency: string; configId: number | null; dateFrom: string; dateTo: string; thresholds: { popularityUnits: number; margin: number }; rows: DishProfit[] }
type RawProfit = {
  currency: string; config_id: number | null | false; date_from: string; date_to: string; thresholds: { popularity_units: number; margin: number }
  rows: { template_id: number; name: string; category: string | false; price: number; cost: number | null; margin: number | null; food_cost_pct: number | null
    units: number; revenue: number; gross_profit: number | null; class: MenuClass | null }[]
}
export async function profitability(dateFrom: string, dateTo: string, configId: number | null): Promise<Profitability> {
  const r = await callKw<RawProfit>('product.template', 'waiter_profitability', [dateFrom, dateTo], { config_id: configId })
  return {
    currency: r.currency, configId: r.config_id || null, dateFrom: r.date_from, dateTo: r.date_to,
    thresholds: { popularityUnits: r.thresholds.popularity_units, margin: r.thresholds.margin },
    rows: r.rows.map((x) => ({ templateId: x.template_id, name: x.name, category: x.category || '', price: x.price, cost: x.cost, margin: x.margin,
      foodCostPct: x.food_cost_pct, units: x.units, revenue: x.revenue, grossProfit: x.gross_profit, menuClass: x.class })),
  }
}
