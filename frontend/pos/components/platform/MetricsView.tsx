'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { StatusPill } from '@/components/kit/StatusPill'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SortTh, TableSearch } from '@/components/ui/SortTh'
import { money, STATUS } from '@/components/platform/OrganizationsView'
import { useTableView, type Sorters } from '@/lib/hooks/useTableView'
import { platformMetrics, type OrgMetrics, type PlatformMetrics } from '@/lib/services/core/platform'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PERIODS: [string, string, () => [string, string]][] = [
  ['month', 'Este mes', () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)] }],
  ['30', 'Últimos 30 días', () => { const d = new Date(); return [iso(new Date(d.getTime() - 29 * 86400000)), iso(d)] }],
  ['last', 'Mes pasado', () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))] }],
]
const when = (at: string | null) => (at ? new Date(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—')

// Contrato M: cómo le va a cada cliente de ProjectApp. Ventas con impuestos y sin propina, como en la consola del dueño.
export function MetricsView() {
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState<PlatformMetrics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const [from, to] = PERIODS.find(([k]) => k === period)![2]()
    platformMetrics(from, to).then((d) => { if (alive) { setData(d); setError('') } }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer las métricas.') })
    return () => { alive = false }
  }, [period])
  const table = useTableView(data?.organizations ?? [], {
    name: (o) => o.name, status: (o) => STATUS[o.status].label, mrr: (o) => o.monthly_price, sales: (o) => o.sales, orders: (o) => o.orders, ticket: (o) => o.ticket,
    restaurants: (o) => o.restaurants, accounts: (o) => o.accounts_active, last: (o) => o.last_order_at, overdue: (o) => o.overdue_amount,
  } as Sorters<OrgMetrics>, (o) => `${o.name} ${o.slug} ${o.plan}`, { key: 'sales', dir: 'desc' })
  const t = data?.totals
  return (
    <section className="flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Métricas</h1><p className="mt-1 text-soft">Ingresos de ProjectApp y uso de cada cliente en el periodo.</p></div>
      <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
        {PERIODS.map(([k, label]) => <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}
          className={`h-10 px-4 rounded-md border text-[15px] font-semibold ${period === k ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface'}`}>{label}</button>)}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {t && (
        <ul aria-label="Totales" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {([['Ingreso mensual (MRR)', money(t.mrr)], ['Clientes', `${t.organizations} · ${t.active} activos · ${t.trial} en prueba · ${t.suspended} suspendidos`],
            ['Ventas de los clientes', money(t.sales)], ['Pedidos', `${t.orders} en ${t.restaurants} restaurantes`]] as const).map(([k, v]) => (
            <li key={k} className="rounded-lg border border-border bg-surface p-4"><p className="text-[13px] text-soft">{k}</p><p className="mt-1 text-[20px] font-bold tabular">{v}</p></li>))}
        </ul>
      )}
      {data && (<>
        <TableSearch value={table.query} onChange={table.setQuery} placeholder="Buscar cliente" className="w-72 max-w-full" />
        <ScrollTable label="las métricas por cliente">
          <table aria-label="Métricas por cliente" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">
              {([['name', 'Cliente', 'left'], ['status', 'Estado', 'left'], ['mrr', 'Paga al mes', 'right'], ['sales', 'Ventas', 'right'], ['orders', 'Pedidos', 'right'], ['ticket', 'Ticket', 'right'],
                ['restaurants', 'Restaurantes', 'right'], ['accounts', 'Personas activas', 'right'], ['last', 'Último pedido', 'left'], ['overdue', 'En mora', 'right']] as const)
                .map(([k, h, a]) => <SortTh key={k} label={h} sortKey={k} sort={table.sort} onSort={table.toggle} align={a} />)}</tr></thead>
            <tbody>{table.view.map((o) => (
              <tr key={o.slug} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><Link href={`/plataforma/clientes/${o.slug}`} className="font-semibold hover:text-primary">{o.name}</Link><div className="text-[13px] text-dim">{o.plan}</div></td>
                <td className="px-4 py-3"><StatusPill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</StatusPill></td>
                <td className="px-4 py-3 text-right tabular">{money(o.monthly_price)}</td>
                <td className="px-4 py-3 text-right tabular">{money(o.sales)}</td>
                <td className="px-4 py-3 text-right tabular">{o.orders}</td>
                <td className="px-4 py-3 text-right tabular">{money(o.ticket)}</td>
                <td className="px-4 py-3 text-right tabular">{o.restaurants} / {o.restaurants_limit}</td>
                <td className="px-4 py-3 text-right tabular">{o.accounts_active}</td>
                <td className="px-4 py-3 text-soft">{when(o.last_order_at)}</td>
                <td className={`px-4 py-3 text-right tabular ${o.overdue_amount > 0 ? 'text-danger font-semibold' : 'text-soft'}`}>{o.overdue_amount > 0 ? money(o.overdue_amount) : '—'}</td>
              </tr>))}</tbody>
          </table>
        </ScrollTable>
      </>)}
    </section>
  )
}
