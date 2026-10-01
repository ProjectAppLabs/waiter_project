// Tablero de Inicio: qué atender ahora, qué platos se piden más y menos, y cuánto se espera vender el mes que viene.
// Todo son funciones puras sobre el historial que ya suma el servidor (`pos.config.waiter_sales_insights`).

export interface DailySales { date: string; total: number; orders: number }
export interface ProductSales { productId: number; templateId: number; name: string; qty: number; amount: number; prevQty: number }
export interface HourlySales { hour: number; total: number; orders: number }
export interface SalesHistory { today: string; windowDays: number; historyDays: number; daily: DailySales[]; hourly: HourlySales[]; products: ProductSales[] }

const DAY_MS = 86_400_000
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const at = (day: string) => new Date(`${day}T00:00:00`)
// Suma días de calendario (no 24 h fijas): segura aunque el navegador cruce un cambio de horario.
const addDays = (day: string, n: number) => { const d = at(day); d.setDate(d.getDate() + n); return iso(d) }
const daysBetween = (from: string, to: string) => Math.round((at(to).getTime() - at(from).getTime()) / DAY_MS)
const weekdayOf = (day: string) => (at(day).getDay() + 6) % 7 // 0 = lunes

// ------------------------------------------------------------------ visión general
// Inicio no muestra el turno (eso es Ventas): muestra cómo va la semana y el mes. Cada periodo en curso se compara con el
// anterior A LA MISMA ALTURA —lunes a hoy contra lunes al mismo día de la semana pasada; del 1 a hoy contra del 1 al mismo
// día del mes pasado—: comparar media semana contra una semana entera siempre daría «vas mal».
export interface PeriodKpi { value: number; previous: number; change: number | null } // change null = no había con qué comparar
export interface GeneralKpis { week: PeriodKpi; month: PeriodKpi; monthOrders: PeriodKpi; ticket: PeriodKpi }

export function generalKpis(history: SalesHistory): GeneralKpis {
  const today = at(history.today), day = (d: Date) => iso(d)
  const sum = (from: string, to: string, key: 'total' | 'orders') => history.daily.filter((d) => d.date >= from && d.date <= to).reduce((s, d) => s + d[key], 0)
  const kpi = (value: number, previous: number): PeriodKpi => ({ value, previous, change: previous > 0 ? (value - previous) / previous : null })
  const monday = new Date(today.getTime() - weekdayOf(history.today) * DAY_MS)
  const weekNow = sum(day(monday), history.today, 'total')
  const weekBefore = sum(day(new Date(monday.getTime() - 7 * DAY_MS)), day(new Date(today.getTime() - 7 * DAY_MS)), 'total')
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1), prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  // El 31 de un mes contra un mes de 30 días: se compara hasta el último día que ese mes tiene.
  const prevSameDay = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()))
  const back = (n: number) => day(new Date(today.getTime() - n * DAY_MS))
  const ticket = (from: string, to: string) => { const orders = sum(from, to, 'orders'); return orders ? sum(from, to, 'total') / orders : 0 }
  return {
    week: kpi(weekNow, weekBefore),
    month: kpi(sum(day(monthStart), history.today, 'total'), sum(day(prevStart), day(prevSameDay), 'total')),
    monthOrders: kpi(sum(day(monthStart), history.today, 'orders'), sum(day(prevStart), day(prevSameDay), 'orders')),
    ticket: kpi(ticket(back(27), history.today), ticket(back(55), back(28))),
  }
}

// Venta promedio de cada día de la semana (0 = lunes), contando como cero los días sin ventas desde la primera venta y
// sin contar hoy, que va a medias. Sirve para saber qué días reforzar el personal; es la misma base de la predicción.
export interface WeekdayAverage { weekday: number; total: number; orders: number; days: number }
export function weekdayAverages(history: SalesHistory): WeekdayAverage[] {
  const sold = history.daily.filter((d) => d.total > 0)
  const sums = Array.from({ length: 7 }, (_, weekday) => ({ weekday, total: 0, orders: 0, days: 0 }))
  if (!sold.length) return sums
  const first = sold[0].date, yesterday = iso(new Date(at(history.today).getTime() - DAY_MS))
  const byDay = new Map(history.daily.map((d) => [d.date, d]))
  for (let i = 0; i <= daysBetween(first, yesterday); i++) {
    const date = iso(new Date(at(first).getTime() + i * DAY_MS)), row = byDay.get(date), slot = sums[weekdayOf(date)]
    slot.total += row?.total ?? 0; slot.orders += row?.orders ?? 0; slot.days++
  }
  return sums.map((s) => ({ ...s, total: s.days ? s.total / s.days : 0, orders: s.days ? s.orders / s.days : 0 }))
}

// Horas del día con ventas en los últimos 28 días, con su parte del total: las horas pico.
export function peakHours(history: SalesHistory): { hour: number; share: number; orders: number }[] {
  const total = history.hourly.reduce((s, h) => s + h.total, 0)
  return total ? history.hourly.map((h) => ({ hour: h.hour, share: h.total / total, orders: h.orders })) : []
}

// ------------------------------------------------------------------ predicción
export const MIN_SALES_DAYS = 14 // con menos días vendidos la cifra sería un invento: se dice que falta historial
export interface Forecast {
  ready: boolean; salesDays: number        // días con ventas en el historial; `ready` = alcanzan para predecir
  month: string                            // primer día del mes predicho (ISO)
  total: number; low: number; high: number // venta esperada y un rango honesto
  orders: number
  trend: number                            // últimas 4 semanas frente a las 4 anteriores: 1.1 = +10 %
  weekly: { week: string; total: number }[] // ventas por semana del historial, para dibujarlas junto a la predicción
}

// Método, a propósito simple y explicable: un restaurante vende por día de la semana (un sábado no es un martes), así
// que cada día del mes siguiente se estima con el promedio de ese día de la semana en el historial —contando como cero
// los días sin ventas desde la primera venta, porque un martes cerrado también es información—. Se ajusta por la
// tendencia reciente, acotada a ±30 % para que un par de semanas atípicas no disparen la cifra. El rango sale de la
// variación real entre semanas. No es un modelo estadístico: es la cuenta que haría un buen administrador, hecha siempre.
export function forecastNextMonth(history: SalesHistory): Forecast {
  const today = at(history.today)
  const monthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const sold = history.daily.filter((d) => d.total > 0)
  const weekly = weeklyTotals(history)
  const empty: Forecast = { ready: false, salesDays: sold.length, month: iso(monthStart), total: 0, low: 0, high: 0, orders: 0, trend: 1, weekly }
  if (sold.length < MIN_SALES_DAYS) return empty

  // Ventana: desde la primera venta (o el tope del historial) hasta ayer; hoy va a medias y sesgaría a la baja.
  const first = sold[0].date, yesterday = iso(new Date(today.getTime() - DAY_MS))
  const span = daysBetween(first, yesterday) + 1
  if (span < MIN_SALES_DAYS) return empty
  const averages = weekdayAverages(history)
  const trend = trendOf(history, yesterday)
  let total = 0, orders = 0
  for (let i = 0; i < monthDays; i++) {
    const slot = averages[weekdayOf(iso(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 + i)))]
    total += slot.total; orders += slot.orders
  }
  total *= trend; orders *= trend
  const spread = Math.min(0.5, Math.max(0.1, weeklyVariation(weekly)))
  return { ready: true, salesDays: sold.length, month: iso(monthStart), total: Math.round(total), low: Math.round(total * (1 - spread)), high: Math.round(total * (1 + spread)),
    orders: Math.round(orders), trend, weekly }
}

function sumBetween(history: SalesHistory, from: string, to: string): number {
  return history.daily.filter((d) => d.date >= from && d.date <= to).reduce((sum, d) => sum + d.total, 0)
}
// Últimos 28 días frente a los 28 anteriores. Sin ventas en el tramo anterior no hay con qué comparar: tendencia neutra.
// Sin ventas en el tramo reciente sí la hay: cae hasta su tope (−30 %).
function trendOf(history: SalesHistory, yesterday: string): number {
  const back = (n: number) => iso(new Date(at(yesterday).getTime() - n * DAY_MS))
  const recent = sumBetween(history, back(27), yesterday), previous = sumBetween(history, back(55), back(28))
  return previous > 0 ? Math.min(1.3, Math.max(0.7, recent / previous)) : 1
}
// Semanas completas (lunes a domingo) del historial: sin la que está en curso y sin la primera si llega a medias. Una
// semana a medias parece una semana mala e infla la variación (y con ella el rango).
function weeklyTotals(history: SalesHistory): { week: string; total: number }[] {
  const mondayOf = (day: string) => iso(new Date(at(day).getTime() - weekdayOf(day) * DAY_MS))
  const current = mondayOf(history.today), totals = new Map<string, number>()
  // La semana de la primera venta registrada solo cuenta si esa venta fue un lunes: si no, llega incompleta (el local abrió
  // a mitad de semana o la ventana de 84 días la cortó). A un local que siempre cierra los lunes solo le cuesta una semana.
  const first = history.daily[0]?.date, partial = first && mondayOf(first) !== first ? mondayOf(first) : null
  // Toda semana completa desde la primera venta cuenta, aunque no haya vendido nada: una semana en cero es justo la
  // variación que el rango debe reflejar. Antes solo existían las semanas con ventas y una semana cerrada se perdía.
  if (first) for (let week = partial ? addDays(partial, 7) : mondayOf(first); week < current; week = addDays(week, 7)) totals.set(week, 0)
  for (const d of history.daily) { const week = mondayOf(d.date); if (totals.has(week)) totals.set(week, totals.get(week)! + d.total) }
  return [...totals.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, total]) => ({ week, total }))
}
// Coeficiente de variación entre semanas: cuánto se mueve de verdad la venta de una semana a otra.
function weeklyVariation(weekly: { total: number }[]): number {
  if (weekly.length < 2) return 0.3
  const mean = weekly.reduce((s, w) => s + w.total, 0) / weekly.length
  if (!mean) return 0.3
  return Math.sqrt(weekly.reduce((s, w) => s + (w.total - mean) ** 2, 0) / weekly.length) / mean
}

// ------------------------------------------------------------------ platos
export interface DishRank { productId: number; templateId: number; name: string; qty: number; amount: number; change: number | null; nextMonth: number }
export interface DishStats { top: DishRank[]; bottom: DishRank[]; totalQty: number }

// Más y menos pedidos de la ventana. Los menos pedidos salen de la CARTA VIGENTE (`menu`), para incluir los platos con
// cero ventas —que son justo los que hay que mirar— y dejar fuera los que ya se retiraron. `change`: variación frente a
// la ventana anterior (null si antes no se vendía). `nextMonth`: unidades esperadas el mes siguiente al ritmo actual.
export function dishStats(history: SalesHistory, menu: { id: number; templateId: number; name: string }[], size = 5): DishStats {
  const monthDays = (() => { const t = at(history.today); return new Date(t.getFullYear(), t.getMonth() + 2, 0).getDate() })()
  const rank = (p: ProductSales): DishRank => ({ productId: p.productId, templateId: p.templateId, name: p.name, qty: p.qty, amount: p.amount,
    change: p.prevQty > 0 ? (p.qty - p.prevQty) / p.prevQty : null, nextMonth: Math.round((p.qty / history.windowDays) * monthDays) })
  const sold = new Map(history.products.map((p) => [p.productId, p]))
  const top = history.products.filter((p) => p.qty > 0).slice().sort((a, b) => b.qty - a.qty).slice(0, size).map(rank)
  const topIds = new Set(top.map((d) => d.productId))
  const bottom = menu.filter((m) => !topIds.has(m.id))
    .map((m) => rank(sold.get(m.id) ?? { productId: m.id, templateId: m.templateId, name: m.name, qty: 0, amount: 0, prevQty: 0 }))
    // Entre los de menos ventas, primero los que antes sí se vendían: una caída es más urgente que un plato que nunca
    // arrancó, y con varios platos en cero el orden alfabético los dejaba fuera de la lista.
    .sort((a, b) => a.qty - b.qty || Number(b.change !== null) - Number(a.change !== null) || a.name.localeCompare(b.name)).slice(0, size)
  return { top, bottom, totalQty: history.products.reduce((s, p) => s + p.qty, 0) }
}

// ------------------------------------------------------------------ para atender
export type AttentionTone = 'danger' | 'warning' | 'info'
export type AttentionKind = 'accessDenied' | 'cashDifference' | 'ready' | 'reservationSoon' | 'depositPending' | 'stockEmpty' | 'stockLow' | 'soldOut' | 'stockEmptyMore' | 'stockLowMore' | 'soldOutMore'
export interface AttentionItem { key: string; kind: AttentionKind; tone: AttentionTone; href: string; values: Record<string, string | number> }

export interface AttentionInput {
  nowHour: number                                                                                   // hora local en decimales (19.5 = 19:30)
  ready: number                                                                                     // platos listos sin entregar
  reservations: { id: number; name: string; customer: string; timeStart: number; label: string; people: number; tables: string; depositPending: boolean }[] // de HOY, confirmadas
  ingredients: { id: number; name: string; level: 'empty' | 'low' | 'medium' | 'high' | null; stock: number; min: number; uom: string }[]
  soldOut: { id: number; name: string }[]
  // Plan P: intentos de entrada fuera de turno sin leer, con el texto que armó Odoo («Mateo intentó entrar a las 23:40…»).
  access?: { id: number; body: string }[]
  accessHref?: string
  // Plan Q3: cierres de caja que superaron la tolerancia («Caja de Poblado cerró con $ 12.000 de diferencia…»).
  cash?: { id: number; body: string }[]
  cashHref?: string
}
export const SOON_HOURS = 2
export const MAX_PER_GROUP = 3 // de cada tipo de aviso de inventario; el resto se resume en un renglón para no tapar lo demás

// Lo urgente primero: comida enfriándose, gente por llegar, lo que ya se acabó y, al final, lo que se está acabando.
// Una reserva «cerca» es la que empieza en las próximas dos horas (o empezó hace menos de media y aún no se sentó).
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = []
  // Alguien intentó entrar fuera de su turno: es seguridad, va antes que todo.
  for (const a of input.access ?? []) items.push({ key: `access-${a.id}`, kind: 'accessDenied', tone: 'danger', href: input.accessHref ?? '/dashboard', values: { body: a.body } })
  for (const c of input.cash ?? []) items.push({ key: `cash-${c.id}`, kind: 'cashDifference', tone: 'danger', href: input.cashHref ?? '/cuadres', values: { body: c.body } })
  if (input.ready > 0) items.push({ key: 'ready', kind: 'ready', tone: 'danger', href: '/pedidos', values: { count: input.ready } })
  for (const r of input.reservations.filter((x) => x.timeStart - input.nowHour <= SOON_HOURS && x.timeStart - input.nowHour > -0.5).sort((a, b) => a.timeStart - b.timeStart)) {
    const minutes = Math.round((r.timeStart - input.nowHour) * 60)
    items.push({ key: `res-${r.id}`, kind: 'reservationSoon', tone: minutes <= 30 ? 'danger' : 'warning', href: '/reservas',
      values: { customer: r.customer, time: r.label, people: r.people, tables: r.tables, minutes: Math.max(0, minutes), late: minutes < 0 ? 1 : 0 } })
    if (r.depositPending) items.push({ key: `dep-${r.id}`, kind: 'depositPending', tone: 'warning', href: '/reservas', values: { customer: r.customer, code: r.name } })
  }
  // Inventario: los más críticos de cada tipo y un resumen del resto. Veinte ingredientes bajos no pueden esconder la
  // reserva que llega en media hora.
  const group = <T,>(rows: T[], more: AttentionKind, tone: AttentionTone, item: (row: T) => AttentionItem) => {
    rows.slice(0, MAX_PER_GROUP).forEach((row) => items.push(item(row)))
    if (rows.length > MAX_PER_GROUP) items.push({ key: more, kind: more, tone, href: '/inventario', values: { count: rows.length - MAX_PER_GROUP } })
  }
  group(input.ingredients.filter((x) => x.level === 'empty'), 'stockEmptyMore', 'danger', (i) => ({ key: `empty-${i.id}`, kind: 'stockEmpty', tone: 'danger', href: '/inventario', values: { name: i.name } }))
  group(input.soldOut, 'soldOutMore', 'warning', (p) => ({ key: `out-${p.id}`, kind: 'soldOut', tone: 'warning', href: '/inventario', values: { name: p.name } }))
  group(input.ingredients.filter((x) => x.level === 'low').sort((a, b) => a.stock / (a.min || 1) - b.stock / (b.min || 1)), 'stockLowMore', 'warning',
    (i) => ({ key: `low-${i.id}`, kind: 'stockLow', tone: 'warning', href: '/inventario', values: { name: i.name, stock: Number(i.stock.toFixed(2)), min: i.min, uom: i.uom } }))
  return items
}
