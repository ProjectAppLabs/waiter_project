'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { LoadingRegion, Skeleton } from '@/components/kit/Skeleton'
import type { DishRank, DishStats } from '@/lib/domain/insights'
import { cn } from '@/lib/utils'

// Lo que más y lo que menos se pide en los últimos 28 días. La barra compara dentro de cada lista; la flecha dice si el
// plato va subiendo o bajando frente a los 28 días anteriores, y la cifra de la derecha cuántas unidades se esperan el
// mes que viene al ritmo actual (sirve para comprar).
export function DishStatsCard({ stats, windowDays, loaded }: { stats: DishStats | null; windowDays: number; loaded: boolean }) {
  const t = useTranslations('dashboard.dishes')
  return (
    <section aria-label={t('title')} className="bg-surface border border-border rounded-lg flex flex-col min-w-0">
      <h2 className="px-4 h-16 shrink-0 flex items-center justify-between gap-3 border-b border-border">
        <span className="text-[17px] font-semibold text-ink">{t('title')}</span><span className="text-[14px] text-soft">{t('window', { days: windowDays })}</span>
      </h2>
      {!loaded ? (
        <LoadingRegion label={t('loading')} className="grid sm:grid-cols-2 gap-6 p-4">
          {[0, 1].map((col) => (
            <div key={col} className="flex flex-col gap-4">
              <Skeleton className="h-4 w-32" />
              {[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-1.5"><div className="flex justify-between"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3.5 w-12" /></div><Skeleton className="h-2 rounded-full" /></div>)}
            </div>
          ))}
        </LoadingRegion>
      )
        : !stats ? <p role="alert" className="p-4 text-[15px] text-soft">{t('failed')}</p>
        : stats.totalQty === 0 ? <p className="p-4 text-[15px] text-soft">{t('empty')}</p> : (
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <DishList title={t('top')} rows={stats.top} tone="top" />
            <DishList title={t('bottom')} hint={t('bottomHint')} rows={stats.bottom} tone="bottom" />
          </div>
        )}
    </section>
  )
}

function DishList({ title, hint, rows, tone }: { title: string; hint?: string; rows: DishRank[]; tone: 'top' | 'bottom' }) {
  const t = useTranslations('dashboard.dishes')
  const max = Math.max(1, ...rows.map((r) => r.qty))
  return (
    <div className="p-4 flex flex-col gap-3 min-w-0">
      <div><h3 className="text-[15px] font-semibold text-ink">{title}</h3>{hint && <p className="text-[13px] text-soft">{hint}</p>}</div>
      <ol className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.productId} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-[15px]">
              <span className="flex-1 min-w-0 truncate text-ink">{r.name}</span>
              {r.change !== null && Math.abs(r.change) >= 0.05 && (
                <span className={cn('flex items-center text-[13px] font-semibold tabular', r.change > 0 ? 'text-success-ink' : 'text-danger-ink')} title={t('changeHint')}>
                  <Icon name={r.change > 0 ? 'arrowUp' : 'arrowDown'} size={14} />{Math.round(Math.abs(r.change) * 100)} %
                </span>
              )}
              <span className="font-semibold text-ink tabular">{r.qty === 0 ? t('none') : t('units', { count: Math.round(r.qty) })}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden"><span className={cn('block h-full rounded-full', tone === 'top' ? 'bg-primary' : 'bg-progress')} style={{ width: `${(r.qty / max) * 100}%` }} /></div>
            {tone === 'top' && <span className="text-[13px] text-dim">{t('nextMonth', { count: r.nextMonth })}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
