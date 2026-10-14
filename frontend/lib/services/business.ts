import * as coreBusiness from '@/lib/services/core/business'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as core from '@/lib/services/core/sales'
import { toCashClosing } from '@/lib/services/core/salesBridge'

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
  const r = await coreBusiness.summary<RawSummary>(dateFrom, dateTo)
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
export async function cashClosings(dateFrom: string, dateTo: string, configIds: number[] | null = null, onlyDifferences = false): Promise<CashClosing[]> {
  return (await core.cashClosings(dateFrom, dateTo, configIds, onlyDifferences)).closings.map(toCashClosing)
}
// Sin argumento solo lee; con un valor lo guarda (solo el dueño).
export async function cashSettings(tolerance?: number): Promise<{ tolerance: number; currency: string }> {
  if (tolerance !== undefined) return { ...(await core.setCashTolerance(tolerance)), currency: 'COP' }
  const r = currentRestaurantId()
  return { tolerance: r === null ? 0 : (await core.getSettings(r)).cash_tolerance ?? 0, currency: 'COP' }
}

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog'
export interface DishProfit {
  templateId: number; name: string; category: string; price: number; cost: number | null; margin: number | null; foodCostPct: number | null
  units: number; revenue: number; grossProfit: number | null; menuClass: MenuClass | null
}
export interface Profitability { currency: string; configId: number | null; dateFrom: string; dateTo: string; thresholds: { popularityUnits: number; margin: number }; rows: DishProfit[] }
type RawProfit = {
  currency: string; config_id: number | null | false; date_from: string; date_to: string; thresholds: { popularity_units: number; margin: number }
  rows: {
    template_id: number; name: string; category: string | false; price: number; cost: number | null; margin: number | null; food_cost_pct: number | null
    units: number; revenue: number; gross_profit: number | null; class: MenuClass | null
  }[]
}
export async function profitability(dateFrom: string, dateTo: string, configId: number | null): Promise<Profitability> {
  const r = await coreBusiness.profitability<RawProfit>(dateFrom, dateTo, configId)
  return {
    currency: r.currency, configId: r.config_id || null, dateFrom: r.date_from, dateTo: r.date_to,
    thresholds: { popularityUnits: r.thresholds.popularity_units, margin: r.thresholds.margin },
    rows: r.rows.map((x) => ({
      templateId: x.template_id, name: x.name, category: x.category || '', price: x.price, cost: x.cost, margin: x.margin,
      foodCostPct: x.food_cost_pct, units: x.units, revenue: x.revenue, grossProfit: x.gross_profit, menuClass: x.class
    })),
  }
}
