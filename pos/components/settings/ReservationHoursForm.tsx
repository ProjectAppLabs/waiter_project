'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import {
  DAY_KEYS, MAX_NOTE, NOTICE_CHOICES, TIME_OPTIONS, WINDOW_CHOICES, copyDay, noticeLabel, hourLabel, rangesError, removeOverride, sameSchedule, scheduleError, setDay, suggestRange, totalHours,
  upsertOverride, weekSpan, type DateOverride, type DayKey, type Range, type Schedule,
} from '@/lib/domain/reservationHours'
import { isoDate } from '@/lib/domain/reservations'
import { getSchedule, saveSchedule } from '@/lib/services/reservationHours'
import { toast } from '@/lib/stores/toastStore'
import { cn } from '@/lib/utils'

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const rangesText = (ranges: Range[]) => ranges.map(([a, b]) => `${hourLabel(a)}–${hourLabel(b)}`).join(' · ')

// Los textos del editor: el de reservas («reservations.hours») o el de atención del local («openingHours»).
const Texts = createContext('reservations.hours')
const useTexts = () => useTranslations(useContext(Texts))

// Horario de reservas (Configuración → Horario de reservas), con el modelo de cal.com: un horario semanal con varias
// franjas por día y «copiar a otros días», más fechas especiales que mandan sobre su día de la semana. El servidor
// valida lo mismo y es quien decide las horas que ofrece el asistente de reservas.
export function ReservationHoursForm({ configId }: { configId: number }) {
  return <ScheduleForm key={configId} texts="reservations.hours" rules load={() => getSchedule(configId)} save={(s) => saveSchedule(configId, s)} />
}

// El editor de un horario semanal con fechas especiales. `rules` muestra la antelación (solo reservas); `extra` va al
// pie, junto a guardar (por ejemplo, «quitar el horario»).
// `pending`: lo cargado es una propuesta que aún no está guardada (se puede guardar sin cambiarla).
export function ScheduleForm({ texts, load, save: persist, rules = false, extra, pending = false }: {
  texts: string; load: () => Promise<Schedule>; save: (s: Schedule) => Promise<Schedule>; rules?: boolean; extra?: ReactNode; pending?: boolean
}) {
  const t = useTranslations(texts)
  const [saved, setSaved] = useState<Schedule | null>(null)
  const [draft, setDraft] = useState<Schedule | null>(null)
  const [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [copying, setCopying] = useState<DayKey | null>(null)

  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    load().then((s) => { if (alive) { setSaved(s); setDraft(s); setFailed(false) } }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
    // Se carga al montar y al reintentar; quien lo usa cambia de horario con `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  if (failed) return <p role="alert" className="text-[15px] text-danger-ink flex items-center gap-3">{t('loadFailed')}<Button onClick={() => setAttempt((n) => n + 1)}>{t('retry')}</Button></p>
  if (!draft || !saved) return null

  const problem = scheduleError(draft), dirty = pending || !sameSchedule(draft, saved)
  async function save() {
    if (!draft || problem) return
    setBusy(true); setError('')
    try { const s = await persist(draft); setSaved(s); setDraft(s); toast({ title: t('saved') }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <Texts.Provider value={texts}>
    <div className="flex flex-col gap-6 max-w-[1080px]">
      <p className="text-[15px] text-soft max-w-[70ch]">{t('intro')}</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
        <section aria-label={t('weekly')} className="rounded-lg border border-border divide-y divide-border">
          {DAY_KEYS.map((day) => {
            const ranges = draft.weekly[day], name = t(`days.${day}`), next = suggestRange(ranges), bad = rangesError(ranges)
            return (
              <div key={day} role="group" aria-label={name} className="px-4 py-3">
                <div className="flex items-start gap-4">
                  <span className="w-[150px] shrink-0 h-11 flex items-center gap-3">
                    <Toggle checked={ranges.length > 0} label={t('open', { day: name })} onChange={(on) => setDraft(setDay(draft, day, on ? [suggestRange([]) as Range] : []))} />
                    <span className={cn('text-[15px] font-semibold', ranges.length ? 'text-ink' : 'text-dim')}>{name}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    {ranges.length === 0 ? <span className="h-11 flex items-center text-[15px] text-dim">{t('closed')}</span>
                      : <RangesEditor ranges={ranges} dayName={name} onChange={(r) => setDraft(setDay(draft, day, r))} />}
                  </div>
                  <span className="shrink-0 flex gap-1">
                    <IconButton icon="plus" label={t('addRangeTo', { day: name })} disabled={!ranges.length || !next} onClick={() => next && setDraft(setDay(draft, day, [...ranges, next]))} />
                    <IconButton icon="copy" label={t('copyFrom', { day: name })} disabled={!!bad} pressed={copying === day} onClick={() => setCopying(copying === day ? null : day)} />
                  </span>
                </div>
                {bad && <p role="alert" className="mt-1 ml-[166px] text-[13px] text-danger-ink">{t(`errors.${bad}`)}</p>}
                {copying === day && <CopyPanel from={day} onCancel={() => setCopying(null)}
                  onApply={(to) => { setDraft(copyDay(draft, day, to)); setCopying(null); toast({ title: t('copied') }) }} />}
              </div>
            )
          })}
        </section>
        <WeekPreview schedule={draft} />
      </div>

      <Overrides schedule={draft} onChange={setDraft} />

      {rules && <section aria-label={t('rules')} className="rounded-lg border border-border">
        <header className="px-4 py-3 border-b border-border">
          <h3 className="text-[15px] font-semibold text-ink">{t('rules')}</h3>
          <p className="text-[14px] text-soft">{t('rulesIntro')}</p>
        </header>
        <div className="p-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-soft">{t('minNotice')}
            <select value={draft.rules.minNotice} onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, minNotice: Number(e.target.value) } })}
              className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-ink font-normal">
              {NOTICE_CHOICES.map((m) => <option key={m} value={m}>{m ? t('minNoticeValue', { time: noticeLabel(m) }) : t('minNoticeNone')}</option>)}
            </select>
            <span className="font-normal text-dim">{t('minNoticeHint')}</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-soft">{t('maxDays')}
            <select value={draft.rules.maxDays} onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, maxDays: Number(e.target.value) } })}
              className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-ink font-normal">
              {WINDOW_CHOICES.map((d) => <option key={d} value={d}>{d ? t('maxDaysValue', { days: d }) : t('maxDaysNone')}</option>)}
            </select>
            <span className="font-normal text-dim">{t('maxDaysHint')}</span>
          </label>
        </div>
      </section>}

      <footer className="sticky bottom-0 -mx-5 -mb-5 px-5 py-4 bg-surface border-t border-border flex flex-wrap items-center gap-3">
        <span role="status" className="text-[14px] text-soft">{problem ? t('fixFirst') : dirty ? t('unsaved') : ''}</span>
        {error && <span role="alert" className="text-[14px] text-danger-ink">{error}</span>}
        <span className="ml-auto flex flex-wrap gap-3">
          {extra}
          <Button disabled={!dirty || busy} onClick={() => { setDraft(saved); setCopying(null); setError('') }}>{t('discard')}</Button>
          <Button variant="primary" disabled={!dirty || busy || !!problem} onClick={() => void save()}>{busy ? t('saving') : t('save')}</Button>
        </span>
      </footer>
    </div>
    </Texts.Provider>
  )
}

function IconButton({ icon, label, onClick, disabled, pressed }: { icon: 'plus' | 'copy' | 'trash' | 'edit'; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
      className={cn('w-11 h-11 grid place-items-center rounded-md text-soft hover:bg-muted hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent', pressed && 'bg-muted text-ink')}>
      <Icon name={icon} size={18} />
    </button>
  )
}

// Franjas de un día: inicio – fin – quitar. Cambiar una hora nunca reordena ni corrige por su cuenta: si queda mal,
// el día lo dice y no deja guardar.
function RangesEditor({ ranges, dayName, onChange }: { ranges: Range[]; dayName: string; onChange: (ranges: Range[]) => void }) {
  const t = useTexts()
  const set = (i: number, side: 0 | 1, value: number) => onChange(ranges.map((r, j) => (j === i ? (side === 0 ? [value, r[1]] : [r[0], value]) : r)))
  const select = 'h-11 rounded-md border border-border bg-surface px-2 text-[15px] text-ink tabular-nums'
  return (
    <ul className="flex flex-col gap-2">
      {ranges.map(([from, to], i) => (
        <li key={i} className="flex items-center gap-2">
          <select aria-label={t('from', { n: i + 1, day: dayName })} className={select} value={from} onChange={(e) => set(i, 0, Number(e.target.value))}>
            {TIME_OPTIONS.filter((h) => h < 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <span aria-hidden className="text-dim">–</span>
          <select aria-label={t('to', { n: i + 1, day: dayName })} className={select} value={to} onChange={(e) => set(i, 1, Number(e.target.value))}>
            {TIME_OPTIONS.filter((h) => h > 0).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <IconButton icon="trash" label={t('removeRange', { n: i + 1, day: dayName })} onClick={() => onChange(ranges.filter((_, j) => j !== i))} />
        </li>
      ))}
    </ul>
  )
}

function CopyPanel({ from, onApply, onCancel }: { from: DayKey; onApply: (to: DayKey[]) => void; onCancel: () => void }) {
  const t = useTexts()
  const others = DAY_KEYS.filter((d) => d !== from)
  const [to, setTo] = useState<DayKey[]>([])
  const chip = (on: boolean) => cn('h-10 px-3 rounded-full border text-[14px] font-medium', on ? 'bg-primary border-primary text-primary-ink' : 'border-border text-soft hover:text-ink')
  return (
    <div role="group" aria-label={t('copyTitle', { day: t(`days.${from}`) })} className="mt-3 ml-[166px] p-3 rounded-md bg-canvas border border-border flex flex-wrap items-center gap-2">
      <span className="w-full text-[14px] text-soft">{t('copyTitle', { day: t(`days.${from}`) })}</span>
      <button type="button" aria-pressed={to.length === others.length} className={chip(to.length === others.length)} onClick={() => setTo(to.length === others.length ? [] : others)}>{t('copyAll')}</button>
      {others.map((d) => (
        <button key={d} type="button" aria-pressed={to.includes(d)} className={chip(to.includes(d))} onClick={() => setTo(to.includes(d) ? to.filter((x) => x !== d) : [...to, d])}>{t(`days.${d}`)}</button>
      ))}
      <span className="ml-auto flex gap-2">
        <Button onClick={onCancel}>{t('copyCancel')}</Button>
        <Button variant="primary" disabled={!to.length} onClick={() => onApply(to)}>{t('copyApply')}</Button>
      </span>
    </div>
  )
}

// La semana de un vistazo, como una agenda: una columna por día y un bloque por franja. Es solo lectura; sirve para
// ver de golpe un día olvidado o una franja que quedó corta.
function WeekPreview({ schedule }: { schedule: Schedule }) {
  const t = useTexts()
  const [first, last] = weekSpan(schedule), total = last - first
  const marks = Array.from({ length: Math.floor(total / 2) + 1 }, (_, i) => first + i * 2).filter((h) => h <= last)
  return (
    <section aria-label={t('preview')} className="rounded-lg border border-border p-4 xl:sticky xl:top-0">
      <h3 className="text-[14px] font-semibold text-ink mb-3">{t('preview')}</h3>
      <div className="flex gap-2">
        <div className="relative w-9 shrink-0 h-[280px] mt-6" aria-hidden>
          {marks.map((h) => <span key={h} className="absolute right-0 -translate-y-1/2 text-[11px] text-dim tabular-nums" style={{ top: `${((h - first) / total) * 100}%` }}>{hourLabel(h)}</span>)}
        </div>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {DAY_KEYS.map((day) => {
            const ranges = schedule.weekly[day]
            return (
              <div key={day} className="flex flex-col items-center gap-1" title={ranges.length ? rangesText(ranges) : t('closed')}>
                <span className={cn('h-5 text-[12px] font-semibold', ranges.length ? 'text-soft' : 'text-dim')}>{t(`daysShort.${day}`)}</span>
                <div className={cn('relative w-full h-[280px] rounded', ranges.length ? 'bg-muted/60' : 'bg-[repeating-linear-gradient(135deg,var(--kit-border)_0_2px,transparent_2px_7px)]')}>
                  {ranges.filter(([a, b]) => a < b).map(([a, b], i) => (
                    <span key={i} className="absolute inset-x-0 rounded bg-primary/85" style={{ top: `${((a - first) / total) * 100}%`, height: `${((b - a) / total) * 100}%` }} />
                  ))}
                </div>
                <span className="text-[11px] text-dim tabular-nums">{ranges.length ? t('previewHours', { hours: totalHours(ranges) }) : '—'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const EMPTY: DateOverride = { date: '', ranges: [], note: '' }

function Overrides({ schedule, onChange }: { schedule: Schedule; onChange: (s: Schedule) => void }) {
  const t = useTexts()
  const [form, setForm] = useState<DateOverride | null>(null)
  const [editing, setEditing] = useState<string | null>(null) // fecha original de la que se está editando
  const now = new Date(), today = isoDate(now.getFullYear(), now.getMonth(), now.getDate())
  const bad = form ? rangesError(form.ranges) : null
  const replaces = !!form?.date && form.date !== editing && schedule.overrides.some((o) => o.date === form.date)
  const close = () => { setForm(null); setEditing(null) }
  function apply() {
    if (!form || !form.date || bad) return
    const base = editing && editing !== form.date ? removeOverride(schedule, editing) : schedule
    onChange(upsertOverride(base, { ...form, note: form.note.trim() }))
    close()
  }
  return (
    <section aria-label={t('special')} className="rounded-lg border border-border">
      <header className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-border">
        <div className="flex-1 min-w-64">
          <h3 className="text-[15px] font-semibold text-ink">{t('special')}</h3>
          <p className="text-[14px] text-soft">{t('specialIntro')}</p>
        </div>
        {!form && <Button onClick={() => { setForm(EMPTY); setEditing(null) }}><Icon name="plus" size={18} />{t('specialAdd')}</Button>}
      </header>
      {form && (
        <div className="p-4 border-b border-border bg-canvas flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-[13px] font-medium text-soft">{t('specialDate')}
              <input type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-ink" />
            </label>
            <label className="flex-1 min-w-56 flex flex-col gap-1 text-[13px] font-medium text-soft">{t('specialNote')}
              <input type="text" maxLength={MAX_NOTE} value={form.note} placeholder={t('specialNotePlaceholder')} onChange={(e) => setForm({ ...form, note: e.target.value })} className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-ink font-normal" />
            </label>
          </div>
          <div className="flex items-center gap-3 min-h-11">
            <Toggle checked={form.ranges.length > 0} label={t('specialOpen')} onChange={(on) => setForm({ ...form, ranges: on ? [suggestRange([]) as Range] : [] })} />
            <span className="text-[15px] text-ink">{form.ranges.length ? t('specialOpen') : t('closed')}</span>
          </div>
          {form.ranges.length > 0 && (
            <div className="flex items-start gap-2">
              <RangesEditor ranges={form.ranges} dayName={t('specialThatDay')} onChange={(ranges) => setForm({ ...form, ranges })} />
              <IconButton icon="plus" label={t('addRange')} disabled={!suggestRange(form.ranges)} onClick={() => { const next = suggestRange(form.ranges); if (next) setForm({ ...form, ranges: [...form.ranges, next] }) }} />
            </div>
          )}
          {bad && <p role="alert" className="text-[13px] text-danger-ink">{t(`errors.${bad}`)}</p>}
          {replaces && <p className="text-[13px] text-progress-ink">{t('specialReplaces')}</p>}
          <div className="flex gap-3">
            <Button onClick={close}>{t('specialCancel')}</Button>
            <Button variant="primary" disabled={!form.date || !!bad} onClick={apply}>{editing ? t('specialUpdate') : t('specialSave')}</Button>
          </div>
        </div>
      )}
      {schedule.overrides.length === 0 ? <p className="px-4 py-4 text-[15px] text-dim">{t('specialEmpty')}</p> : (
        <ul className="divide-y divide-border">
          {schedule.overrides.map((o) => (
            <li key={o.date} className={cn('px-4 py-2 flex items-center gap-3', o.date < today && 'opacity-50')}>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-ink first-letter:uppercase">{longDate(o.date)}</span>
                <span className="block text-[14px] text-soft truncate">{o.ranges.length ? rangesText(o.ranges) : t('closed')}{o.note ? `, ${o.note}` : ''}</span>
              </span>
              <IconButton icon="edit" label={t('specialEdit', { date: longDate(o.date) })} onClick={() => { setForm({ ...o, ranges: o.ranges.map(([a, b]) => [a, b] as Range) }); setEditing(o.date) }} />
              <IconButton icon="trash" label={t('specialRemove', { date: longDate(o.date) })} onClick={() => { onChange(removeOverride(schedule, o.date)); if (editing === o.date) close() }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
