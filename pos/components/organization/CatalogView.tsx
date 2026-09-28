'use client'

import { useEffect, useMemo, useState } from 'react'

import { useOrg } from '@/components/organization/OrgContext'
import { formatCop } from '@/lib/domain/money'
import { loadMasterCatalog, setDishAvailability, setDishPrice, type MasterCatalog, type MasterDish } from '@/lib/services/masterCatalog'
import { cn } from '@/lib/utils'

// Plan O: el catálogo maestro. Los platos son de toda la organización (se crean y editan en Inventario); aquí se decide
// lo de cada restaurante: su precio (vacío = el de la organización) y si lo ofrece hoy.
export function CatalogView() {
  const { restaurants } = useOrg()
  const ids = useMemo(() => restaurants.map((r) => r.id), [restaurants])
  const [data, setData] = useState<MasterCatalog | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ids.length) return
    let alive = true
    loadMasterCatalog(ids).then((d) => { if (alive) setData(d) }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el catálogo.') })
    return () => { alive = false }
  }, [ids])
  const shown = (data?.dishes ?? []).filter((d) => `${d.name} ${d.category}`.toLowerCase().includes(query.trim().toLowerCase()))
  const patch = (fn: (d: MasterCatalog) => MasterCatalog) => setData((d) => (d ? fn(d) : d))
  return (
    <section className="flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Catálogo</h1>
        <p className="mt-1 text-soft">Los platos son de toda la organización y se editan en Inventario. Aquí decides el precio de cada restaurante (vacío es el de la organización) y si lo ofrece.</p></div>
      <label className="max-w-md flex flex-col gap-1.5 text-[15px] font-medium">Buscar plato
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-tap-min px-3.5 rounded-[10px] border border-border bg-surface" /></label>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!data ? <p className="text-soft">Cargando el catálogo…</p> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="bg-muted text-left"><tr><th className="p-3">Plato</th><th className="p-3">Precio de la organización</th>
              {restaurants.map((r) => <th key={r.id} className="p-3">{r.name}</th>)}</tr></thead>
            <tbody>{shown.map((d) => (
              <tr key={d.templateId} className="border-t border-border align-top">
                <td className="p-3"><p className="font-semibold">{d.name}</p><p className="text-[13px] text-soft">{d.category}</p></td>
                <td className="p-3 tabular">$ {formatCop(d.basePrice)}</td>
                {restaurants.map((r) => <RestaurantCell key={r.id} dish={d} configId={r.id} restaurant={r.name} price={data.prices[r.id]?.[d.variantId] ?? d.basePrice}
                  onPrice={(value) => patch((c) => ({ ...c, prices: { ...c.prices, [r.id]: { ...c.prices[r.id], [d.variantId]: value } } }))}
                  onAvailable={(available) => patch((c) => ({ ...c, dishes: c.dishes.map((x) => x.templateId === d.templateId ? { ...x, unavailableIn: available ? x.unavailableIn.filter((i) => i !== r.id) : [...x.unavailableIn, r.id] } : x) }))} />)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RestaurantCell({ dish, configId, restaurant, price, onPrice, onAvailable }: { dish: MasterDish; configId: number; restaurant: string; price: number; onPrice: (p: number) => void; onAvailable: (a: boolean) => void }) {
  const custom = Math.round(price) !== Math.round(dish.basePrice)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const available = !dish.unavailableIn.includes(configId)
  const savePrice = async () => {
    if (draft === null) return
    const value = draft.trim() === '' ? null : Number(draft.replace(/\D/g, ''))
    if (value !== null && !Number.isFinite(value)) { setError('Precio inválido'); return }
    setBusy(true); setError('')
    try { onPrice(await setDishPrice(configId, dish.templateId, value)); setDraft(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setBusy(false) }
  }
  const toggle = async () => {
    setBusy(true); setError('')
    try { await setDishAvailability(dish.templateId, configId, !available); onAvailable(!available) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar') } finally { setBusy(false) }
  }
  return (
    <td className="p-3">
      <div className="flex flex-col gap-2">
        <input aria-label={`Precio de ${dish.name} en ${restaurant}`} inputMode="numeric" disabled={busy} placeholder={formatCop(dish.basePrice)}
          value={draft ?? (custom ? formatCop(price) : '')} onChange={(e) => setDraft(e.target.value)} onBlur={() => void savePrice()}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={cn('h-11 w-32 px-3 rounded-md border bg-surface tabular', custom ? 'border-primary text-ink font-semibold' : 'border-border')} />
        <button type="button" role="switch" aria-checked={available} aria-label={`${dish.name} disponible en ${restaurant}`} disabled={busy} onClick={() => void toggle()}
          className={cn('h-9 w-32 rounded-md text-[13px] font-semibold border', available ? 'border-success/40 text-success-ink bg-success-soft' : 'border-danger/40 text-danger-ink bg-danger-soft')}>
          {available ? 'Disponible' : 'Agotado aquí'}
        </button>
        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      </div>
    </td>
  )
}
