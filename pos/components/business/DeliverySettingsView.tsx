'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { CoreError } from '@/lib/services/core/http'
import { deliverySettings, saveDeliverySettings, type DeliveryMethod, type DeliverySettings, type RestaurantDelivery } from '@/lib/services/core/delivery'

const METHODS: { key: DeliveryMethod; label: string; hint: string }[] = [
  { key: 'online', label: 'Pago en línea', hint: 'El pedido va a cocina solo cuando está pagado.' },
  { key: 'cash', label: 'Efectivo contra entrega', hint: 'El domiciliario cobra al entregar.' },
  { key: 'card_on_delivery', label: 'Datáfono contra entrega', hint: 'El domiciliario lleva el datáfono.' },
]
const message = (e: unknown, fallback: string) => (e instanceof CoreError || e instanceof Error ? e.message || fallback : fallback)
const DEFAULT: DeliverySettings = { enabled: false, radius_km: 5, tiers: [{ up_to_km: 2, fee: 4000 }, { up_to_km: 5, fee: 6000 }], min_order: 0, methods: ['online'], notes: '' }

// Plan D: el dueño decide por sede hasta dónde llega, cuánto cobra por distancia y qué pagos acepta. El cliente comparte
// su ubicación y Waiter escoge la sede más cercana que lo cubre.
export function DeliverySettingsView() {
  const [rows, setRows] = useState<RestaurantDelivery[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => deliverySettings().then(setRows).catch((e: unknown) => setError(message(e, 'No se pudieron leer los domicilios.'))), [])
  useEffect(() => { void load() }, [load])
  if (!rows) return error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Leyendo los domicilios…</p>
  return (
    <section className="max-w-4xl flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Domicilios</h1>
        <p className="mt-1 text-soft">Tus clientes piden a domicilio desde el menú o por WhatsApp compartiendo su ubicación. Waiter escoge la sede más cercana que los cubre y calcula el envío por distancia.</p></div>
      {rows.length === 0 ? <p className="text-soft">Todavía no tienes sedes.</p> : rows.map((r) => <RestaurantForm key={r.restaurant_id} row={r} />)}
    </section>
  )
}

function RestaurantForm({ row }: { row: RestaurantDelivery }) {
  const [form, setForm] = useState<DeliverySettings>(row.settings.tiers.length ? row.settings : { ...DEFAULT, ...row.settings, tiers: DEFAULT.tiers })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const set = (patch: Partial<DeliverySettings>) => { setForm((f) => ({ ...f, ...patch })); setNotice('') }
  const setTier = (i: number, patch: Partial<DeliverySettings['tiers'][number]>) => set({ tiers: form.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const toggleMethod = (m: DeliveryMethod) => set({ methods: form.methods.includes(m) ? form.methods.filter((x) => x !== m) : [...form.methods, m] })
  const last = form.tiers[form.tiers.length - 1]
  const problem = !form.enabled ? '' : !row.has_location ? 'Ubica la sede en el mapa antes de activar los domicilios.'
    : form.methods.length === 0 ? 'Activa al menos un método de pago.'
      : !(form.radius_km > 0 && form.radius_km <= 50) ? 'El radio debe estar entre 0 y 50 km.'
        : form.tiers.length === 0 || !last || last.up_to_km < form.radius_km ? 'El último tramo debe llegar hasta el radio.'
          : form.tiers.some((t, i) => i > 0 && t.up_to_km <= form.tiers[i - 1].up_to_km) ? 'Los tramos van de menor a mayor distancia.' : ''
  async function save() {
    setBusy(true); setError(''); setNotice('')
    try { setForm(await saveDeliverySettings(row.restaurant_id, form)); setNotice('Guardado.') }
    catch (e) { setError(message(e, 'No se pudo guardar.')) } finally { setBusy(false) }
  }
  return (
    <form aria-label={`Domicilios de ${row.name}`} className="rounded-lg border border-border p-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-11 h-11 rounded-md bg-delivery-soft text-delivery-ink grid place-items-center"><Icon name="delivery" size={22} /></span>
        <h2 className="flex-1 text-[18px] font-semibold">{row.name}</h2>
        <StatusPill tone={form.enabled ? 'success' : 'neutral'}>{form.enabled ? 'Con domicilio' : 'Sin domicilio'}</StatusPill>
        <label className="flex items-center gap-2 text-[15px] font-semibold"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Hacer domicilios</label>
      </div>
      {!row.has_location && <p className="text-[14px] rounded-md bg-progress-soft text-progress-ink p-3">Esta sede no tiene ubicación en el mapa. Agrégala en <Link className="underline font-semibold" href="/organizacion/restaurantes">Restaurantes</Link> para calcular distancias.</p>}
      {form.enabled && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Radio máximo (km)" type="number" min={0.5} max={50} step={0.5} value={form.radius_km} onChange={(e) => set({ radius_km: Number(e.target.value) })} />
          <TextInput label="Pedido mínimo ($)" type="number" min={0} step={1000} value={form.min_order} onChange={(e) => set({ min_order: Number(e.target.value) })} />
        </div>
        <fieldset className="flex flex-col gap-2"><legend className="text-[15px] font-semibold mb-1">Costo del envío por distancia</legend>
          {form.tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-40"><TextInput label={`Hasta (km) · tramo ${i + 1}`} type="number" min={0.5} step={0.5} value={t.up_to_km} onChange={(e) => setTier(i, { up_to_km: Number(e.target.value) })} /></div>
              <div className="w-40"><TextInput label={`Envío ($) · tramo ${i + 1}`} type="number" min={0} step={500} value={t.fee} onChange={(e) => setTier(i, { fee: Number(e.target.value) })} /></div>
              <Button type="button" disabled={form.tiers.length === 1} onClick={() => set({ tiers: form.tiers.filter((_, j) => j !== i) })}>Quitar tramo {i + 1}</Button>
            </div>))}
          <div><Button type="button" disabled={form.tiers.length >= 8} onClick={() => set({ tiers: [...form.tiers, { up_to_km: (last?.up_to_km ?? 0) + 2, fee: (last?.fee ?? 0) + 2000 }] })}><Icon name="plus" size={16} />Agregar tramo</Button></div>
        </fieldset>
        <fieldset className="flex flex-col gap-2"><legend className="text-[15px] font-semibold mb-1">Cómo pueden pagar</legend>
          {METHODS.map((m) => (
            <label key={m.key} className="flex items-start gap-2 text-[15px]"><input type="checkbox" className="mt-1" checked={form.methods.includes(m.key)} onChange={() => toggleMethod(m.key)} />
              <span><strong>{m.label}</strong><span className="block text-[13px] text-soft">{m.hint}</span></span></label>))}
        </fieldset>
        <TextInput label="Nota para el cliente (opcional)" maxLength={200} placeholder="Ej.: entregamos en portería" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </>}
      {problem && <p role="alert" className="text-danger">{problem}</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      <div><Button type="submit" variant="primary" disabled={busy || !!problem}>Guardar</Button></div>
    </form>
  )
}
