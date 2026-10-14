'use client'

import { useTranslations } from 'next-intl'

import { formatOrderDate } from '@/components/orders/format'
import { formatCop } from '@/lib/domain/money'
import type { KitOrder } from '@/lib/domain/orderState'
import { cn } from '@/lib/utils'

// Fila del historial del kit: cabecera gris con "Pedido# DI104" y fecha; debajo Tipo / Mesa / Cliente / Total separados por líneas.
export function HistoryRow({ order, selected, onSelect }: { order: KitOrder; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('history')
  const to = useTranslations('orders')
  const cells: [string, string][] = [[t('row.type'), to(`type.${order.type}`)]]
  if (order.tableNumber !== null) cells.push([t('row.table'), String(order.tableNumber)])
  cells.push([t('row.customer'), order.customer || to('card.noCustomer')], [t('row.total'), `$ ${formatCop(order.total)}`])
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${t('row.orderNo')} ${order.number}`}
      className={cn('w-full shrink-0 text-left rounded-md border bg-surface overflow-hidden', selected ? 'border-primary ring-1 ring-primary' : 'border-border')}>
      <div className="h-10 px-4 bg-muted flex items-center justify-between text-[14px] text-soft">
        <span>{t('row.orderNo')} <b className="text-ink font-semibold">{order.number}</b></span>
        <span className="tabular">{formatOrderDate(order.startedAt)}</span>
      </div>
      <div className="px-4 py-3 grid gap-4 divide-x divide-border" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map(([label, value], i) => (
          <div key={label} className={cn('flex flex-col gap-0.5 min-w-0', i > 0 && 'pl-4')}>
            <span className="text-[13px] text-soft">{label}</span>
            <span className="text-[15px] font-semibold text-ink truncate tabular">{value}</span>
          </div>
        ))}
      </div>
    </button>
  )
}
