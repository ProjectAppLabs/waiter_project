'use client'

import { useTranslations } from 'next-intl'

import { LoadingRegion, Skeleton } from '@/components/kit/Skeleton'
import { formatCop } from '@/lib/domain/money'
import type { WeekdayAverage } from '@/lib/domain/insights'
import { cn } from '@/lib/utils'

const DAYS = ['0', '1', '2', '3', '4', '5', '6'] as const

// Cuándo se vende: el promedio de cada día de la semana y las horas pico de los últimos 28 días. Es la información con
// la que se decide el personal de cada turno. El día y la hora más fuertes van resaltados.
export function PatternCard({ weekdays, hours, loaded }: { weekdays: WeekdayAverage[]; hours: { hour: number; share: number; orders: number }[]; loaded: boolean }) {
  const t = useTranslations('dashboard.pattern')
  const maxDay = Math.max(1, ...weekdays.map((w) => w.total)), maxHour = Math.max(0.0001, ...hours.map((h) => h.share))
  const hasSales = weekdays.some((w) => w.total > 0)
  const span = hours.length ? Array.from({ length: hours[hours.length - 1].hour - hours[0].hour + 1 }, (_, i) => hours[0].hour + i) : []
  return (
    <section aria-label={t('title')} className="bg-surface border border-border rounded-lg flex flex-col min-h-0 min-w-0">
      <h2 className="px-4 h-16 shrink-0 flex items-center text-[17px] font-semibold text-ink border-b border-border">{t('title')}</h2>
      {!loaded ? (
        <LoadingRegion label={t('loading')} className="p-4 flex flex-col gap-5">
          {/* Barras de alturas variadas: la forma de un gráfico, no una caja genérica. */}
          <div className="flex flex-col gap-3"><Skeleton className="h-3.5 w-40" /><div className="flex items-end gap-1.5 h-24">{[45, 60, 55, 70, 90, 100, 30].map((h, i) => <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />)}</div></div>
          <div className="flex flex-col gap-3"><Skeleton className="h-3.5 w-28" /><div className="flex items-end gap-1 h-20">{[20, 35, 60, 40, 30, 55, 85, 100, 70, 45].map((h, i) => <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />)}</div></div>
        </LoadingRegion>
      ) : !hasSales ? <p className="p-4 text-[15px] text-soft">{t('empty')}</p> : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
          <div>
            <h3 className="text-[14px] font-semibold text-ink">{t('weekdays')}</h3>
            <p className="text-[13px] text-soft mb-3">{t('weekdaysHint')}</p>
            <div className="flex items-end gap-1.5 h-24" role="img" aria-label={t('weekdaysLabel', { day: t(`days.${weekdays.reduce((a, b) => (b.total > a.total ? b : a)).weekday}`) })}>
              {weekdays.map((w) => <span key={w.weekday} title={`$ ${formatCop(Math.round(w.total))}`} className={cn('flex-1 rounded-sm', w.total === maxDay ? 'bg-primary' : 'bg-primary/35')} style={{ height: `${Math.max(3, (w.total / maxDay) * 100)}%` }} />)}
            </div>
            <div className="mt-1 flex gap-1.5">{DAYS.map((d) => <span key={d} className="flex-1 text-center text-[12px] text-dim">{t(`daysShort.${d}`)}</span>)}</div>
          </div>
          {span.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold text-ink">{t('hours')}</h3>
              <p className="text-[13px] text-soft mb-3">{t('hoursHint')}</p>
              <div className="flex items-end gap-1 h-20" role="img" aria-label={t('hoursLabel', { hour: hours.reduce((a, b) => (b.share > a.share ? b : a)).hour })}>
                {span.map((hour) => { const h = hours.find((x) => x.hour === hour); return (
                  <span key={hour} title={h ? t('hourTip', { hour, percent: Math.round(h.share * 100) }) : undefined}
                    className={cn('flex-1 rounded-sm', h?.share === maxHour ? 'bg-primary' : 'bg-primary/35')} style={{ height: `${h ? Math.max(4, (h.share / maxHour) * 100) : 2}%` }} />
                ) })}
              </div>
              <div className="mt-1 flex gap-1">{span.map((hour) => <span key={hour} className="flex-1 text-center text-[11px] text-dim tabular">{hour % 2 === span[0] % 2 ? hour : ''}</span>)}</div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
