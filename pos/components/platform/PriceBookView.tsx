'use client'

import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { MODULE_NAMES, type ModuleKey } from '@/lib/domain/modules'
import { priceBook, savePriceBook, type PriceBook, type RechargePack, type WhatsappPlan } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

export const UNIT_LABELS: Record<string, string> = {
  'asistente_menu.mensaje_ia': 'Asistente en el menú · por mensaje',
  'asistente_whatsapp.pedido_asistente': 'Asistente de WhatsApp · por pedido',
  'facturacion.documento': 'Facturación electrónica · por documento',
  'fidelizacion.codigo_verificacion': 'Fidelización · por código de verificación',
}
const num = (v: string) => (v === '' ? 0 : Number(v))
const slug = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Plan X: la lista de precios estándar. Los clientes «Estándar» la siguen; los «Personalizados» toman de aquí lo que no
// cambian. Solo quien administra la plataforma la edita.
export function PriceBookView() {
  const canEdit = usePlatformStore((s) => s.user?.role) === 'admin'
  const [book, setBook] = useState<PriceBook | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { priceBook().then(setBook).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo leer la lista de precios.')) }, [])
  if (!book) return error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Leyendo la lista de precios…</p>
  const update = (patch: Partial<PriceBook>) => { setBook({ ...book, ...patch }); setNotice('') }
  const setPlan = (i: number, patch: Partial<WhatsappPlan>) => update({ whatsapp_plans: book.whatsapp_plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const setPack = (i: number, patch: Partial<RechargePack>) => update({ recharge_packs: book.recharge_packs.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  async function save() {
    setBusy(true); setError(''); setNotice('')
    try { setBook(await savePriceBook(book!)); setNotice('Lista de precios guardada. Los clientes «Estándar» la toman desde el próximo periodo.') }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setBusy(false) }
  }
  return (
    <section className="max-w-5xl flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Precios</h1>
          <p className="mt-1 text-soft">La lista estándar. Al dar de alta un cliente eliges si la sigue o si tiene precios personalizados.</p></div>
        {canEdit && <Button variant="primary" disabled={busy} onClick={() => void save()}>Guardar precios</Button>}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        <section aria-label="Mensualidad" className="rounded-lg border border-border p-5 grid gap-4 md:grid-cols-2">
          <h2 className="md:col-span-2 text-[18px] font-semibold">Mensualidad</h2>
          <TextInput label="Precio por local al mes ($)" type="number" min={0} step={1000} value={book.local_monthly} onChange={(e) => update({ local_monthly: num(e.target.value) })} />
          <Select label="Al agotarse lo incluido y las recargas" value={book.on_exhausted} onChange={(e) => update({ on_exhausted: e.target.value === 'bloquear' ? 'bloquear' : 'cobrar' })}>
            <option value="cobrar">Cobrar el excedente en la cuenta siguiente</option><option value="bloquear">Bloquear hasta que recargue</option>
          </Select>
        </section>
        <section aria-label="Precio por unidad de uso" className="rounded-lg border border-border p-5 grid gap-4 md:grid-cols-2">
          <h2 className="md:col-span-2 text-[18px] font-semibold">Precio por unidad de uso</h2>
          {Object.keys({ ...UNIT_LABELS, ...book.unit_prices }).map((key) => (
            <TextInput key={key} label={`${UNIT_LABELS[key] ?? key} ($)`} type="number" min={0} value={book.unit_prices[key] ?? 0}
              onChange={(e) => update({ unit_prices: { ...book.unit_prices, [key]: num(e.target.value) } })} />
          ))}
        </section>
        <section aria-label="Mensualidad por módulo" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Mensualidad por módulo</h2>
          <p className="text-[14px] text-soft">En 0, el módulo va incluido en el precio por local.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {Object.keys(book.modules).map((key) => (
              <TextInput key={key} label={`${MODULE_NAMES[key as ModuleKey] ?? key} ($)`} type="number" min={0} value={book.modules[key]} onChange={(e) => update({ modules: { ...book.modules, [key]: num(e.target.value) } })} />
            ))}
          </div>
        </section>
        <section aria-label="Planes del asistente de WhatsApp" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Planes del asistente de WhatsApp</h2>
          <p className="text-[14px] text-soft">Precio mensual y pedidos incluidos cada mes (no se acumulan). Después se usan las recargas.</p>
          {book.whatsapp_plans.map((p, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] items-end">
              <TextInput label="Nombre del plan" value={p.name} onChange={(e) => setPlan(i, { name: e.target.value, key: p.key || slug(e.target.value) })} />
              <TextInput label="Precio mensual ($)" type="number" min={0} value={p.monthly_price} onChange={(e) => setPlan(i, { monthly_price: num(e.target.value) })} />
              <TextInput label="Pedidos incluidos" type="number" min={0} value={p.included.pedido_asistente ?? 0} onChange={(e) => setPlan(i, { included: { ...p.included, pedido_asistente: num(e.target.value) } })} />
              <Button aria-label={`Quitar el plan ${p.name}`} onClick={() => update({ whatsapp_plans: book.whatsapp_plans.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></Button>
            </div>
          ))}
          <Button className="self-start" onClick={() => update({ whatsapp_plans: [...book.whatsapp_plans, { key: '', name: '', monthly_price: 0, included: { pedido_asistente: 0 } }] })}><Icon name="plus" size={18} />Agregar plan</Button>
        </section>
        <section aria-label="Paquetes de recarga" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Paquetes de recarga</h2>
          <p className="text-[14px] text-soft">Lo que el dueño puede comprar cuando se le acaba lo incluido. Las recargas no vencen.</p>
          {book.recharge_packs.map((p, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto] items-end">
              <TextInput label="Nombre del paquete" value={p.name} onChange={(e) => setPack(i, { name: e.target.value, key: p.key || slug(e.target.value) })} />
              <Select label="Qué recarga" value={`${p.module}.${p.unit}`} onChange={(e) => { const [module, unit] = e.target.value.split('.'); setPack(i, { module, unit }) }}>
                {Object.entries(UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              <TextInput label="Cantidad" type="number" min={1} value={p.quantity} onChange={(e) => setPack(i, { quantity: num(e.target.value) })} />
              <TextInput label="Precio ($)" type="number" min={0} value={p.price} onChange={(e) => setPack(i, { price: num(e.target.value) })} />
              <Button aria-label={`Quitar el paquete ${p.name}`} onClick={() => update({ recharge_packs: book.recharge_packs.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></Button>
            </div>
          ))}
          <Button className="self-start" onClick={() => update({ recharge_packs: [...book.recharge_packs, { key: '', name: '', module: 'asistente_whatsapp', unit: 'pedido_asistente', quantity: 100, price: 0 }] })}><Icon name="plus" size={18} />Agregar paquete</Button>
        </section>
      </fieldset>
    </section>
  )
}
