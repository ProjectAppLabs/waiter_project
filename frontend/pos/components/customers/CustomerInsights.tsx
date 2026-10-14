'use client'

import { StatusPill } from '@/components/kit/StatusPill'
import { formatCop } from '@/lib/domain/money'
import { serverDate } from '@/lib/domain/time'
import type { CoreCustomerProfile, Segment } from '@/lib/services/core/loyalty'

const SEGMENT: Record<Segment, { label: string; tone: 'success' | 'info' | 'progress' | 'danger' | 'neutral'; hint: string }> = {
  nuevo: { label: 'Nuevo', tone: 'info', hint: 'Su primer pedido fue hace poco.' },
  fiel: { label: 'Fiel', tone: 'success', hint: 'Pide seguido y hace poco.' },
  en_riesgo: { label: 'En riesgo', tone: 'progress', hint: 'Pedía seguido pero hace rato no vuelve.' },
  perdido: { label: 'Perdido', tone: 'danger', hint: 'Hace mucho no pide.' },
  ocasional: { label: 'Ocasional', tone: 'neutral', hint: 'Pide de vez en cuando.' },
}
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const CHANNEL = { pos: 'Caja', menu: 'Menú', whatsapp: 'WhatsApp' } as const
const day = (at: string | null) => (at ? serverDate(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const top = (counts: Record<string, number>) => Object.entries(counts).filter(([, n]) => n > 0).sort(([a, x], [b, y]) => y - x || Number(a) - Number(b))[0]?.[0]

// Plan D: lo que el restaurante sabe del cliente para atenderlo mejor: cuándo y cuánto pide, qué le gusta, por dónde
// pide y a dónde se le lleva. Las direcciones solo existen si el cliente autorizó guardar sus datos.
export function CustomerInsights({ profile }: { profile: CoreCustomerProfile }) {
  const i = profile.insights
  const consent = profile.consent
  const authorized = !!consent?.granted_at && !consent.revoked_at
  const hour = i ? top(i.hours) : undefined
  const weekday = i ? top(i.weekdays) : undefined
  const channel = i ? (top(i.channels) as keyof typeof CHANNEL | undefined) : undefined
  return <>
    {i && i.orders > 0 && (
      <section aria-label="Cómo pide" className="p-5 border-b border-border flex flex-col gap-3">
        <div className="flex items-center gap-2"><p className="text-[15px] font-semibold text-ink flex-1">Cómo pide</p>
          <StatusPill tone={SEGMENT[i.rfm.segment].tone}>{SEGMENT[i.rfm.segment].label}</StatusPill></div>
        <p className="text-[13px] text-soft">{SEGMENT[i.rfm.segment].hint}</p>
        <div className="grid grid-cols-2 gap-3 text-[15px]">
          <div><p className="text-[13px] text-soft">Ticket promedio</p><p className="font-semibold tabular">$ {formatCop(i.avg_ticket)}</p></div>
          <div><p className="text-[13px] text-soft">Pide cada</p><p className="font-semibold">{i.frequency_days === null ? '—' : `${Math.round(i.frequency_days)} días`}</p></div>
          <div><p className="text-[13px] text-soft">Suele pedir</p><p className="font-semibold">{weekday !== undefined ? WEEKDAYS[Number(weekday)] : '—'}{hour !== undefined ? ` · ${hour}:00` : ''}</p></div>
          <div><p className="text-[13px] text-soft">Por dónde</p><p className="font-semibold">{channel ? CHANNEL[channel] : '—'}</p></div>
          <div><p className="text-[13px] text-soft">Último pedido</p><p className="font-semibold">{day(i.last_order_at)}</p></div>
          <div><p className="text-[13px] text-soft">Total gastado</p><p className="font-semibold tabular">$ {formatCop(i.total_spent)}</p></div>
        </div>
        {i.top_products.length > 0 && <div><p className="text-[13px] text-soft">Sus favoritos</p>
          <p className="text-[15px]">{i.top_products.slice(0, 3).map((p) => `${p.name} (${p.qty})`).join(', ')}</p></div>}
      </section>
    )}
    <section aria-label="Direcciones" className="p-5 border-b border-border flex flex-col gap-2">
      <div className="flex items-center gap-2"><p className="text-[15px] font-semibold text-ink flex-1">Direcciones</p>
        <StatusPill tone={authorized ? 'success' : 'neutral'}>{authorized ? 'Autorizó sus datos' : consent?.revoked_at ? 'Retiró la autorización' : 'Sin autorización'}</StatusPill></div>
      {authorized && consent?.granted_at && <p className="text-[13px] text-soft">Desde el {day(consent.granted_at)} por {CHANNEL[consent.channel as keyof typeof CHANNEL] ?? consent.channel}.</p>}
      {profile.addresses.length === 0 ? <p className="text-[14px] text-soft">{authorized ? 'Aún no tiene direcciones guardadas.' : 'Sin su autorización no guardamos direcciones.'}</p>
        : <ul className="flex flex-col gap-2">{profile.addresses.map((a) => (
          <li key={a.id} className="rounded-md bg-muted p-3 text-[14px]"><p className="font-semibold">{a.label || 'Dirección'}</p><p>{a.text}</p>{a.details && <p className="text-soft">{a.details}</p>}
            <a className="text-primary font-semibold text-[13px]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`}>Ver en el mapa</a></li>))}</ul>}
    </section>
  </>
}
