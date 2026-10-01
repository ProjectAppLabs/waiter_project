'use client'

import { useEffect, useState } from 'react'

import { PeriodPicker } from '@/components/business/PeriodPicker'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { change, downloadCsv, presetSpan, toCsv, type DateSpan } from '@/lib/domain/business'
import { formatCop } from '@/lib/domain/money'
import { orgSummary, type OrgSummary, type SummaryFigures } from '@/lib/services/business'
import { cn } from '@/lib/utils'

const money = (v: number) => `$ ${formatCop(Math.round(v))}`
const METRICS: [keyof SummaryFigures, string, (v: number) => string][] = [
  ['sales', 'Ventas', money], ['orders', 'Pedidos', (v) => String(v)], ['ticket', 'Ticket promedio', money], ['guests', 'Comensales', (v) => String(v)], ['tips', 'Propinas', money],
]

function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = change(current, previous)
  if (pct === null) return <span className="text-[13px] text-dim">sin periodo anterior</span>
  const up = pct >= 0
  return <span className={cn('text-[13px] font-semibold tabular', up ? 'text-success-ink' : 'text-danger-ink')}>{up ? '↑' : '↓'} {Math.abs(pct).toFixed(0)} %</span>
}

// Plan Q2: cómo va cada restaurante frente a los demás y frente a su periodo anterior. Es la primera pantalla del dueño.
export function SummaryView() {
  const [span, setSpan] = useState<DateSpan>(() => presetSpan('last30'))
  const [data, setData] = useState<{ key: string; value: OrgSummary } | null>(null)
  const [error, setError] = useState('')
  const key = `${span.from}|${span.to}`
  useEffect(() => {
    let alive = true
    orgSummary(span.from, span.to).then((value) => { if (alive) { setData({ key, value }); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el resumen.') })
    return () => { alive = false }
  }, [span, key])
  const summary = data?.key === key ? data.value : null
  const exportCsv = () => {
    if (!summary) return
    const header = ['Restaurante', ...METRICS.flatMap(([, label]) => [label, `${label} (anterior)`])]
    const rows = [...summary.restaurants.map((r) => [r.name, ...METRICS.flatMap(([k]) => [r[k], r.previous[k]])]),
      ['Total', ...METRICS.flatMap(([k]) => [summary.total[k], summary.total.previous[k]])]]
    downloadCsv(`resumen-${span.from}-a-${span.to}.csv`, toCsv(header, rows))
  }
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Resumen</h1><p className="mt-1 text-soft">Cómo va cada restaurante frente a los demás y frente a su periodo anterior.</p></div>
        <Button onClick={exportCsv} disabled={!summary}><Icon name="download" size={18} />Exportar CSV</Button>
      </div>
      <PeriodPicker onChange={setSpan} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!summary ? !error && <p role="status" className="text-soft">Sumando ventas…</p> : <>
        <dl aria-label="Total de la organización" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {METRICS.map(([k, label, fmt]) => (
            <div key={k} className="rounded-lg border border-border p-4 flex flex-col gap-1">
              <dt className="text-[14px] text-soft">{label}</dt>
              <dd className="text-[24px] font-semibold tabular">{fmt(summary.total[k])}</dd>
              <dd><Delta current={summary.total[k]} previous={summary.total.previous[k]} /></dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-dim">Comparado con {summary.previousFrom} a {summary.previousTo}.</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border"><th className="px-4 py-3 font-semibold">Restaurante</th>
              {METRICS.map(([k, label]) => <th key={k} className="px-4 py-3 font-semibold text-right">{label}</th>)}</tr></thead>
            <tbody>
              {summary.restaurants.map((r) => (
                <tr key={r.configId} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold">{r.name}</th>
                  {METRICS.map(([k, , fmt]) => <td key={k} className="px-4 py-3 text-right tabular"><div>{fmt(r[k])}</div><Delta current={r[k]} previous={r.previous[k]} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  )
}
