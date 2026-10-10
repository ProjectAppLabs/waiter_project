'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { formatOrderDate } from '@/components/orders/format'
import { OrderLocationRow } from '@/components/orders/OrderLocationRow'
import type { OrderLocation } from '@/lib/domain/orderLocation'
import { ProgressRing } from '@/components/orders/ProgressRing'
import { Button } from '@/components/ui/Button'
import { DeliveryBadge } from '@/components/orders/DeliveryPanel'
import { formatCop } from '@/lib/domain/money'
import { canCharge, lineGroup, type KitLine, type KitOrder, type KitStatus, type LineGroup } from '@/lib/domain/orderState'
import { cn } from '@/lib/utils'

const TONE: Record<KitStatus, { bg: string; text: string; icon: KitIcon | null }> = {
  pending_send: { bg: 'bg-muted', text: 'text-soft', icon: 'cart' },
  in_progress: { bg: 'bg-progress-soft', text: 'text-progress-ink', icon: null },
  ready: { bg: 'bg-success-soft', text: 'text-success-ink', icon: 'chef' },
  served: { bg: 'bg-success-soft', text: 'text-success-ink', icon: 'check' },
  waiting_payment: { bg: 'bg-info-soft', text: 'text-info-ink', icon: 'check' },
  completed: { bg: 'bg-muted', text: 'text-soft', icon: 'check' },
}

// Primera fila de la tarjeta del kit: "Order# DI008 / Dine In" y la fecha corta, sobre fondo gris.
export function OrderHeadline({ order, className }: { order: KitOrder; className?: string }) {
  const t = useTranslations('orders')
  return (
    <div className={cn('h-10 px-3 rounded-sm bg-muted flex items-center justify-between text-[13px] text-soft', className)}>
      <span className="truncate">{t('card.orderNo')} <b className="text-ink font-semibold">{order.number}</b> <span className="text-dim">/</span> <b className="text-ink font-semibold">{t(`type.${order.type}`)}</b></span>
      <span className="shrink-0 tabular">{formatOrderDate(order.startedAt)}</span>
    </div>
  )
}

// Chip azul con el número de mesa (solo en mesa) y el nombre del cliente. El número solo no dice de qué es:
// lleva la palabra "Mesa" encima, que es lo que el mesero busca de un vistazo entre veinte tarjetas.
export function CustomerRow({ order, size = 'md' }: { order: KitOrder; size?: 'md' | 'sm' }) {
  const t = useTranslations('orders')
  const big = size === 'md'
  return (
    <div className="flex items-center gap-3 min-w-0">
      {order.tableNumber !== null && (
        <span aria-label={t('card.table', { n: order.tableNumber })} className={cn('shrink-0 rounded-md bg-primary text-primary-ink flex flex-col items-center justify-center leading-none font-semibold', big ? 'w-12 h-12' : 'w-10 h-10')}>
          <span className={cn('font-medium opacity-80', big ? 'text-[10px]' : 'text-[9px]')}>{t('card.tableWord')}</span>
          <span className={cn(big ? 'text-[17px] mt-0.5' : 'text-[15px] mt-px')}>{order.tableNumber}</span>
        </span>
      )}
      <div className="min-w-0 flex flex-col">
        <span className="text-[13px] text-soft">{t('card.customer')}</span>
        <span className={cn('font-semibold text-ink truncate', big ? 'text-[16px]' : 'text-[15px]')}>{order.customer || t('card.noCustomer')}</span>
      </div>
    </div>
  )
}

// Franja de estado: anillo % + "En progreso •" (naranja), check + "Servido" (verde), check + "Esperando pago" (azul); a la derecha "N ítems →".
export function StatusBar({ order, status, percent, onItems }: { order: KitOrder; status: KitStatus; percent: number; onItems?: () => void }) {
  const t = useTranslations('orders')
  const tone = TONE[status]
  const count = order.lines.reduce((a, l) => a + l.qty, 0)
  return (
    <div className={cn('h-14 pl-3 pr-4 rounded-md flex items-center justify-between gap-2', tone.bg, tone.text)}>
      <span className="flex items-center gap-2 min-w-0">
        {status === 'in_progress' ? <ProgressRing percent={percent} size={40} /> : tone.icon && <Icon name={tone.icon} size={20} />}
        <span className="text-[15px] font-semibold truncate">{t(`status.${status}`)}{status === 'in_progress' && <span aria-hidden="true"> •</span>}</span>
      </span>
      {onItems
        ? <button type="button" onClick={onItems} className="shrink-0 inline-flex items-center gap-1.5 text-[15px] font-semibold">{t('card.items', { count })}<Icon name="arrowRight" size={18} /></button>
        : <span className="shrink-0 inline-flex items-center gap-1.5 text-[15px] font-semibold">{t('card.items', { count })}<Icon name="arrowRight" size={18} /></span>}
    </div>
  )
}

// Cada plato lleva su palabra: el mesero ve de un vistazo qué sigue en cocina, qué le espera en el pase
// («Listo», en verde) y qué ya dejó en la mesa.
const LINE_TONE: Record<LineGroup, string> = {
  waiting: 'bg-muted text-dim', in_progress: 'bg-progress-soft text-progress-ink',
  ready: 'bg-success-soft text-success-ink', served: 'bg-muted text-soft',
}
function LineState({ group }: { group: LineGroup }) {
  const t = useTranslations('orders')
  return <span className={cn('shrink-0 h-6 px-1.5 rounded-full text-[11px] font-semibold grid place-items-center whitespace-nowrap', LINE_TONE[group])}>{t(`lineState.${group}`)}</span>
}

interface LinesTableProps { order: KitOrder; onToggle: (line: KitLine) => void }
// Tabla Ítems / Cant / Precio con casilla por línea. Solo se marca lo que cocina ya dejó en el pase:
// entregar un plato que sigue en el fuego sería mentirle a la cuenta.
function LinesTable({ order, onToggle }: LinesTableProps) {
  const t = useTranslations('orders')
  return (
    <div className="rounded-md border border-border overflow-hidden flex flex-col">
      <div className="grid grid-cols-[64px_1fr_auto_30px_66px] gap-1.5 px-3 h-9 items-center bg-muted text-[11px] text-soft">
        <span className="text-center">{t('card.deliveredHeader')}</span><span>{t('card.itemsHeader')}</span><span aria-hidden /><span className="text-center">{t('card.qty')}</span><span className="text-right">{t('card.price')}</span>
      </div>
      <ul className="max-h-[120px] overflow-y-auto">
        {order.lines.map((l) => {
          const group = lineGroup(order, l)
          const served = group === 'served'
          const label = served ? t('card.servedLine', { name: l.name }) : t('card.markServed', { name: l.name })
          const title = group === 'ready' || served ? undefined : t('card.notReadyYet')
          return (
            <li key={l.id} className={cn('grid grid-cols-[56px_1fr_auto_30px_66px] gap-1.5 px-3 h-9 items-center text-[14px]', group === 'waiting' && 'text-dim')}>
              <input type="checkbox" aria-label={label} title={title} className="w-4 h-4 accent-primary justify-self-center" checked={served} disabled={group !== 'ready'} onChange={() => onToggle(l)} />
              <span className="truncate">{l.name}</span>
              {/* Servido ya lo dice la casilla marcada: la píldora solo aparece cuando falta algo por saber. */}
              {served ? <span aria-hidden /> : <LineState group={group} />}
              <span className="text-center tabular">{l.qty}</span>
              <span className="text-right tabular text-soft">$ {formatCop(l.total)}</span>
            </li>
          )
        })}
      </ul>
      <div className="px-3 h-10 flex items-center justify-between border-t border-border bg-surface">
        <span className="text-[15px] font-semibold text-ink">{t('card.total')}</span><span className="text-[15px] font-semibold text-ink tabular">$ {formatCop(order.total)}</span>
      </div>
    </div>
  )
}

interface OrderCardProps {
  location?: OrderLocation
  order: KitOrder; status: KitStatus; percent: number; variant?: 'dashboard' | 'full'
  checked?: Set<number>; onToggleLine?: (line: KitLine) => void; onDetails?: () => void; mayCharge?: boolean
}
// Tarjeta de pedido del kit. En el Dashboard es la versión corta; en Pedidos lleva la tabla de ítems y el pie.
// Al detalle se entra por la flecha de "N ítems", así que el pie deja sitio a lo que se hace más veces en
// una mesa que ya está comiendo: pedir otra ronda.
export function OrderCard({ order, location, status, percent, variant = 'full', checked = new Set(), onToggleLine = () => undefined, onDetails, mayCharge = true }: OrderCardProps) {
  const t = useTranslations('orders')
  const chargeable = canCharge(order) && mayCharge
  return (
    <article aria-label={`${t('card.orderNo')} ${order.number}`} data-delivery={order.type === 'delivery' || undefined}
      className={cn('rounded-lg p-3 flex flex-col gap-3 shrink-0', order.type === 'delivery' ? 'bg-delivery-soft border-2 border-delivery' : 'bg-surface border border-border')}>
      <OrderHeadline order={order} />
      <CustomerRow order={order} />
      <DeliveryBadge order={order} />
      {order.tableId !== null && <OrderLocationRow location={location} />}
      <StatusBar order={order} status={status} percent={percent} onItems={onDetails} />
      {variant === 'full' && (
        <>
          <LinesTable order={order} onToggle={onToggleLine} />
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/pedidos/${order.id}/agregar`} className="h-tap-min px-4 rounded-md border border-border bg-surface text-ink text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><Icon name="plus" size={18} />{t('card.newRound')}</Link>
            {mayCharge && (chargeable
              ? <Link href={`/pago/${order.id}`} className="h-tap-min px-4 rounded-md bg-primary text-primary-ink text-[15px] font-bold inline-flex items-center justify-center">{t('card.pay')}</Link>
              : <Button variant="primary" size="compact" disabled className="disabled:bg-muted disabled:text-dim disabled:opacity-100">{t('card.pay')}</Button>)}
            {/* Sin permiso de cobro el mesero deja la mesa servida y el cajero la cobra desde el plano. */}
            {!mayCharge && <span className="h-tap-min px-4 rounded-md bg-muted text-dim text-[14px] font-semibold inline-flex items-center justify-center text-center leading-tight">{t('card.cashierCharges')}</span>}
          </div>
        </>
      )}
    </article>
  )
}
