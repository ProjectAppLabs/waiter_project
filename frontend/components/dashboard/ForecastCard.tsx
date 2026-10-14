'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { LoadingRegion, Skeleton } from '@/components/kit/Skeleton'
import { formatCop } from '@/lib/domain/money'
import { MIN_SALES_DAYS, type Forecast } from '@/lib/domain/insights'
import { cn } from '@/lib/utils'

const monthName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { month: 'long' })

// Venta esperada el mes que viene, con su rango y de dónde sale. Las barras son las semanas reales del historial; la
// última, rayada, es la semana promedio que implica la predicción: se ve de un vistazo si es creíble. Con poco historial
// no se inventa una cifra: se dice cuántos días faltan.
export function ForecastCard({ forecast, loaded }: { forecast: Forecast | null; loaded: boolean }) {
  const t = useTranslations('dashboard.forecast')
  const month = forecast ? monthName(forecast.month) : ''
  const weeks = forecast?.weekly.slice(-8) ?? []
  const projectedWeek = forecast?.ready ? (forecast.total / new Date(Number(forecast.month.slice(0, 4)), Number(forecast.month.slice(5, 7)), 0).getDate()) * 7 : 0
  const max = Math.max(1, projectedWeek, ...weeks.map((w) => w.total))
  const change = forecast ? Math.round((forecast.trend - 1) * 100) : 0
  return (
    <section aria-label={t('title', { month })} className="bg-surface border border-border rounded-lg flex flex-col min-w-0">
      <h2 className="px-4 h-16 shrink-0 flex items-center text-[17px] font-semibold text-ink border-b border-border first-letter:uppercase">{loaded && forecast ? t('title', { month }) : t('titlePlain')}</h2>
      {!loaded ? (
        <LoadingRegion label={t('loading')} className="p-4 flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex flex-col gap-2"><Skeleton className="h-3.5 w-56" /><Skeleton className="h-3.5 w-36" /></div>
          <div className="flex items-end gap-1.5 h-24">{[70, 80, 75, 85, 90, 88, 95, 100, 92].map((h, i) => <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />)}</div>
        </LoadingRegion>
      )
        : !forecast ? <p role="alert" className="p-4 text-[15px] text-soft">{t('failed')}</p>
        : !forecast.ready ? (
          <div className="p-4 flex flex-col gap-2">
            <p className="text-[16px] font-semibold text-ink">{t('notReadyTitle')}</p>
            <p className="text-[14px] text-soft">{t('notReadyBody', { have: forecast.salesDays, need: MIN_SALES_DAYS })}</p>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-4">
            <div>
              <p className="text-[30px] leading-none font-semibold text-ink tabular">$ {formatCop(forecast.total)}</p>
              <p className="mt-2 text-[14px] text-soft">{t('range', { low: formatCop(forecast.low), high: formatCop(forecast.high) })}</p>
              <p className="text-[14px] text-soft">{t('orders', { count: forecast.orders })}</p>
            </div>
            <div className="flex items-end gap-1.5 h-24" role="img" aria-label={t('chartLabel', { weeks: weeks.length })}>
              {weeks.map((w) => <span key={w.week} title={`$ ${formatCop(w.total)}`} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${Math.max(3, (w.total / max) * 100)}%` }} />)}
              <span title={`$ ${formatCop(Math.round(projectedWeek))}`} className="flex-1 rounded-sm border border-primary bg-[repeating-linear-gradient(135deg,var(--kit-primary)_0_2px,transparent_2px_6px)]" style={{ height: `${Math.max(3, (projectedWeek / max) * 100)}%` }} />
            </div>
            <p className="text-[13px] text-dim">{t('chartHint', { month })}</p>
            <p className={cn('flex items-center gap-1 text-[14px] font-medium', change > 0 ? 'text-success-ink' : change < 0 ? 'text-danger-ink' : 'text-soft')}>
              {change !== 0 && <Icon name={change > 0 ? 'arrowUp' : 'arrowDown'} size={16} />}
              {change === 0 ? t('trendFlat') : t(change > 0 ? 'trendUp' : 'trendDown', { percent: Math.abs(change) })}
            </p>
            <p className="text-[13px] text-dim">{t('method', { days: forecast.salesDays })}</p>
          </div>
        )}
    </section>
  )
}
