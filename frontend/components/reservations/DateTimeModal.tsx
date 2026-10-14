'use client'

import { useTranslations } from 'next-intl'
import { Fragment, useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { isClosedOn, lastBookableDay, type Schedule } from '@/lib/domain/reservationHours'
import { hourLabel, isoDate, monthGrid, slotTaken, type Slot } from '@/lib/domain/reservations'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

// Modal "Select Date / Select Time" del kit: calendario mensual a la izquierda, franjas de 30 min a la
// derecha y el resumen en el pie. Las franjas son las del día que se toca: se piden al servidor cada vez (`loadSlots`),
// porque cada día tiene su horario y solo hoy tiene horas pasadas. Antes se pintaban siempre las del día ya cargado y,
// de noche, todas venían «pasadas»: no se podía reservar para otro día. Los días ya pasados y los que el horario
// cierra (`schedule`) no se pueden elegir.
export function DateTimeModal({ open, onClose, date, time, loadSlots, schedule, onPick }: {
  open: boolean; onClose: () => void; date: string | null; time: number | null
  loadSlots: (date: string) => Promise<Slot[]>; schedule: Schedule | null
  onPick: (date: string, time: number) => void
}) {
  const t = useTranslations('reservations.dateTime')
  const initial = date ? new Date(`${date}T00:00:00`) : new Date()
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [day, setDay] = useState<string | null>(date)
  const [slot, setSlot] = useState<number | null>(time)
  const [loaded, setLoaded] = useState<{ day: string; slots: Slot[] } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open || !day) return
    let alive = true
    loadSlots(day).then((list) => { if (alive) { setLoaded({ day, slots: list }); setFailed(false) } }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [open, day, loadSlots])
  const slots = loaded && loaded.day === day ? loaded.slots : null // null = todavía cargando las de ese día
  const slotOk = slot !== null && !!slots?.some((s) => s.time === slot && !slotTaken(s))
  const now = new Date(), today = isoDate(now.getFullYear(), now.getMonth(), now.getDate())
  const lastDay = schedule ? lastBookableDay(schedule.rules, today) : null // ventana máxima de reservas
  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const move = (delta: number) => setCursor(({ year, month }) => {
    const next = new Date(year, month + delta, 1)
    return { year: next.getFullYear(), month: next.getMonth() }
  })

  return (
    <Modal open={open} onClose={onClose} title={t('title')} size="wide" footer={
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-4 text-[15px] text-soft">
          <span className="flex items-center gap-2"><Icon name="reservations" size={18} />{day ? new Date(`${day}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'long' }) : t('notSelected')}</span>
          <span className="flex items-center gap-2"><Icon name="clock" size={18} />{slotOk && slot !== null ? hourLabel(slot) : t('notSelected')}</span>
        </span>
        <span className="flex gap-3">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={!day || !slotOk} onClick={() => { if (day && slot !== null && slotOk) onPick(day, slot) }}>{t('apply')}</Button>
        </span>
      </div>
    }>
      <div className="h-full flex">
        <section className="flex-1 p-6 border-r border-border">
          <header className="flex items-center justify-between mb-4">
            <span className="text-[17px] font-semibold text-ink first-letter:uppercase">{monthName}</span>
            <span className="flex gap-1">
              <button type="button" aria-label={t('prevMonth')} onClick={() => move(-1)} className="w-9 h-9 rounded-md border border-border grid place-items-center text-soft"><Icon name="chevronLeft" size={18} /></button>
              <button type="button" aria-label={t('nextMonth')} onClick={() => move(1)} className="w-9 h-9 rounded-md border border-border grid place-items-center text-soft"><Icon name="chevronRight" size={18} /></button>
            </span>
          </header>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => <span key={w} className="h-8 grid place-items-center text-[13px] font-semibold text-dim">{w}</span>)}
            {monthGrid(cursor.year, cursor.month).map((d, i) => {
              if (d === null) return <span key={`gap-${i}`} />
              const value = isoDate(cursor.year, cursor.month, d)
              const closed = schedule ? isClosedOn(schedule, value) : false
              const off = value < today || closed || (lastDay !== null && value > lastDay)
              return (
                <button key={value} type="button" aria-pressed={day === value} disabled={off} onClick={() => setDay(value)}
                  aria-label={closed ? t('closedDay', { day: d }) : undefined} aria-current={value === today ? 'date' : undefined}
                  className={cn('h-10 rounded-md text-[15px]', day === value ? 'bg-primary text-primary-ink font-semibold' : off ? 'text-dim opacity-50' : 'text-ink hover:bg-muted',
                    closed && 'line-through', value === today && day !== value && 'ring-1 ring-inset ring-primary')}>{d}</button>
              )
            })}
          </div>
          <p className="mt-4 text-[13px] text-dim">{t('closedHint')}{lastDay ? ` ${t('windowHint', { days: schedule?.rules.maxDays ?? 0 })}` : ''}</p>
        </section>
        <section className="w-[280px] shrink-0 p-6 overflow-auto">
          <p className="mb-3 text-[15px] font-semibold text-ink">{t('chooseTime')}</p>
          {!day ? <p className="text-[14px] text-soft">{t('pickDayFirst')}</p>
            : failed ? <p role="alert" className="text-[14px] text-danger-ink">{t('slotsFailed')}</p>
            : slots === null ? <p className="text-[14px] text-soft">{t('loadingSlots')}</p>
            : slots.length === 0 ? <p className="text-[14px] text-soft">{t('closedNoSlots')}</p>
            : slots.every(slotTaken) ? <p className="mb-3 text-[14px] text-soft">{t('allPast')}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            {(day && !failed ? slots ?? [] : []).map((s, i, all) => (
              <Fragment key={s.time}>
                {/* Un salto de más de media hora es el hueco entre dos franjas del día (almuerzo y cena). */}
                {i > 0 && s.time - all[i - 1].time > 0.5 && <span aria-hidden className="col-span-2 my-1 h-px bg-border" />}
                <button type="button" disabled={slotTaken(s)} title={s.soon ? t('tooSoon') : undefined} aria-pressed={slot === s.time} onClick={() => setSlot(s.time)}
                  className={cn('h-11 rounded-md border text-[15px] font-semibold',
                    slot === s.time ? 'bg-primary border-primary text-primary-ink' : slotTaken(s) ? 'border-border text-dim opacity-50' : 'border-border text-soft hover:bg-muted')}>{s.label}</button>
              </Fragment>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  )
}
