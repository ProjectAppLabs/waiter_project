'use client'

import { useEffect, useState } from 'react'

import { TextInput } from '@/components/ui/Field'
import { formatCop } from '@/lib/domain/money'
import { consumption, type Consumption } from '@/lib/services/core/business'

const money = (v: number) => `$ ${formatCop(Math.round(v))}`
const thisMonth = () => new Date().toISOString().slice(0, 7)

// Plan W5: lo que el dueño lleva del mes, para que la cuenta no sea una sorpresa: locales activos por su precio por
// local, lo que se cobra por uso y el consumo medido de cada módulo por local.
export function ConsumptionView() {
  const [period, setPeriod] = useState(thisMonth)
  const [data, setData] = useState<Consumption | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    consumption(period).then((d) => { if (alive) { setData(d); setError('') } }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el consumo.') })
    return () => { alive = false }
  }, [period])
  const current = data?.period === period ? data : null
  return (
    <section className="flex flex-col gap-5 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Consumo</h1>
          <p className="mt-1 text-soft">Lo que llevas este mes: la mensualidad por cada local activo y lo que se cobra por uso. La mensualidad se cobra por adelantado; el uso de este mes llega en la cuenta del mes siguiente.</p></div>
        <div className="w-48"><TextInput label="Mes" type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} /></div>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!current ? !error && <p role="status" className="text-soft">Leyendo el consumo…</p> : (<>
        <section aria-label="Cuenta estimada" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Cuenta estimada</h2>
          <table aria-label="Cuenta estimada" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Concepto</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>{current.lines.map((l, i) => (
              <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2">{l.concept}</td><td className="px-3 py-2 text-right tabular">{l.quantity.toLocaleString('es-CO')}</td>
                <td className="px-3 py-2 text-right tabular">{money(l.unit_price)}</td><td className="px-3 py-2 text-right tabular">{money(l.total)}</td></tr>))}</tbody>
          </table>
          <p className="flex justify-between text-[17px] font-semibold"><span>Total estimado</span><span className="tabular">{money(current.estimated_total)}</span></p>
          <p className="text-[13px] text-soft">{current.locals_active} {current.locals_active === 1 ? 'local activo' : 'locales activos'} a {money(current.price_per_local)} cada uno.</p>
        </section>
        <section aria-label="Uso del mes" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Uso del mes</h2>
          {current.usage.length === 0 ? <p className="text-soft">Sin consumo medido este mes.</p> : (
            <table aria-label="Uso del mes" className="data-table text-[15px]">
              <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Módulo</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Local</th><th className="px-3 py-2 text-right">Cantidad</th></tr></thead>
              <tbody>{current.usage.map((u, i) => (
                <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2">{u.module_name}</td><td className="px-3 py-2">{u.unit_name}</td>
                  <td className="px-3 py-2">{u.restaurant_name ?? 'Organización'}</td><td className="px-3 py-2 text-right tabular">{u.quantity.toLocaleString('es-CO')}</td></tr>))}</tbody>
            </table>
          )}
        </section>
      </>)}
    </section>
  )
}
