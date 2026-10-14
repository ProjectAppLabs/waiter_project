'use client'

import { useTranslations } from 'next-intl'

import { DataTable, type Column } from '@/components/ui/DataTable'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { orderStatus, type OrderStatus } from '@/lib/domain/ops'
import { formatCop } from '@/lib/domain/money'
import type { ShiftOrder } from '@/lib/services/ops'
import { cn } from '@/lib/utils'

const CHIP: Record<OrderStatus, string> = {
  late: 'bg-busy-soft text-busy-ink', pending: 'bg-pending-soft text-pending-ink', cooking: 'bg-kitchen-soft text-kitchen-ink',
  ready: 'bg-kitchen-soft text-kitchen-ink', served: 'bg-muted text-soft', paid: 'bg-free-soft text-free-ink',
}

export function ShiftTable({ orders, now, lateMinutes, emptyText }: { orders: ShiftOrder[]; now: number; lateMinutes: number; emptyText: string }) {
  const t = useTranslations('pos.ops')
  const columns: Column<ShiftOrder>[] = [
    { key: 'ref', header: t('cols.order'), width: '90px', render: (o) => <code className="font-mono text-soft">#{o.id}</code> },
    { key: 'table', header: t('cols.table'), render: (o) => `${o.tableNumber !== null ? `Mesa ${o.tableNumber}` : t('delivery')} · ${o.waiter}` },
    { key: 'origin', header: t('cols.origin'), width: '110px', render: (o) => <span className={cn(o.origin === 'waiter' ? 'text-soft' : 'text-brand-600 font-bold')}>{t(`origin.${o.origin}`)}</span> },
    { key: 'total', header: t('cols.total'), width: '130px', align: 'right', render: (o) => <span className="font-mono tabular">{formatCop(o.total)}</span> },
    { key: 'state', header: t('cols.state'), width: '150px', align: 'right', render: (o) => {
      const { status, minutes } = orderStatus(o, now, lateMinutes)
      return <span className={cn('inline-flex items-center h-[30px] px-2.5 rounded-lg text-sm font-medium', CHIP[status])}>{t(`status.${status}`, { n: minutes })}</span>
    } },
  ]
  // Por debajo de lg la tabla conserva sus cinco columnas: 47rem dan a «Mesa / mesero» unos 180 px junto a las cuatro fijas
  // (528 px con separaciones, más el relleno). Si no caben, se desplaza de lado con el riel del ScrollTable. La caja es una
  // columna flexible para que, como antes, la cabecera quede fija y solo las filas se desplacen hacia abajo.
  return (
    <ScrollTable boxClassName="flex flex-col min-h-0" className="min-h-0">
      <DataTable columns={columns} rows={orders} rowKey={(o) => o.id} emptyText={emptyText} className="min-w-[47rem] lg:min-w-0" />
    </ScrollTable>
  )
}
