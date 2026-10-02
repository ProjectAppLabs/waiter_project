'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { StatusPill, type PillTone } from '@/components/kit/StatusPill'
import { DepositPanel } from '@/components/reservations/DepositPanel'
import { ReservationTablesEditor } from '@/components/reservations/ReservationTablesEditor'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { tablesLabel, type ReservationState } from '@/lib/domain/reservations'
import { getReservation, type ReservationDetail } from '@/lib/services/reservations'

const TONE: Record<ReservationState, PillTone> = { confirmed: 'info', seated: 'success', no_show: 'danger', cancelled: 'neutral' }

// Modal "Reservation Detail" del kit (6 – Table / Reservation Details.png): cabecera con ID y franja,
// datos del cliente y los platos pre-pedidos con su total. Las acciones son nuestras, el kit no las dibuja.
export function ReservationDetailModal({ reservationId, open, onClose, onAction, configId, onChanged }: {
  reservationId: number | null; open: boolean; onClose: () => void
  // Con `configId` el detalle deja cambiar las mesas de una reserva confirmada; `onChanged` avisa para recargar la grilla.
  configId?: number | null; onChanged?: () => void
  onAction?: (id: number, state: 'seated' | 'no_show' | 'cancelled') => void
}) {
  const t = useTranslations('reservations.detail')
  // El detalle se guarda con su id: así el modal no pinta los datos de la reserva anterior mientras carga
  // la nueva, y no hace falta limpiar el estado dentro del efecto.
  const [loaded, setLoaded] = useState<{ id: number; data: ReservationDetail | null }>({ id: 0, data: null })
  useEffect(() => {
    if (!open || reservationId === null) return
    let alive = true
    getReservation(reservationId).then((r) => { if (alive) setLoaded({ id: reservationId, data: r }) }).catch(() => undefined)
    return () => { alive = false }
  }, [open, reservationId])
  const data = loaded.id === reservationId ? loaded.data : null
  const [editingTables, setEditingTables] = useState(false)
  if (open && data && editingTables && configId) {
    return <ReservationTablesEditor reservation={data} configId={configId} onClose={() => setEditingTables(false)}
      onSaved={(updated) => { setLoaded({ id: updated.id, data: updated }); setEditingTables(false); onChanged?.() }} />
  }

  return (
    <Modal open={open} onClose={onClose} title={t('title')} size="center">
      {!data ? <p className="p-8 text-center text-dim">{t('loading')}</p> : (
        <div className="flex flex-col">
          <header className="px-6 py-4 bg-muted flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink">{t('id', { name: data.name })}</span>
            <span className="text-[15px] text-soft">{new Date(`${data.date}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })} · {data.timeLabel}</span>
          </header>

          <div className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border">
            <span aria-label={t(data.tableNumbers.length > 1 ? 'tablesLabel' : 'tableLabel', { list: tablesLabel(data.tableNumbers) })} className="flex gap-1">
              {data.tableNumbers.map((n) => <span key={n} className="h-9 min-w-9 px-3 rounded-md bg-primary text-primary-ink text-[15px] font-semibold grid place-items-center">{n}</span>)}
            </span>
            {configId && data.state === 'confirmed' && (
              <button type="button" onClick={() => setEditingTables(true)} className="h-9 px-3 rounded-md border border-border text-[14px] font-medium text-ink flex items-center gap-2 hover:bg-muted">
                <Icon name="edit" size={16} />{t('changeTables')}
              </button>
            )}
            <span className="flex flex-col"><span className="text-[13px] text-dim">{t('customer')}</span><span className="text-[15px] font-semibold text-ink">{data.customerName}</span></span>
            <span className="flex flex-col"><span className="text-[13px] text-dim">{t('people')}</span><span className="text-[15px] font-semibold text-ink">{data.people}</span></span>
            <span className="flex flex-col"><span className="text-[13px] text-dim">{t('babyChair')}</span><span className="text-[15px] font-semibold text-ink">{data.babyChair ? t('yes') : t('no')}</span></span>
            <StatusPill tone={TONE[data.state]}>{t(`state.${data.state}`)}</StatusPill>
          </div>

          <DepositPanel reservation={data} onChanged={(next) => setLoaded({ id: next.id, data: next })} />

          <div className="max-h-[300px] overflow-auto px-6 py-4 flex flex-col gap-3">
            <span className="text-[15px] font-semibold text-ink">{t('dishes')}</span>
            {data.lines.length === 0 ? <p className="text-[15px] text-dim">{t('noDishes')}</p> : data.lines.map((line) => (
              <div key={line.id} className="flex items-center gap-3">
                <span className="w-10 h-10 shrink-0 rounded-sm bg-muted overflow-hidden grid place-items-center text-dim">
                  <img src={imageUrl(line.productTmplId, 256)} alt="" className="w-full h-full object-cover" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] text-ink truncate">{line.name}</span>
                  {line.note && <span className="block text-[13px] text-soft truncate">{t('note', { note: line.note })}</span>}
                </span>
                <span className="text-[13px] text-dim">x{line.qty}</span>
                <span className="w-24 text-right text-[15px] font-semibold text-ink tabular">{formatCop(line.total)}</span>
              </div>
            ))}
          </div>

          <footer className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
            <span className="text-[15px] text-soft">{t('total')}<span className="ml-3 text-[18px] font-semibold text-ink tabular">{formatCop(data.amountTotal)}</span></span>
            {onAction && data.state === 'confirmed' && (
              <span className="flex gap-2">
                <Button size="compact" onClick={() => onAction(data.id, 'cancelled')}>{t('cancel')}</Button>
                <Button size="compact" onClick={() => onAction(data.id, 'no_show')}>{t('noShow')}</Button>
                <Button size="compact" variant="primary" onClick={() => onAction(data.id, 'seated')}><Icon name="check" size={16} />{t('seat')}</Button>
              </span>
            )}
          </footer>
        </div>
      )}
    </Modal>
  )
}
