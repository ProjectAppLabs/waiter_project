'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { OrderLocationRow } from '@/components/orders/OrderLocationRow'
import type { OrderLocation } from '@/lib/domain/orderLocation'
import { Modal } from '@/components/kit/Modal'
import { CustomerRow, OrderHeadline, StatusBar } from '@/components/orders/OrderCard'
import { DeliveryPanel } from '@/components/orders/DeliveryPanel'
import { formatCop } from '@/lib/domain/money'
import { canCharge, lineGroup, type KitLine, type KitOrder, type KitStatus, type LineGroup } from '@/lib/domain/orderState'
import { fromOrder } from '@/lib/domain/comanda'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { usePrintStore } from '@/lib/stores/printStore'
import { cn } from '@/lib/utils'

const GROUPS: { key: LineGroup; icon: KitIcon; cls: string }[] = [
  { key: 'waiting', icon: 'alarm', cls: 'bg-muted text-ink' },
  { key: 'in_progress', icon: 'progress', cls: 'bg-progress-soft text-progress-ink' },
  { key: 'ready', icon: 'chef', cls: 'bg-success-soft text-success-ink' },
  { key: 'served', icon: 'circleCheck', cls: 'bg-muted text-soft' },
]

interface Props {
  location?: OrderLocation
  order: KitOrder | null; status: KitStatus; percent: number; onClose: () => void
  imageOf: (productId: number) => string | null; onCancelWaiting: (lines: KitLine[]) => void
  onSendPending?: () => void; onServeReady?: (lines: KitLine[]) => void; busy?: boolean; mayCharge?: boolean
}

// "Detail Order" del kit: cabecera del pedido, líneas agrupadas por estado de cocina y pie con total, "+ Nuevo pedido" e "Ir a pagar".
export function OrderDetailModal({ order, location, status, percent, onClose, imageOf, onCancelWaiting, onSendPending, onServeReady, busy = false, mayCharge = true }: Props) {
  const t = useTranslations('orders')
  const tp = useTranslations('kds.print')
  const catalog = useCatalogStore((s) => s.catalog)
  const printComanda = usePrintStore((s) => s.printComanda)
  if (!order) return null
  const stationOf = (productId: number) => {
    const ids = catalog?.products.find((p) => p.id === productId)?.categoryIds ?? []
    return catalog?.categories.find((c) => ids.includes(c.id) && c.station)?.station ?? null
  }
  const sent = order.lines.some((l) => l.courseId !== null)
  const groups = GROUPS.map((g) => ({ ...g, lines: order.lines.filter((l) => lineGroup(order, l) === g.key) })).filter((g) => g.lines.length > 0)
  const chargeable = canCharge(order) && mayCharge
  const footer = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3"><span className="text-[15px] text-soft">{t('detail.totalPayment')}</span>
        {sent && <button type="button" onClick={() => printComanda(fromOrder(order, stationOf))} className="ml-auto h-9 px-3 rounded-sm border border-border bg-surface text-ink text-[14px] font-semibold inline-flex items-center gap-1.5"><Icon name="printer" size={16} />{tp('button')}</button>}
        <span className="text-[20px] font-semibold text-ink tabular">$ {formatCop(order.total)}</span></div>
      <div className="grid grid-cols-2 gap-3">
        {order.id < 0 ? (
          // Plan V: un pedido de emergencia se gestiona en su pantalla (sin red no se carga una dirección con su id).
          <Link href="/emergencia" className="col-span-2 h-12 rounded-md bg-primary text-primary-ink text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><Icon name="alarm" size={18} />{t('detail.emergency')}</Link>
        ) : <>
        <Link href={`/pedidos/${order.id}/agregar`} className="h-12 rounded-md border border-border bg-surface text-ink text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><Icon name="plus" size={18} />{t('detail.newOrder')}</Link>
        {chargeable
          ? <Link href={`/pago/${order.id}`} className="h-12 rounded-md bg-primary text-primary-ink text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><Icon name="money" size={18} />{t('detail.proceed')}</Link>
          : <span aria-disabled="true" className="h-12 rounded-md bg-muted text-dim text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><Icon name="money" size={18} />{mayCharge ? t('detail.proceed') : t('card.cashierCharges')}</span>}
        </>}
      </div>
    </div>
  )
  return (
    <Modal open onClose={onClose} title={t('detail.title')} size="center" footer={footer}>
      <div className="px-4 pt-3 pb-4 flex flex-col gap-3 border-b border-border">
        <OrderHeadline order={order} />
        <CustomerRow order={order} size="sm" />
        {order.tableId !== null && <OrderLocationRow location={location} />}
        {order.channel === 'whatsapp' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-soft">
            <span className="rounded-sm bg-success-soft px-2 py-1 text-success-ink">WhatsApp</span>
            {order.phone && <span className="tabular">{order.phone}</span>}
          </div>
        )}
        <DeliveryPanel order={order} />
        <StatusBar order={order} status={status} percent={percent} />
      </div>
      <div className="p-4 flex flex-col gap-3">
        {onSendPending && order.lines.some((l) => !l.courseId) && (
          <button type="button" disabled={busy} onClick={onSendPending} className="h-11 rounded-md bg-primary text-primary-ink font-semibold">{t('detail.sendPending')}</button>
        )}
        {groups.map((g) => (
          <section key={g.key} aria-label={t(`detail.groups.${g.key}`)} className="rounded-md border border-border overflow-hidden">
            <header className={cn('h-11 px-3 flex items-center justify-between', g.cls)}>
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold"><Icon name={g.icon} size={18} />{t(`detail.groups.${g.key}`)}</span>
              {g.key === 'ready' && onServeReady && (
                <button type="button" disabled={busy} onClick={() => onServeReady(g.lines)} className="h-8 px-3 rounded-sm bg-primary text-primary-ink text-[13px] font-semibold inline-flex items-center gap-1 disabled:opacity-40">
                  <Icon name="checks" size={14} />{t('detail.deliverAll')}
                </button>
              )}
              {g.key === 'waiting' && (
                <button type="button" disabled={busy} onClick={() => onCancelWaiting(g.lines)} className="h-8 px-3 rounded-sm border border-danger text-danger-ink bg-surface text-[13px] font-semibold inline-flex items-center gap-1 disabled:opacity-40">
                  <Icon name="trash" size={14} />{t('detail.cancel')}
                </button>
              )}
            </header>
            <ul className="divide-y divide-border">
              {g.lines.map((l) => <DetailLine key={l.id} line={l} image={imageOf(l.productId)} />)}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

function DetailLine({ line, image }: { line: KitLine; image: string | null }) {
  const t = useTranslations('orders')
  return (
    <li className="p-3 flex flex-col gap-3">
      <div className="flex gap-3">
        <span className="w-20 h-20 rounded-sm bg-muted overflow-hidden shrink-0 grid place-items-center text-dim">{image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <Icon name="photo" size={22} />}</span>
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-[15px] font-semibold text-ink">{line.name}</span>
          {line.note && <span className="text-[13px] text-soft">{t('detail.note')} {line.note}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-[15px] font-semibold text-ink tabular">$ {formatCop(line.total)}</span>
        <span className="h-8 px-2.5 rounded-sm border border-border text-[13px] font-semibold text-ink grid place-items-center tabular">x{line.qty}</span>
      </div>
    </li>
  )
}
