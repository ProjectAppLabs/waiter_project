'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useOrg } from '@/components/organization/OrgContext'
import { ScheduleForm } from '@/components/settings/ReservationHoursForm'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DAY_KEYS, type DayKey, type Range, type Schedule } from '@/lib/domain/reservationHours'
import { openingHours, removeOpeningHours, saveOpeningHours, type OpeningHoursReply, type OpeningStatus } from '@/lib/services/core/business'
import { toast } from '@/lib/stores/toastStore'

// Sin horario guardado se propone uno corriente (11 a. m. a 10 p. m. todos los días) para no empezar en blanco.
const PROPOSAL: Range = [11, 22]
const NO_RULES = { minNotice: 0, maxDays: 0 }

export function toSchedule(reply: OpeningHoursReply): Schedule {
  const weekly = Object.fromEntries(DAY_KEYS.map((d) => [d, reply.hours ? (reply.hours.weekly[d] ?? []).map(([a, b]) => [Number(a), Number(b)] as Range) : [PROPOSAL]])) as Record<DayKey, Range[]>
  const overrides = (reply.hours?.overrides ?? []).map((o) => ({ date: o.date, note: o.note ?? '', ranges: o.ranges.map(([a, b]) => [Number(a), Number(b)] as Range) }))
  return { weekly, overrides, rules: NO_RULES }
}

export function statusText(t: ReturnType<typeof useTranslations>, status: OpeningStatus): string {
  if (status.abierto) return status.cierra ? t('openNow', { hora: status.cierra }) : t('openAllDay')
  return status.abre ? t('closedNow', { cuando: status.abre.cuando, hora: status.abre.hora }) : t('closedNoNext')
}

// Plan D: el dueño define cuándo abre y cierra cada sede. Fuera de ese horario el menú dice que está cerrada y cuándo
// abre, no se confirman pedidos, los domicilios van a otra sede abierta y el asistente responde con este horario. Una
// sede sin horario atiende siempre (como antes).
export function OpeningHoursView() {
  const t = useTranslations('openingHours')
  const { restaurants } = useOrg()
  const [picked, setPicked] = useState<number | null>(null)
  const venue = restaurants.find((r) => r.id === picked) ?? restaurants[0]
  const [status, setStatus] = useState<OpeningStatus | null>(null)
  const [version, setVersion] = useState(0)
  const [asking, setAsking] = useState(false)
  if (!restaurants.length) return <p className="text-soft">{t('noVenues')}</p>
  const id = venue.id
  async function load() { const reply = await openingHours(id); setStatus(reply.status); return toSchedule(reply) }
  async function save(s: Schedule) {
    const reply = await saveOpeningHours(id, { weekly: s.weekly, overrides: s.overrides })
    setStatus(reply.status)
    return toSchedule(reply)
  }
  async function remove() {
    setAsking(false)
    try { await removeOpeningHours(id); toast({ title: t('removed') }); setVersion((v) => v + 1) }
    catch (e) { toast({ title: e instanceof Error ? e.message : String(e) }) }
  }
  return (
    <section className="flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">{t('title')}</h1><p className="mt-1 text-soft">{t('subtitle')}</p></div>
      <div className="flex flex-wrap items-end gap-4">
        {restaurants.length > 1 && <label className="flex flex-col gap-1 text-[13px] font-medium text-soft">{t('venue')}
          <select value={id} onChange={(e) => { setPicked(Number(e.target.value)); setStatus(null) }}
            className="h-11 min-w-56 rounded-md border border-border bg-surface px-3 text-[15px] text-ink font-normal">
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>}
        {status && <p role="status" className="h-11 flex items-center text-[15px] font-semibold text-ink">
          {status.configurado ? statusText(t, status) : ''}</p>}
      </div>
      {status && !status.configurado && <p className="max-w-[70ch] rounded-md border border-border bg-canvas px-4 py-3 text-[15px] text-soft">{t('always')}</p>}
      <ScheduleForm key={`${id}-${version}`} texts="openingHours" load={load} save={save} pending={!!status && !status.configurado}
        extra={status?.configurado ? <Button variant="ghost" onClick={() => setAsking(true)}>{t('remove')}</Button> : null} />
      <ConfirmDialog open={asking} title={t('remove')} body={t('removeConfirm', { venue: venue.name })} confirmLabel={t('remove')} cancelLabel={t('specialCancel')}
        destructive onConfirm={() => void remove()} onCancel={() => setAsking(false)} />
    </section>
  )
}
