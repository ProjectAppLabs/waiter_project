'use client'

import { useEffect, useState } from 'react'

import { PeriodPicker } from '@/components/business/PeriodPicker'
import { Chip } from '@/components/kit/Chip'
import { ExportMenu } from '@/components/kit/ExportMenu'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { presetSpan, type DateSpan } from '@/lib/domain/business'
import { formatCop } from '@/lib/domain/money'
import { teamReport, type TeamReport } from '@/lib/services/core/teamReport'

const ROLE: Record<string, string> = { owner: 'Dueño', admin: 'Encargado', cashier: 'Cajero', waiter: 'Mesero', kitchen: 'Cocina' }
const hours = (h: number) => h.toLocaleString('es-CO', { maximumFractionDigits: 1 })
const cop = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `$ ${formatCop(v)}`)

// Plan Y5: horas trabajadas (por las asistencias), pedidos, ventas y propinas de cada persona, y el pago estimado con el
// valor de la hora de Equipo. No liquida la nómina: es la base para hacerla.
export function TeamHoursView({ restaurants }: { restaurants: { id: number; name: string }[] }) {
  const [span, setSpan] = useState<DateSpan>(() => presetSpan('last30'))
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [report, setReport] = useState<TeamReport | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    teamReport({ ...span, restaurant_id: restaurantId }).then((r) => { if (alive) { setReport(r); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el informe.') })
    return () => { alive = false }
  }, [span, restaurantId])
  const t = report?.totals
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Horas y propinas</h1>
          <p className="mt-1 text-soft">Horas por las entradas y salidas de cada persona (una abierta cuenta hasta ahora); propinas de los pedidos cobrados que creó. Pago estimado = horas × valor de la hora + propinas.</p></div>
        <ExportMenu options={[{ kind: 'equipo', label: 'Exportar CSV' }]} params={{ ...span, restaurant_id: restaurantId }} />
      </div>
      <PeriodPicker onChange={setSpan} />
      {restaurants.length > 1 && <div className="flex flex-wrap gap-2"><Chip label="Todos" active={restaurantId === null} onClick={() => setRestaurantId(null)} />
        {restaurants.map((r) => <Chip key={r.id} label={r.name} active={restaurantId === r.id} onClick={() => setRestaurantId(r.id)} />)}</div>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!report ? !error && <p role="status" className="text-soft">Leyendo el informe…</p> : report.rows.length === 0 ? <p className="text-soft">Nadie trabajó en este periodo.</p> : (
        <ScrollTable label="las horas y propinas">
          <table aria-label="Horas y propinas" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">{['Persona', 'Rol', 'Horas', 'Turnos', 'Pedidos', 'Ventas', 'Propinas', 'Valor de la hora', 'Pago estimado'].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{report.rows.map((r) => (
              <tr key={r.account.id} className="border-b border-border">
                <td className="px-4 py-2 font-semibold">{r.account.name}</td><td className="px-4 py-2">{ROLE[r.account.role] ?? r.account.role}</td>
                <td className="px-4 py-2 tabular-nums">{hours(r.hours)}</td><td className="px-4 py-2 tabular-nums">{r.shifts}</td><td className="px-4 py-2 tabular-nums">{r.orders}</td>
                <td className="px-4 py-2 tabular-nums">{cop(r.sales)}</td><td className="px-4 py-2 tabular-nums">{cop(r.tips)}</td>
                <td className="px-4 py-2 tabular-nums">{r.hourly_rate === null ? <span className="text-soft">Sin definir</span> : cop(r.hourly_rate)}</td>
                <td className="px-4 py-2 tabular-nums font-semibold">{cop(r.estimated_pay)}</td>
              </tr>))}</tbody>
            {t && <tfoot><tr className="font-semibold">
              <td className="px-4 py-2" colSpan={2}>Total</td><td className="px-4 py-2 tabular-nums">{hours(t.hours ?? 0)}</td><td className="px-4 py-2 tabular-nums">{t.shifts ?? '—'}</td><td className="px-4 py-2 tabular-nums">{t.orders ?? '—'}</td>
              <td className="px-4 py-2 tabular-nums">{cop(t.sales)}</td><td className="px-4 py-2 tabular-nums">{cop(t.tips)}</td><td /><td className="px-4 py-2 tabular-nums">{cop(t.estimated_pay)}</td>
            </tr></tfoot>}
          </table>
        </ScrollTable>
      )}
    </section>
  )
}
