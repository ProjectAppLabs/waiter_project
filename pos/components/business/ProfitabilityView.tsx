'use client'

import { useEffect, useMemo, useState } from 'react'

import { PeriodPicker } from '@/components/business/PeriodPicker'
import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { downloadCsv, presetSpan, toCsv, type DateSpan } from '@/lib/domain/business'
import { formatCop } from '@/lib/domain/money'
import { profitability, type MenuClass, type Profitability } from '@/lib/services/business'
import { cn } from '@/lib/utils'

const money = (v: number) => `$ ${formatCop(Math.round(v))}`
// Ingeniería de menú: popularidad (unidades) × margen (lo que deja cada plato sobre su receta).
export const MENU_CLASS: Record<MenuClass, { label: string; hint: string; tone: string }> = {
  star: { label: 'Estrella', hint: 'Se vende mucho y deja mucho: cuídalo y destácalo.', tone: 'bg-success-soft text-success-ink' },
  plowhorse: { label: 'Caballo de batalla', hint: 'Se vende mucho y deja poco: revisa su precio o su receta.', tone: 'bg-info-soft text-info-ink' },
  puzzle: { label: 'Rompecabezas', hint: 'Deja mucho y se vende poco: muévelo en la carta o promociónalo.', tone: 'bg-progress-soft text-progress-ink' },
  dog: { label: 'Perro', hint: 'Se vende poco y deja poco: piensa en quitarlo.', tone: 'bg-danger-soft text-danger-ink' },
}
const CLASSES = Object.keys(MENU_CLASS) as MenuClass[]

// Plan Q4: costo de cada plato según su receta, margen, food cost y su lugar en la matriz de ingeniería de menú. El dueño ve
// toda la organización o un restaurante; el encargado (`restaurants` con uno solo), el suyo.
export function ProfitabilityView({ restaurants, allowOrganization }: { restaurants: { id: number; name: string }[]; allowOrganization: boolean }) {
  const [span, setSpan] = useState<DateSpan>(() => presetSpan('month'))
  const [configId, setConfigId] = useState<number | null>(allowOrganization ? null : restaurants[0]?.id ?? null)
  const [filter, setFilter] = useState<MenuClass | 'all' | 'noCost'>('all')
  const [data, setData] = useState<{ key: string; value: Profitability } | null>(null)
  const [error, setError] = useState('')
  const key = JSON.stringify([span, configId])
  useEffect(() => {
    if (!allowOrganization && configId === null) return
    let alive = true
    profitability(span.from, span.to, configId).then((value) => { if (alive) { setData({ key, value }); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo calcular la rentabilidad.') })
    return () => { alive = false }
  }, [span, configId, key, allowOrganization])
  const result = data?.key === key ? data.value : null
  const rows = useMemo(() => (result?.rows ?? [])
    .filter((r) => filter === 'all' || (filter === 'noCost' ? r.cost === null : r.menuClass === filter))
    .sort((a, b) => (b.grossProfit ?? -Infinity) - (a.grossProfit ?? -Infinity)), [result, filter])
  const count = (c: MenuClass) => result?.rows.filter((r) => r.menuClass === c).length ?? 0
  const noCost = result?.rows.filter((r) => r.cost === null).length ?? 0
  const exportCsv = () => result && downloadCsv(`rentabilidad-${span.from}-a-${span.to}.csv`, toCsv(
    ['Plato', 'Categoría', 'Precio sin impuestos', 'Costo', 'Margen', 'Food cost %', 'Unidades', 'Ingresos', 'Utilidad bruta', 'Clase'],
    result.rows.map((r) => [r.name, r.category, r.price, r.cost, r.margin, r.foodCostPct, r.units, r.revenue, r.grossProfit, r.menuClass ? MENU_CLASS[r.menuClass].label : 'Sin costo'])))
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Rentabilidad por plato</h1>
          <p className="mt-1 text-soft">El costo sale de la receta de cada plato; el margen es el precio sin impuestos menos ese costo (no incluye mano de obra ni arriendo).</p></div>
        <Button onClick={exportCsv} disabled={!result}><Icon name="download" size={18} />Exportar CSV</Button>
      </div>
      <PeriodPicker onChange={setSpan} />
      {restaurants.length > 1 || allowOrganization ? (
        <div role="group" aria-label="Restaurante" className="flex flex-wrap gap-2">
          {allowOrganization && <Chip label="Toda la organización" active={configId === null} onClick={() => setConfigId(null)} />}
          {restaurants.map((r) => <Chip key={r.id} label={r.name} active={configId === r.id} onClick={() => setConfigId(r.id)} />)}
        </div>) : null}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!result ? !error && <p role="status" className="text-soft">Calculando costos y márgenes…</p> : <>
        <div role="group" aria-label="Clase" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CLASSES.map((c) => (
            <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(filter === c ? 'all' : c)}
              className={cn('rounded-lg border p-4 text-left flex flex-col gap-1', filter === c ? 'border-primary' : 'border-border')}>
              <span className={cn('self-start px-2 py-0.5 rounded-md text-[13px] font-semibold', MENU_CLASS[c].tone)}>{MENU_CLASS[c].label}</span>
              <span className="text-[24px] font-semibold tabular">{count(c)}</span>
              <span className="text-[13px] text-soft">{MENU_CLASS[c].hint}</span>
            </button>))}
        </div>
        {noCost > 0 && <button type="button" onClick={() => setFilter(filter === 'noCost' ? 'all' : 'noCost')} className="self-start text-[14px] font-semibold text-primary">
          {noCost} {noCost === 1 ? 'plato sin costo' : 'platos sin costo'}: les falta receta o el costo de algún ingrediente. {filter === 'noCost' ? 'Ver todos' : 'Verlos'}</button>}
        <p className="text-[13px] text-dim">Popular: {result.thresholds.popularityUnits.toFixed(1)} unidades o más · Rentable: margen de {money(result.thresholds.margin)} o más.</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">
              {['Plato', 'Precio', 'Costo', 'Margen', 'Food cost', 'Unidades', 'Utilidad bruta', 'Clase'].map((h, i) => <th key={h} className={cn('px-4 py-3 font-semibold', i > 0 && i < 7 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.templateId} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><div className="font-semibold">{r.name}</div><div className="text-[13px] text-dim">{r.category}</div></td>
                <td className="px-4 py-3 text-right tabular">{money(r.price)}</td>
                <td className="px-4 py-3 text-right tabular">{r.cost === null ? '—' : money(r.cost)}</td>
                <td className="px-4 py-3 text-right tabular">{r.margin === null ? '—' : money(r.margin)}</td>
                <td className="px-4 py-3 text-right tabular">{r.foodCostPct === null ? '—' : `${r.foodCostPct.toFixed(0)} %`}</td>
                <td className="px-4 py-3 text-right tabular">{r.units}</td>
                <td className="px-4 py-3 text-right tabular">{r.grossProfit === null ? '—' : money(r.grossProfit)}</td>
                <td className="px-4 py-3">{r.menuClass ? <span className={cn('px-2 py-0.5 rounded-md text-[13px] font-semibold whitespace-nowrap', MENU_CLASS[r.menuClass].tone)}>{MENU_CLASS[r.menuClass].label}</span>
                  : <span className="text-[13px] text-dim">{r.cost === null ? 'Sin costo' : 'Sin ventas'}</span>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </>}
    </section>
  )
}
