'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/Button'
import { formatClock } from '@/lib/domain/kitchen'
import type { Alert } from '@/lib/domain/ops'
import { cn } from '@/lib/utils'

interface AlertCardProps { alert: Alert; late: number; queue: number; onResolve: (alert: Alert, text: string) => void; onAttend?: (alert: Alert) => void }

export function AlertCard({ alert, late, queue, onResolve, onAttend }: AlertCardProps) {
  const t = useTranslations('pos.ops')
  const busy = alert.severity === 'busy'
  const table = alert.tableNumber ?? '—'
  const body = alert.kind === 'kitchen' ? t('alertBody.kitchen', { ref: `#${alert.orderId}`, table, late, queue })
    : alert.kind === 'table' ? t('alertBody.table', { table })
    : t('alertBody.payment', { table, minutes: Math.floor(alert.seconds / 60) })
  return (
    <article aria-label={t(`alert.${alert.kind}`)} className={cn('rounded-[14px] border p-4 flex flex-col gap-2.5', busy ? 'border-danger/40 bg-busy-soft' : 'border-progress/40 bg-surface')}>
      <div className="flex items-center justify-between">
        <span className={cn('text-[13px] tracking-[0.1em] uppercase font-medium', busy ? 'text-busy-ink' : 'text-pending-ink')}>{t(`alert.${alert.kind}`)}</span>
        <span className={cn('font-mono tabular text-sm', busy ? 'text-busy-ink' : 'text-soft')}>{formatClock(alert.seconds)}</span>
      </div>
      <p className="text-[17px] leading-snug">{body}</p>
      <div className="flex gap-2">
        {alert.kind === 'table' ? (
          <>
            <Button size="compact" variant="destructive" onClick={() => onAttend?.(alert)}>{t('actions.onMyWay')}</Button>
            <Link href="/salon" className="h-tap-min px-4 rounded-[10px] border border-border grid place-items-center text-[15px] font-medium">{t('goSalon')}</Link>
          </>
        ) : alert.kind === 'kitchen' ? (
          <>
            <Link href="/kds" className="h-tap-min px-4 rounded-[10px] border border-border grid place-items-center text-[15px] font-medium">{t('actions.seeKitchen')}</Link>
            <Button size="compact" onClick={() => onResolve(alert, t('courtesy', { table }))}>{t('actions.courtesy')}</Button>
          </>
        ) : (
          <>
            {/* El cobro vive en Pedidos, no en Mesas: la alerta lleva a la caja, que es quien cobra. */}
            <Link href="/pedidos" className="h-tap-min px-4 rounded-[10px] bg-brand-500 text-white grid place-items-center text-[15px] font-medium">{t('actions.charge')}</Link>
            <Button size="compact" onClick={() => onResolve(alert, t('chargedLabel', { table }))}>{t('actions.done')}</Button>
          </>
        )}
      </div>
    </article>
  )
}
