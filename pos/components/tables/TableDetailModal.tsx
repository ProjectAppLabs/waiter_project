'use client'

import { serverDate } from '@/lib/domain/time'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { orderCode, orderPrefix, progressPercent } from '@/lib/domain/tablesKit'
import { getOrderDetail, type LineStatus, type OrderDetail, type OrderDetailLine, type TableCall } from '@/lib/services/tables'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean; onClose: () => void; tableName: string; orderId: number | null; imageFor: (productId: number) => string | null
  onChangeTable: (detail: OrderDetail) => void; onNewOrder: () => void; load?: (orderId: number) => Promise<OrderDetail>
  call?: TableCall; onAttendCall?: () => Promise<void>
  onSendPending?: (orderId: number) => Promise<void>
  onServe?: (lines: OrderDetailLine[]) => Promise<void> | void; busy?: boolean; mayCreate?: boolean
}

// date_order llega en UTC sin zona; se muestra como "lun, 17 feb 12:24 p. m." en la hora del dispositivo.
export function formatOrderDate(s: string): string {
  const d = serverDate(s)
  return `${d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`
}

// Anillo de progreso del kit: arco naranja sobre pista clara, porcentaje dentro.
function Ring({ percent }: { percent: number }) {
  const r = 11, c = 2 * Math.PI * r
  return (
    <span className="relative w-8 h-8 grid place-items-center" role="img" aria-label={`${percent}%`}>
      <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90 w-8 h-8"><circle cx="14" cy="14" r={r} fill="none" strokeWidth="3" className="stroke-progress/25" /><circle cx="14" cy="14" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-progress" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} /></svg>
      <span className="text-[9px] font-semibold text-progress-ink">{percent}%</span>
    </span>
  )
}

// Cabecera de cada plato: la palabra dice en qué punto del viaje va, y solo lo que cocina dejó listo
// ofrece "Entregar" — es el gesto que el mesero hace al dejar el plato en la mesa.
const LINE_HEAD: Record<LineStatus, { cls: string; icon: 'alarm' | 'chef' | 'checkFilled' }> = {
  unsent: { cls: 'bg-muted text-soft', icon: 'alarm' },
  waiting: { cls: 'bg-muted text-soft', icon: 'alarm' },
  progress: { cls: 'bg-progress-soft text-progress-ink', icon: 'alarm' },
  ready: { cls: 'bg-success-soft text-success-ink', icon: 'chef' },
  served: { cls: 'bg-muted text-soft', icon: 'checkFilled' },
}

function LineCard({ line, image, t, onServe, busy }: { line: OrderDetailLine; image: string | null; t: ReturnType<typeof useTranslations<'tables.detail'>>; onServe?: (lines: OrderDetailLine[]) => Promise<void> | void; busy?: boolean }) {
  const tl = useTranslations('orders.lineState')
  const head = LINE_HEAD[line.status]
  return (
    <li className="rounded-md border border-border overflow-hidden bg-surface">
      <div className={cn('min-h-10 px-3 py-2 flex items-center gap-2 text-[14px] font-semibold', head.cls)}>
        <Icon name={head.icon} size={18} />{tl(line.status === 'progress' ? 'in_progress' : line.status)}

      </div>
      <div className="p-3 flex gap-3">
        <span className="w-20 h-20 shrink-0 rounded-sm bg-muted overflow-hidden grid place-items-center text-dim">{image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <Icon name="photo" size={22} />}</span>
        <div className="min-w-0 flex flex-col gap-1 text-[13px] text-dim">
          <span className="text-[15px] font-semibold text-ink">{line.name}</span>
          {line.additions.length > 0 && <span>{t('addition')} {line.additions.join(', ')}</span>}
          {line.note && <span>{t('note')} {line.note}</span>}
        </div>
      </div>
      <div className="px-3 pb-3 flex flex-wrap items-center gap-3"><span className="text-[15px] font-semibold text-ink">$ {formatCop(line.unitPrice)}</span><span className="h-8 px-2.5 rounded-sm border border-border text-[14px] font-semibold text-ink grid place-items-center">x{line.qty}</span>
        {line.status === 'ready' && onServe && <Button size="compact" variant="primary" className="ml-auto shrink-0" disabled={busy} onClick={() => void onServe([line])}><Icon name="check" size={16} />{t('deliver')}</Button>}
      </div>
    </li>
  )
}

// Modal "Detalle de mesa" del kit (Detail Table/Food In Progress.png y Food All Served.png).
export function TableDetailModal({ open, onClose, tableName, orderId, imageFor, onChangeTable, onNewOrder, load = getOrderDetail, onServe, onSendPending, call, onAttendCall, busy = false, mayCreate = true }: Props) {
  const t = useTranslations('tables.detail')
  const ts = useTranslations('tables.state')
  const service = useTranslations('tables.service')
  const [loaded, setLoaded] = useState<OrderDetail | null>(null)
  const [tick, setTick] = useState(0)
  const [sending, setSending] = useState(false)
  const [acting, setActing] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || orderId === null) return
    let alive = true
    void load(orderId).then((d) => { if (alive) setLoaded(d) })
    return () => { alive = false }
  }, [open, orderId, load, tick])
  // Mientras el mesero mira la mesa, cocina sigue trabajando: se relee cada 10 s para que "Listo" aparezca solo.
  useEffect(() => {
    if (!open || orderId === null) return
    const id = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => clearInterval(id)
  }, [open, orderId])
  // Mientras llega el pedido pedido, el del anterior no se muestra: se compara con el id que se está pidiendo.
  const detail = loaded !== null && loaded.id === orderId ? loaded : null

  const allServed = detail !== null && detail.lines.length > 0 && detail.lines.every((l) => l.status === 'served')
  const pending = detail !== null && detail.lines.some((l) => l.status !== 'served')
  // Si cocina ya dejó algo en el pase, la franja lo dice en verde: el mesero tiene que ir por ello.
  const readyLines = detail === null ? [] : detail.lines.filter((l) => l.status === 'ready')
  const anyReady = readyLines.length > 0
  const percent = detail ? progressPercent(detail.served, detail.sent) : 0
  const code = detail ? orderCode(orderPrefix(detail.serviceAt), detail.tracking, detail.id) : ''

  async function sendPending() {
    if (!detail || !onSendPending || sending) return
    setSending(true)
    setSendError(null)
    try {
      await onSendPending(detail.id)
      setTick((n) => n + 1)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t('sendFailed'))
    } finally { setSending(false) }
  }

  async function actOnTable(action: () => Promise<void> | void) {
    if (acting || sending || busy) return
    setActing(true)
    setSendError(null)
    try {
      await action()
      if (orderId !== null) setLoaded(await load(orderId))
    } catch (error) {
      setSendError(error instanceof Error ? error.message : service('failed'))
    } finally { setActing(false) }
  }
  const actionBusy = busy || sending || acting

  const footer = (
    <div className="flex flex-col gap-3">
      {call && <div className="rounded-md border border-border bg-info-soft p-3 flex flex-wrap items-center gap-2 text-sm text-info-ink">
        <Icon name="bell" size={18} /><span className="flex-1">{service(`kind.${call.kind}`)}</span>
        {onAttendCall && <Button size="compact" disabled={actionBusy} onClick={() => void actOnTable(onAttendCall)}>{service('attended')}</Button>}
      </div>}
      {sendError && <p role="alert" className="text-sm text-danger">{sendError}</p>}
      {detail?.lines.some((line) => line.status === 'unsent') && onSendPending && (
        <Button variant="primary" disabled={actionBusy} onClick={() => void sendPending()}><Icon name="chef" size={18} />{t('sendPending')}</Button>
      )}
      {detail && <div className="h-11 px-3 rounded-sm bg-muted flex items-center justify-between text-[15px]"><span className="text-soft">{t('total')}</span><span className="text-[20px] font-semibold text-ink">$ {formatCop(detail.total)}</span></div>}
      <Button className="w-full" disabled={!mayCreate} onClick={onNewOrder}><Icon name="plus" size={18} />{t('newOrder')}</Button>
      {/* El cobro se hace en caja, desde Pedidos. Aquí no hay botón ni enlace: Mesas es para atender, y
          quien cobra entra por su módulo. Un aviso, no una acción deshabilitada que invite a insistir. */}
      <p className="text-[13px] text-soft text-center">{t('cashierCharges')}</p>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={`${t('title')} · ${tableName}`} footer={footer}>
      {orderId === null ? (
        <div className="p-8 text-center flex flex-col items-center gap-2">
          <span className="w-12 h-12 rounded-sm bg-primary text-primary-ink grid place-items-center text-[16px] font-semibold">{tableName}</span>
          <p className="text-[18px] font-semibold text-ink">{t('emptyTitle')}</p><p className="text-[14px] text-soft">{t('emptyBody', { name: tableName })}</p>
        </div>
      ) : !detail ? <p role="status" className="p-8 text-center text-soft">{t('loading')}</p> : (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="mt-4 h-9 px-3 rounded-sm bg-muted flex items-center justify-between text-[13px] text-soft">
            <span>{t('order')} <strong className="text-ink">{code}</strong> / <strong className="text-ink">{t(`type.${orderPrefix(detail.serviceAt)}`)}</strong></span>
            <span>{formatOrderDate(detail.dateOrder)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 shrink-0 rounded-sm bg-primary text-primary-ink grid place-items-center text-[15px] font-semibold">{tableName}</span>
            <div className="flex-1 min-w-0 flex flex-col"><span className="text-[13px] text-dim">{t('customer')}</span><span className="text-[15px] font-semibold text-ink truncate">{detail.customerName || t('noCustomer')}</span></div>
            {pending ? (
              <Button size="compact" className="border-primary text-primary" onClick={() => onChangeTable(detail)}><Icon name="exchange" size={18} />{t('changeTable')}</Button>
            ) : allServed ? (
              <span className="flex-1 h-11 px-3 rounded-sm bg-success-soft text-success-ink flex items-center gap-2 text-[14px] font-semibold"><Icon name="check" size={16} />{ts('served')}<span className="ml-auto">{t('items', { count: detail.lines.length })}</span><Icon name="arrowRight" size={16} /></span>
            ) : <span className="text-sm text-soft">{ts('pendingSend')}</span>}
          </div>
          {pending && (
            <div className={cn('min-h-11 px-3 py-2 rounded-md flex flex-wrap items-center gap-2 text-[14px] font-semibold', anyReady ? 'bg-success-soft text-success-ink' : 'bg-progress-soft text-progress-ink')}>
              {anyReady ? <Icon name="chef" size={18} /> : detail.sent === 0 ? <Icon name="cart" size={18} /> : <Ring percent={percent} />}
              <span>{anyReady ? ts('ready') : detail.sent === 0 ? ts('pendingSend') : `${ts('inProgress')} •`}</span>
              <span className="ml-auto">{t('items', { count: detail.lines.length })}</span>

            </div>
          )}
          {readyLines.length > 1 && onServe && <Button size="compact" variant="primary" className="w-full" disabled={actionBusy} onClick={() => void actOnTable(() => onServe(readyLines))}><Icon name="checks" size={16} />{t('deliverAll')}</Button>}
          <ul className="flex flex-col gap-3">{detail.lines.map((l) => <LineCard key={l.id} line={l} image={imageFor(l.productId)} t={t} onServe={onServe ? (lines) => actOnTable(() => onServe(lines)) : undefined} busy={actionBusy} />)}</ul>
        </div>
      )}
    </Modal>
  )
}
