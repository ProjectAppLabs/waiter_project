'use client'

import { printReceipt } from '@/lib/print/settings'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { formatOrderDay, formatOrderTime } from '@/components/orders/format'
import { PrintableReceipt } from '@/components/pay/PrintableReceipt'
import { formatCop } from '@/lib/domain/money'
import { orderDate, type KitLine, type KitOrder } from '@/lib/domain/orderState'
import type { ReceiptData } from '@/lib/stores/orderStore'

interface Props { order: KitOrder | null; lines: KitLine[]; company: string; onRefund?: () => void }

// "Bill Information" del kit: cabecera con mesa, cliente y número; líneas (unitario × cantidad), subtotal, impuestos
// reales, total e "Imprimir". Imprime el recibo de pago existente (components/pay/Receipt): solo él es visible al imprimir.
export function BillInfo({ order, lines, company, onRefund }: Props) {
  const t = useTranslations('history')
  const to = useTranslations('orders')
  if (!order) {
    return (
      <aside aria-label={t('bill.title')} className="rounded-lg border border-dashed border-border grid place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-2 max-w-xs">
          <span className="w-12 h-12 rounded-md border border-border grid place-items-center text-ink"><Icon name="receipt" size={24} /></span>
          <span className="text-[18px] font-semibold text-ink">{t('empty.title')}</span>
          <p className="text-[14px] text-soft">{t('empty.body')}</p>
        </div>
      </aside>
    )
  }
  const subtotal = order.total - order.tax
  const receipt: ReceiptData = {
    company, tableNumber: order.tableNumber ?? 0, reference: order.number, at: orderDate(order.startedAt).getTime(),
    lines: lines.map((l) => ({ uuid: l.uuid, name: l.name, qty: l.qty, unitPrice: l.unitPrice, total: l.total })),
    subtotal, tax: order.tax, tip: 0, total: order.total, payments: [], change: 0,
  }
  return (
    <aside aria-label={t('bill.title')} className="rounded-lg border border-border bg-surface flex flex-col min-h-0">
      <h2 className="px-4 h-12 flex items-center text-[16px] font-semibold text-ink border-b border-border shrink-0">{t('bill.title')}</h2>
      <div className="px-4 py-3 flex items-start gap-3 border-b border-border shrink-0">
        {order.tableNumber !== null && <span className="w-10 h-10 rounded-md bg-primary text-primary-ink grid place-items-center text-[15px] font-semibold shrink-0">{order.tableNumber}</span>}
        <div className="min-w-0 flex-1 flex flex-col">
          <span className="text-[15px] font-semibold text-ink truncate">{order.customer || to('card.noCustomer')}</span>
          <span className="text-[13px] text-soft">{t('row.orderNo')} <b className="text-ink font-semibold">{order.number}</b> / {to(`type.${order.type}`)}</span>
        </div>
        <div className="text-right text-[13px] text-soft shrink-0"><div>{formatOrderDay(order.startedAt)}</div><div>{formatOrderTime(order.startedAt)}</div></div>
      </div>
      <h3 className="px-4 h-10 flex items-center text-[15px] font-semibold text-ink border-b border-border shrink-0">{t('bill.details')}</h3>
      <ul className="flex-1 min-h-0 overflow-y-auto px-4 divide-y divide-border">
        {lines.map((l) => (
          <li key={l.id} className="py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-col gap-0.5"><span className="text-[15px] font-semibold text-ink truncate">{l.name}</span><span className="text-[13px] text-soft tabular">$ {formatCop(l.unitPrice)}</span></div>
            <div className="text-right flex flex-col gap-0.5 shrink-0"><span className="text-[13px] text-soft tabular">x {l.qty}</span><span className="text-[15px] font-semibold text-ink tabular">$ {formatCop(l.total)}</span></div>
          </li>
        ))}
      </ul>
      <div className="m-4 mt-2 p-4 rounded-md bg-muted flex flex-col gap-1.5 shrink-0">
        <div className="flex justify-between text-[14px] text-soft"><span>{t('bill.subtotal')}</span><span className="tabular text-ink">$ {formatCop(subtotal)}</span></div>
        <div className="flex justify-between text-[14px] text-soft"><span>{t('bill.tax')}</span><span className="tabular text-ink">$ {formatCop(order.tax)}</span></div>
        <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-dashed border-border"><span className="text-[16px] font-semibold text-ink">{t('bill.total')}</span><span className="text-[20px] font-semibold text-ink tabular">$ {formatCop(order.total)}</span></div>
        {(order.refunded ?? 0) > 0 && <div className="flex justify-between text-[14px] text-danger-ink"><span>{t('bill.refunded')}</span><span className="tabular">− $ {formatCop(order.refunded ?? 0)}</span></div>}
      </div>
      <div className="px-4 pb-4 shrink-0 flex flex-col gap-2">
        {onRefund && (order.refunded ?? 0) < order.total && <button type="button" onClick={onRefund} className="w-full h-11 rounded-md border border-danger text-danger-ink bg-surface text-[15px] font-bold inline-flex items-center justify-center gap-2"><Icon name="refresh" size={18} />{t('bill.refund')}</button>}
        <button type="button" onClick={printReceipt} className="w-full h-12 rounded-md bg-primary text-primary-ink text-[16px] font-bold inline-flex items-center justify-center gap-2"><Icon name="printer" size={20} />{t('bill.print')}</button>
      </div>
      <PrintableReceipt data={receipt} />
    </aside>
  )
}
