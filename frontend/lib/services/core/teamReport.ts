import { coreFetch } from '@/lib/services/core/http'

// Plan Y5: horas y propinas por persona en un periodo, base para la nómina (contrato en el plan Y).
export interface TeamRow {
  account: { id: number | string; name: string; role: string }
  hours: number; shifts: number; orders: number; sales: number; tips: number
  hourly_rate: number | null; estimated_pay: number | null
}
export interface TeamReport { rows: TeamRow[]; totals: Partial<Omit<TeamRow, 'account' | 'hourly_rate'>> }
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
// El servidor manda el dinero como texto decimal; aquí se vuelve número.
const row = (r: TeamRow): TeamRow => ({ ...r, hours: Number(r.hours), sales: Number(r.sales), tips: Number(r.tips), hourly_rate: n(r.hourly_rate), estimated_pay: n(r.estimated_pay) })
export const teamReport = (p: { from: string; to: string; restaurant_id?: number | null }) => {
  const q = new URLSearchParams({ from: p.from, to: p.to, ...(p.restaurant_id ? { restaurant_id: String(p.restaurant_id) } : {}) })
  return coreFetch<TeamReport>(`reports/team?${q}`).then((r) => ({ rows: r.rows.map(row), totals: Object.fromEntries(Object.entries(r.totals ?? {}).map(([k, v]) => [k, Number(v)])) }))
}
