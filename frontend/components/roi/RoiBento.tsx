'use client'

import { useTranslations } from 'next-intl'

import { Card } from '@/components/kit/Card'
import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { KpiTile } from '@/components/ui/KpiTile'
import { formatCop } from '@/lib/domain/money'
import type { RoiMetrics } from '@/lib/domain/roi'
import { cn } from '@/lib/utils'

interface RoiBentoProps { current: RoiMetrics; history: { label: string; hoursPer100: number }[]; months: number; periodLabel: string; laborChange: number | null }

const fmt1 = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Bento del ROI con las tarjetas del kit (Dashboard / Filled.png): indicadores con icono, tarjeta con cabecera para
// la métrica norte y las fuentes de valor, píldoras de estado para los cambios. Solo tokens del kit: claro y oscuro salen solos.
export function RoiBento({ current, history, months, periodLabel, laborChange }: RoiBentoProps) {
  const t = useTranslations('admin.roi')
  const maxHours = Math.max(...history.map((h) => h.hoursPer100), 1)
  const sources = [
    { key: 'autonomous', amount: current.autonomousRevenue, color: 'bg-primary' },
    { key: 'hours', amount: current.laborSaving, color: 'bg-info' },
    { key: 'upsell', amount: current.aiSales, color: 'bg-success' },
    { key: 'errors', amount: 0, color: 'bg-border' },
  ]
  const maxSource = Math.max(...sources.map((s) => s.amount), 1)
  return (
    <div className="flex-1 min-h-0 px-5 pb-5 grid grid-cols-4 auto-rows-min content-start gap-4 overflow-y-auto">
      <section aria-label={t('hero')} className="col-span-2 rounded-lg border border-primary/30 bg-primary-soft p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between"><span className="text-[16px] text-soft">{t('hero')}</span><StatusPill tone="success" icon="clock">{t('months', { n: months })}</StatusPill></div>
        <div className="flex items-baseline gap-4">
          <span className="text-[72px] leading-none font-semibold tabular text-primary">{current.roi.toLocaleString('es-CO', { maximumFractionDigits: 1 })}×</span>
          <div className="flex flex-col leading-snug"><span className="text-[15px] text-soft">{t('perHundred')}</span><span className="text-[20px] font-semibold text-ink tabular">{t('value', { amount: formatCop(current.roi * 100000) })}</span></div>
        </div>
        <div className="flex gap-2" aria-hidden><span className="h-2 rounded-full bg-primary" style={{ flex: Math.max(current.roi, 0.05) }} /><span className="h-2 rounded-full bg-border" style={{ flex: 1 }} /></div>
      </section>
      <KpiTile label={t('labor')} icon="users" value={`$ ${formatCop(current.laborSaving)}`}
        hint={<span className="flex flex-col gap-2"><span>{t('laborHint', { hours: Math.round(current.hoursSaved) })}</span>{laborChange !== null && <StatusPill tone={laborChange >= 0 ? 'success' : 'danger'} icon={laborChange >= 0 ? 'arrowUp' : 'arrowDown'} className="w-fit h-7 text-[13px]">{Math.abs(laborChange)}%</StatusPill>}</span>} />
      <KpiTile label={t('aiSales')} icon="chartLine" value={`$ ${formatCop(current.aiSales)}`}
        hint={<span className="flex flex-col gap-2"><span>{t('aiSalesHint')}</span><StatusPill tone="neutral" className="w-fit h-7 text-[13px]">{t('unmeasured')}</StatusPill></span>} />
      <Card title={t('north')} className="col-span-2" action={<span className="text-[13px] text-soft">{t('northTag')}</span>}>
        <div className="p-5 flex items-end gap-4 min-h-[160px]">
          {history.map((h, i) => {
            const last = i === history.length - 1
            return (
              <div key={h.label} className="flex-1 flex flex-col items-center gap-2">
                <span className={cn('text-[20px] tabular', last ? 'text-primary font-semibold' : 'text-soft')}>{fmt1(h.hoursPer100)}</span>
                <div className={cn('w-full rounded-t-md', last ? 'bg-primary' : 'bg-border')} style={{ height: `${Math.max(8, (h.hoursPer100 / maxHours) * 80)}px` }} />
                <span className={cn('text-[13px]', last ? 'font-semibold text-ink' : 'text-soft')}>{h.label}</span>
              </div>
            )
          })}
        </div>
      </Card>
      <KpiTile label={t('cost')} icon="wallet" value={`$ ${formatCop(current.cost)}`} hint={t('costHint')} />
      <KpiTile label={t('net')} icon="sales" tone="primary" value={`${current.net >= 0 ? '+ ' : '− '}$ ${formatCop(Math.abs(current.net))}`} hint={t('netHint')} />
      <Card title={t('sources')} className="col-span-4" action={<span className="text-[13px] text-soft">{t('sourcesHint', { period: periodLabel })}</span>}>
        <div className="p-5 flex flex-col gap-3">
          {sources.map((s) => (
            <div key={s.key} className="flex items-center gap-4">
              <span className="w-[220px] text-[15px] text-ink flex items-center gap-2"><Icon name={s.key === 'autonomous' ? 'tablet' : s.key === 'hours' ? 'users' : s.key === 'upsell' ? 'chartLine' : 'check'} size={18} className="text-soft" />{t(`source.${s.key}`)}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted"><span className={cn('block h-2.5 rounded-full', s.color)} style={{ width: `${Math.max(2, (s.amount / maxSource) * 100)}%` }} aria-hidden /></div>
              <span className="w-[140px] text-right text-[15px] text-soft tabular">{s.amount > 0 ? formatCop(s.amount) : t('unmeasured')}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
