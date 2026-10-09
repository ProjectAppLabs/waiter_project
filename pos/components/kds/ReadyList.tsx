'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { elapsedSeconds, formatClock } from '@/lib/domain/kitchen'
import type { KitchenTicket } from '@/lib/services/kitchen'

interface ReadyListProps { tickets: KitchenTicket[]; tableNumberOf: (tableId: number) => number; now: number }

const waiting = (t: KitchenTicket) => t.lines.filter((l) => l.readyAt && !l.servedAt)

// Columna "Listos por entregar": lo que cocina ya sacó al pase y sigue ahí. Es una lista de espera, no un
// mando: quien lo marca entregado es el mesero cuando lo deja en la mesa, desde su propia pantalla.
// El cronómetro es para cantarlo en voz alta cuando un plato lleva demasiado esperando.
export function ReadyList({ tickets, tableNumberOf, now }: ReadyListProps) {
  const t = useTranslations('kds')
  const rows = tickets.flatMap((ticket) => waiting(ticket).map((line) => ({ ticket, line })))
  return (
    <aside aria-label={t('ready')} className="w-full lg:w-[340px] shrink-0 max-h-[35dvh] lg:max-h-none bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
      <header className="h-16 px-5 flex items-center justify-between border-b border-border">
        <h2 className="text-[18px] font-semibold text-ink">{t('ready')}</h2>
        <span className="min-w-7 h-7 px-2 rounded-md bg-success-soft text-success-ink grid place-items-center text-[14px] font-semibold">{rows.length}</span>
      </header>
      {rows.length === 0 && <KitEmptyState icon="check" title={t('readyEmpty')} />}
      <ul className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {rows.map(({ ticket, line }) => {
          const n = tableNumberOf(ticket.tableId)
          return (
            <li key={line.id} aria-label={t('table', { n })} className="p-3 rounded-md border border-border bg-surface flex items-center gap-3">
              <span aria-hidden className="w-11 h-11 shrink-0 rounded-md bg-success-soft text-success-ink grid place-items-center text-[16px] font-semibold">{n}</span>
              <span className="flex-1 min-w-0 flex flex-col leading-tight">
                <span className="text-[16px] font-semibold text-ink truncate">{line.qty > 1 && <span className="tabular">{line.qty}× </span>}{line.name}</span>
                <span className="text-[13px] text-soft">{t('table', { n })} · {t('readyAgo')} <span className="font-mono tabular text-success-ink">{formatClock(elapsedSeconds(line.readyAt ?? ticket.firedAt, now))}</span></span>
              </span>
              <span aria-hidden className="shrink-0 text-dim"><Icon name="user" size={20} /></span>
            </li>
          )
        })}
      </ul>
      <p className="px-4 py-2.5 border-t border-border text-[13px] text-dim text-center">{t('waitingWaiter')}</p>
    </aside>
  )
}
