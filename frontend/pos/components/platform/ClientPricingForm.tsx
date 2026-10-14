'use client'

import { Select, TextInput } from '@/components/ui/Field'
import { formatCop } from '@/lib/domain/money'
import type { ClientPricing, OnExhausted, PriceBook } from '@/lib/services/core/platform'
import { cn } from '@/lib/utils'

const UNITS: [string, string][] = [['asistente_whatsapp.pedido_asistente', 'Pedido de WhatsApp extra ($)'], ['asistente_menu.mensaje_ia', 'Mensaje del asistente del menú ($)']]
const optional = (v: string) => (v === '' ? undefined : Number(v))

// Lo que el cliente paga con estos precios (lo personalizado sobre la lista estándar).
export function effectiveLocal(pricing: ClientPricing, book: PriceBook | null) {
  return pricing.mode === 'personalizado' && pricing.local_monthly !== undefined ? pricing.local_monthly : book?.local_monthly ?? 0
}
export function pricingSummary(pricing: ClientPricing, book: PriceBook | null): string {
  const plan = book?.whatsapp_plans.find((p) => p.key === pricing.whatsapp_plan)
  const whatsapp = pricing.whatsapp_plan ? `WhatsApp ${plan?.name ?? pricing.whatsapp_plan}${pricing.whatsapp ? ` personalizado ($ ${formatCop(pricing.whatsapp.monthly_price)} con ${pricing.whatsapp.included.pedido_asistente ?? 0} pedidos)` : ''}` : 'sin asistente de WhatsApp'
  return `${pricing.mode === 'personalizado' ? 'Precios personalizados' : 'Precios estándar'} · $ ${formatCop(effectiveLocal(pricing, book))} por local al mes · ${whatsapp}`
}

// Plan X: precios de un cliente al darlo de alta o en su ficha. «Estándar» sigue la lista de Precios; «Personalizado»
// cambia solo lo que se escriba (lo vacío toma el estándar). El plan de WhatsApp se elige en los dos casos.
export function ClientPricingForm({ value, onChange, book }: { value: ClientPricing; onChange: (v: ClientPricing) => void; book: PriceBook | null }) {
  const custom = value.mode === 'personalizado'
  const plan = book?.whatsapp_plans.find((p) => p.key === value.whatsapp_plan)
  const set = (patch: Partial<ClientPricing>) => onChange({ ...value, ...patch })
  const mode = (m: ClientPricing['mode']) => onChange(m === 'estandar' ? { mode: m, whatsapp_plan: value.whatsapp_plan ?? null } : { ...value, mode: m })
  return (
    <fieldset aria-label="Precios del cliente" className="rounded-lg border border-border p-4 flex flex-col gap-4">
      <legend className="px-1 text-[15px] font-semibold">Precios</legend>
      <div role="radiogroup" aria-label="Tipo de precios" className="grid grid-cols-2 gap-2">
        {([['estandar', 'Estándar', 'Sigue la lista de Precios'], ['personalizado', 'Personalizado', 'Precios acordados con este cliente']] as const).map(([m, label, hint]) => (
          <button key={m} type="button" role="radio" aria-checked={value.mode === m} onClick={() => mode(m)}
            className={cn('rounded-md border p-3 text-left', value.mode === m ? 'border-primary bg-primary-soft' : 'border-border')}>
            <span className="block text-[15px] font-semibold">{label}</span><span className="block text-[13px] text-soft">{hint}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {custom && <TextInput label="Precio por local al mes (COP)" type="number" min={0} step={1000} value={value.local_monthly ?? ''} placeholder={String(book?.local_monthly ?? '')}
          hint={`Estándar: $ ${formatCop(book?.local_monthly ?? 0)}`} onChange={(e) => set({ local_monthly: optional(e.target.value) })} />}
        <Select label="Plan del asistente de WhatsApp" value={value.whatsapp_plan ?? ''} onChange={(e) => set({ whatsapp_plan: e.target.value || null, whatsapp: null })}>
          <option value="">Sin asistente de WhatsApp</option>
          {book?.whatsapp_plans.map((p) => <option key={p.key} value={p.key}>{p.name} · $ {formatCop(p.monthly_price)} con {p.included.pedido_asistente ?? 0} pedidos</option>)}
        </Select>
        {custom && value.whatsapp_plan && <>
          <TextInput label="Precio del plan de WhatsApp ($)" type="number" min={0} value={value.whatsapp?.monthly_price ?? ''} placeholder={String(plan?.monthly_price ?? '')}
            hint="Vacío: el del plan." onChange={(e) => { const v = optional(e.target.value); set({ whatsapp: v === undefined && !value.whatsapp?.included ? null : { monthly_price: v ?? plan?.monthly_price ?? 0, included: value.whatsapp?.included ?? plan?.included ?? {} } }) }} />
          <TextInput label="Pedidos incluidos al mes" type="number" min={0} value={value.whatsapp?.included.pedido_asistente ?? ''} placeholder={String(plan?.included.pedido_asistente ?? '')}
            hint="Vacío: los del plan." onChange={(e) => { const v = optional(e.target.value); set({ whatsapp: { monthly_price: value.whatsapp?.monthly_price ?? plan?.monthly_price ?? 0, included: v === undefined ? plan?.included ?? {} : { pedido_asistente: v } } }) }} />
        </>}
        {custom && UNITS.map(([key, label]) => (
          <TextInput key={key} label={label} type="number" min={0} value={value.unit_prices?.[key] ?? ''} placeholder={String(book?.unit_prices[key] ?? 0)} hint="Vacío: el estándar."
            onChange={(e) => { const v = optional(e.target.value); const next = { ...value.unit_prices }; if (v === undefined) delete next[key]; else next[key] = v; set({ unit_prices: next }) }} />
        ))}
        {custom && <Select label="Al agotarse lo incluido y las recargas" value={value.on_exhausted ?? ''} onChange={(e) => set({ on_exhausted: (e.target.value || undefined) as OnExhausted | undefined })}>
          <option value="">Como el estándar ({book?.on_exhausted === 'bloquear' ? 'bloquear' : 'cobrar el excedente'})</option>
          <option value="cobrar">Cobrar el excedente en la cuenta siguiente</option><option value="bloquear">Bloquear hasta que recargue</option>
        </Select>}
      </div>
      <p className="text-[14px] text-soft">{pricingSummary(value, book)}</p>
    </fieldset>
  )
}
