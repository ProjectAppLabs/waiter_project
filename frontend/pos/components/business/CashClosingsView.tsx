'use client'

import { useEffect, useState } from 'react'

import { PeriodPicker } from '@/components/business/PeriodPicker'
import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SortTh, TableSearch } from '@/components/ui/SortTh'
import { TextInput } from '@/components/ui/Field'
import { downloadCsv, presetSpan, toCsv, type DateSpan } from '@/lib/domain/business'
import { formatCop } from '@/lib/domain/money'
import { cashClosings, cashSettings, type CashClosing } from '@/lib/services/business'
import { useTableView, type Sorters } from '@/lib/hooks/useTableView'

const money = (v: number) => `${v < 0 ? '−\u00a0' : ''}$\u00a0${formatCop(Math.round(Math.abs(v)))}`
const when = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Plan Q3: cada cierre de caja con quién la cerró, lo esperado, lo contado y la diferencia. El dueño ve todos sus
// restaurantes y fija la tolerancia; el encargado (`restaurants` con uno solo) ve los de su sede.
export function CashClosingsView({ restaurants, canSetTolerance }: { restaurants: { id: number; name: string }[]; canSetTolerance: boolean }) {
  const [span, setSpan] = useState<DateSpan>(() => presetSpan('last30'))
  const [configId, setConfigId] = useState<number | null>(restaurants.length === 1 ? restaurants[0].id : null)
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [data, setData] = useState<{ key: string; rows: CashClosing[] } | null>(null)
  const [tolerance, setTolerance] = useState<number | null>(null), [draft, setDraft] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const ids = configId === null ? restaurants.map((r) => r.id) : [configId]
  const key = JSON.stringify([span, ids, onlyDiff])
  useEffect(() => {
    let alive = true
    cashClosings(span.from, span.to, ids, onlyDiff).then((rows) => { if (alive) { setData({ key, rows }); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer los cierres.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume periodo, restaurantes y filtro
  }, [key])
  useEffect(() => { void cashSettings().then((s) => { setTolerance(s.tolerance); setDraft(String(s.tolerance)) }).catch(() => undefined) }, [])
  const rows = data?.key === key ? data.rows : null
  // Ordenar por cualquier columna (la diferencia más grande, quién cerró) y buscar por restaurante, persona o nota.
  const table = useTableView(rows ?? [], {
    restaurant: (r) => r.configName, closedAt: (r) => r.closedAt, closedBy: (r) => r.closedBy?.name, expected: (r) => r.expected,
    counted: (r) => r.counted, difference: (r) => r.difference, notes: (r) => r.notes,
  } as Sorters<CashClosing>, (r) => `${r.configName} ${r.name} ${r.closedBy?.name ?? ''} ${r.notes}`)
  const saveTolerance = async () => {
    setError(''); setNotice('')
    try { const s = await cashSettings(Math.max(0, Number(draft))); setTolerance(s.tolerance); setNotice('Tolerancia guardada.'); setData(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la tolerancia.') }
  }
  const exportCsv = () => rows && downloadCsv(`cuadres-${span.from}-a-${span.to}.csv`, toCsv(
    ['Restaurante', 'Sesión', 'Cerró', 'Fecha', 'Esperado', 'Contado', 'Diferencia', 'Nota'],
    rows.map((r) => [r.configName, r.name, r.closedBy?.name ?? '', r.closedAt, r.expected, r.counted, r.difference, r.notes])))
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Cuadres de caja</h1>
          <p className="mt-1 text-soft">Cada cierre con lo esperado, lo contado y quién cerró. {tolerance !== null && `Tolerancia: ${money(tolerance)}; lo que la supera avisa al dueño y al encargado.`}</p></div>
        <Button onClick={exportCsv} disabled={!rows}><Icon name="download" size={18} />Exportar CSV</Button>
      </div>
      {canSetTolerance && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void saveTolerance() }}>
          <div className="w-56"><TextInput label="Tolerancia de diferencia ($)" type="number" min={0} step={500} value={draft} onChange={(e) => setDraft(e.target.value)} /></div>
          <Button type="submit" disabled={draft === '' || Number(draft) < 0}>Guardar tolerancia</Button>
        </form>
      )}
      <PeriodPicker onChange={setSpan} />
      <div className="flex flex-wrap items-center gap-2">
        {restaurants.length > 1 && <><Chip label="Todos" active={configId === null} onClick={() => setConfigId(null)} />
          {restaurants.map((r) => <Chip key={r.id} label={r.name} active={configId === r.id} onClick={() => setConfigId(r.id)} />)}</>}
        <label className="ml-2 flex items-center gap-2 text-[15px]"><input type="checkbox" className="w-5 h-5 accent-primary" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />Solo con diferencia</label>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {!rows ? !error && <p role="status" className="text-soft">Leyendo los cierres…</p>
        : rows.length === 0 ? <p className="text-soft">No hay cierres de caja en este periodo.</p> : (<>
          <TableSearch value={table.query} onChange={table.setQuery} placeholder="Buscar por restaurante, persona o nota" className="w-80 max-w-full" />
          <ScrollTable label="los cuadres">
            <table className="data-table text-[15px]">
              <thead><tr className="text-left text-soft border-b border-border">
                {([['restaurant', 'Restaurante'], ['closedAt', 'Cierre'], ['closedBy', 'Cerró'], ['expected', 'Esperado'], ['counted', 'Contado'], ['difference', 'Diferencia'], ['notes', 'Nota']] as const)
                  .map(([k, h], i) => <SortTh key={k} label={h} sortKey={k} sort={table.sort} onSort={table.toggle} align={i >= 3 && i <= 5 ? 'right' : 'left'} />)}</tr></thead>
              <tbody>{table.view.map((r) => (
                <tr key={r.sessionId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">{r.configName}</td>
                  <td className="px-4 py-3"><div>{when(r.closedAt)}</div><div className="text-[13px] text-dim">{r.name}</div></td>
                  <td className="px-4 py-3">{r.closedBy?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular">{money(r.expected)}</td>
                  <td className="px-4 py-3 text-right tabular">{money(r.counted)}</td>
                  <td className="px-4 py-3 text-right tabular">{r.difference === 0 ? <span className="text-soft">Cuadra</span>
                    : <StatusPill tone={r.overTolerance ? 'danger' : 'progress'}>{money(r.difference)}</StatusPill>}</td>
                  <td className="cell-wrap px-4 py-3 text-[14px] text-soft">{r.notes || '—'}</td>
                </tr>))}</tbody>
            </table>
            {table.view.length === 0 && <p className="p-6 text-center text-soft">Ningún cierre coincide con la búsqueda.</p>}
          </ScrollTable></>)}
    </section>
  )
}
