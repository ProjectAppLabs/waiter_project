'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { StatusPill, type PillTone } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { fromTicket } from '@/lib/domain/comanda'
import { elapsedSeconds, formatClock, ticketMood, type TicketMood } from '@/lib/domain/kitchen'
import { BAR_SCALE_MIN, barFill, barTone } from '@/lib/domain/tableState'
import type { KitchenTicket } from '@/lib/services/kitchen'
import { usePrintStore } from '@/lib/stores/printStore'
import { cn } from '@/lib/utils'

const TONE: Record<TicketMood, PillTone> = { late: 'danger', attention: 'progress', fresh: 'success', normal: 'info' }
const EDGE: Record<TicketMood, string> = { late: 'border-danger', attention: 'border-progress', fresh: 'border-success', normal: 'border-border' }
const FILL = { ok: 'bg-success', warn: 'bg-progress', late: 'bg-danger' }
const MARKS = [12, 18]

interface TicketCardProps { ticket: KitchenTicket; tableNumber: number; now: number; onStart?: (courseId: number) => void; onReady: (courseId: number) => void; onReadyDish: (lineId: number) => void }

// Tarjeta de comanda con la estructura de la tarjeta de pedido del kit (Order / Ipad View.png):
// cabecera "Pedido# / tipo", mesa como avatar, banda de estado con cronómetro, tabla Ítems / Cant. y botón al pie.
// Cada plato tiene su "Listo" porque salen de uno en uno; el del pie saca la comanda entera de una vez.
export function TicketCard({ ticket, tableNumber, now, onStart, onReady, onReadyDish }: TicketCardProps) {
  const t = useTranslations('kds')
  const seconds = elapsedSeconds(ticket.firedAt, now)
  const minutes = Math.floor(seconds / 60)
  const mood = ticketMood(ticket, now)
  const started = Boolean(ticket.preparationAt || ticket.readyAt || ticket.lines.some((l) => l.readyAt))
  const cooking = ticket.lines.filter((l) => !l.readyAt)
  const dishes = cooking.reduce((acc, l) => acc + l.qty, 0)
  const printComanda = usePrintStore((s) => s.printComanda)
  // Para llevar y domicilio no tienen mesa: la tarjeta dice el tipo de servicio.
  const atTable = !ticket.service || ticket.service === 'dine_in'
  const kind = atTable ? t('typeTable') : t(ticket.service === 'takeout' ? 'typeTakeout' : 'typeDelivery')
  return (
    <article aria-label={atTable ? t('table', { n: tableNumber }) : `${kind} ${ticket.tracking}`} className={cn('bg-surface rounded-lg border flex flex-col overflow-hidden text-ink', EDGE[mood])}>
      <header className="h-10 px-4 flex items-center justify-between gap-3 bg-muted text-[13px] text-soft">
        <span>{t('order')} <span className="font-semibold text-ink">{ticket.tracking}</span> / {kind}</span>
        <span className="truncate">{ticket.waiter}</span>
      </header>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="w-11 h-11 rounded-md bg-primary text-primary-ink grid place-items-center text-[16px] font-semibold">{atTable ? tableNumber : <Icon name={ticket.service === 'delivery' ? 'delivery' : 'bag'} size={20} />}</span>
          <div className="min-w-0"><p className="text-[13px] text-soft">{kind}</p><h2 className="text-[16px] font-semibold leading-tight">{atTable ? t('table', { n: tableNumber }) : ticket.tracking}</h2></div>
          <span className={cn('ml-auto font-mono tabular text-[30px] font-semibold leading-none', mood === 'late' && 'text-danger')}>{formatClock(seconds)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusPill tone={TONE[mood]} icon={mood === 'late' ? 'alarm' : 'clock'}>{t(started ? 'preparing' : 'received')}</StatusPill>
          {mood === 'late' && <span>{t('mood.late')}</span>}
          <span className="text-[14px] text-soft">{t('dishes', { n: dishes })}</span>
        </div>
        <div>
          <div className="relative h-1.5 rounded-full bg-muted">
            <span className={cn('absolute inset-y-0 left-0 rounded-full', FILL[barTone(minutes)])} style={{ width: `${barFill(minutes)}%` }} />
            {MARKS.map((m) => <span key={m} aria-hidden className="absolute -top-0.5 -bottom-0.5 w-px bg-dim" style={{ left: `${(m / BAR_SCALE_MIN) * 100}%` }} />)}
          </div>
          <div className="relative h-4 mt-1 text-[12px] text-dim font-mono tabular">
            <span className="absolute left-0">0</span>
            {MARKS.map((m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: `${(m / BAR_SCALE_MIN) * 100}%` }}>{m}</span>)}
            <span className="absolute right-0">{BAR_SCALE_MIN} {t('minutes')}</span>
          </div>
        </div>
        {ticket.note && <p className="px-3 py-2 rounded-sm bg-progress-soft text-progress-ink text-[14px] font-medium flex items-start gap-2"><Icon name="alert" size={18} className="shrink-0 mt-0.5" />{ticket.note}</p>}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 h-9 items-center bg-muted text-[13px] text-soft"><span>{t('items')}</span><span>{t('qty')}</span><span aria-hidden className="w-[54px]" /></div>
          <ul>
            {ticket.lines.map((l) => {
              const done = Boolean(l.readyAt)
              return (
                <li key={l.id} className={cn('grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-t border-border items-center', done && 'text-dim')}>
                  <div className="min-w-0 leading-tight"><span className={cn('text-[16px] font-medium', done && 'line-through')}>{l.name}</span>{(l.options ?? []).length > 0 && <p className="text-[14px] text-soft">+ {l.options!.join(' · ')}</p>}{l.note && <p className="text-[14px] text-progress-ink">{t('note')}: {l.note}</p>}</div>
                  <span className="font-mono tabular text-[16px] font-semibold">{l.qty}×</span>
                  {done ? (
                    <span className="w-[54px] inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-success-ink"><Icon name="check" size={13} />{t('dishReady')}</span>
                  ) : (
                    <button type="button" disabled={!started} onClick={() => onReadyDish(l.id)}
                      className="w-[54px] h-9 rounded-sm border border-border bg-surface text-[14px] font-semibold text-ink grid place-items-center">
                      {t('readyBtn')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <div className="px-4 pb-4 mt-auto flex gap-2">
        <Button aria-label={t('print.button')} title={t('print.button')} onClick={() => printComanda({ ...fromTicket(ticket), place: atTable ? { kind: 'table', number: tableNumber } : fromTicket(ticket).place })}><Icon name="printer" size={18} /></Button>
        <Button variant="primary" className="flex-1" onClick={() => started ? onReady(ticket.id) : onStart?.(ticket.id)}><Icon name="checks" size={18} />{t(started ? 'readyAll' : 'startPreparation')}</Button>
      </div>
    </article>
  )
}
