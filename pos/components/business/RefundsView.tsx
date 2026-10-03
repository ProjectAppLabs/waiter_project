'use client'

import { useEffect, useState } from 'react'

import { PeriodPicker } from '@/components/business/PeriodPicker'
import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SortTh, TableSearch } from '@/components/ui/SortTh'
import { downloadCsv, presetSpan, toCsv, type DateSpan } from '@/lib/domain/business'
import { formatCop } from '@/lib/domain/money'
import { useTableView, type Sorters } from '@/lib/hooks/useTableView'
import { listRefunds, type CoreRefund } from '@/lib/services/core/refunds'

const money = (v: number) => `$ ${formatCop(Math.round(v))}`
const when = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
const methods = (r: CoreRefund) => r.payments.map((p) => `${p.name} ${money(p.amount)}`).join(' · ')

// Plan U1: las devoluciones de todos los restaurantes, con el pedido, quién la hizo, el valor, por dónde salió el
// dinero y el motivo. El dueño ve todas; el encargado, las de su sede.
export function RefundsView({ restaurants }: { restaurants: { id: number; name: string }[] }) {
  const [span, setSpan] = useState<DateSpan>(() => presetSpan('last30'))
  const [restaurantId, setRestaurantId] = useState<number | null>(restaurants.length === 1 ? restaurants[0].id : null)
  const [data, setData] = useState<{ key: string; rows: CoreRefund[] } | null>(null)
  const [error, setError] = useState('')
  const key = JSON.stringify([span, restaurantId])
  useEffect(() => {
    let alive = true
    listRefunds({ from: span.from, to: span.to, ...(restaurantId !== null && { restaurant_id: restaurantId }) })
      .then((rows) => { if (alive) { setData({ key, rows }); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer las devoluciones.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume periodo y restaurante
  }, [key])
  const rows = data?.key === key ? data.rows : null
  const table = useTableView(rows ?? [], {
    restaurant: (r) => r.restaurant_name, createdAt: (r) => r.created_at, order: (r) => r.order_number, account: (r) => r.account?.name,
    total: (r) => r.total, reason: (r) => r.reason,
  } as Sorters<CoreRefund>, (r) => `${r.restaurant_name} ${r.order_number} ${r.account?.name ?? ''} ${r.reason}`)
  const total = (rows ?? []).reduce((sum, r) => sum + r.total, 0)
  const exportCsv = () => rows && downloadCsv(`devoluciones-${span.from}-a-${span.to}.csv`, toCsv(
    ['Restaurante', 'Fecha', 'Pedido', 'Hizo', 'Valor', 'Propina', 'Métodos', 'Volvió al inventario', 'Motivo'],
    rows.map((r) => [r.restaurant_name, r.created_at, r.order_number, r.account?.name ?? '', r.total, r.tip, methods(r), r.restock ? 'Sí' : 'No', r.reason])))
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Devoluciones</h1>
          <p className="mt-1 text-soft">Cada devolución con su pedido, quién la hizo, por dónde salió el dinero y el motivo.{rows && rows.length > 0 && ` Total del periodo: ${money(total)}.`}</p></div>
        <Button onClick={exportCsv} disabled={!rows}><Icon name="download" size={18} />Exportar CSV</Button>
      </div>
      <PeriodPicker onChange={setSpan} />
      {restaurants.length > 1 && (
        <div className="flex flex-wrap items-center gap-2"><Chip label="Todos" active={restaurantId === null} onClick={() => setRestaurantId(null)} />
          {restaurants.map((r) => <Chip key={r.id} label={r.name} active={restaurantId === r.id} onClick={() => setRestaurantId(r.id)} />)}</div>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!rows ? !error && <p role="status" className="text-soft">Leyendo las devoluciones…</p>
        : rows.length === 0 ? <p className="text-soft">No hay devoluciones en este periodo.</p> : (<>
          <TableSearch value={table.query} onChange={table.setQuery} placeholder="Buscar por restaurante, pedido, persona o motivo" className="w-80 max-w-full" />
          <ScrollTable label="las devoluciones">
            <table aria-label="Devoluciones" className="data-table text-[15px]">
              <thead><tr className="text-left text-soft border-b border-border">
                {([['restaurant', 'Restaurante'], ['createdAt', 'Fecha'], ['order', 'Pedido'], ['account', 'Hizo'], ['total', 'Valor'], ['reason', 'Motivo']] as const)
                  .map(([k, h]) => <SortTh key={k} label={h} sortKey={k} sort={table.sort} onSort={table.toggle} align={k === 'total' ? 'right' : 'left'} />)}</tr></thead>
              <tbody>{table.view.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">{r.restaurant_name}</td>
                  <td className="px-4 py-3">{when(r.created_at)}</td>
                  <td className="px-4 py-3">{r.order_number}</td>
                  <td className="px-4 py-3">{r.account?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular"><div>{money(r.total)}</div><div className="text-[13px] text-dim">{methods(r)}</div></td>
                  <td className="px-4 py-3 cell-wrap max-w-[360px]">{r.reason}{r.restock && <div className="text-[13px] text-dim">Volvió al inventario</div>}</td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollTable>
        </>)}
    </section>
  )
}
