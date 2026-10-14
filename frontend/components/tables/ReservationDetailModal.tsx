'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { formatReservationDate } from '@/components/tables/ReservationListModal'
import { formatCop } from '@/lib/domain/money'
import { getReservationDetail, type ReservationDetail } from '@/lib/services/tables'

interface Props { open: boolean; onClose: () => void; reservationId: number; load?: (id: number) => Promise<ReservationDetail> }

// "Detalle de reserva" del kit (6 – Table / Reservation Details.png): cabecera Reserva#, mesa, cliente, personas,
// silla de bebé y el pre-pedido (waiter.reservation.preorder_id) con nota, precio y cantidad.
export function ReservationDetailModal({ open, onClose, reservationId, load = getReservationDetail }: Props) {
  const t = useTranslations('tables.reservations')
  const [loaded, setLoaded] = useState<ReservationDetail | null>(null)
  useEffect(() => {
    if (!open) return
    let alive = true
    void load(reservationId).then((d) => { if (alive) setLoaded(d) })
    return () => { alive = false }
  }, [open, reservationId, load])
  const detail = loaded !== null && loaded.id === reservationId ? loaded : null

  const footer = detail && (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-soft">{t('total')}</span><span className="text-[20px] font-semibold text-ink">$ {formatCop(detail.amountTotal)}</span>
    </div>
  )
  return (
    <Modal open={open} onClose={onClose} title={t('detailTitle')} footer={footer || undefined}>
      {!detail ? <p role="status" className="p-8 text-center text-soft">{t('loading')}</p> : (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="mt-4 h-9 px-3 rounded-sm bg-muted flex items-center justify-between text-[13px] text-soft">
            <span>{t('code')} <strong className="text-ink">{detail.name}</strong></span>
            <span>{formatReservationDate(detail.date)} / {detail.timeLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="shrink-0 flex gap-1">
              {detail.tableNumbers.map((n) => <span key={n} className="min-w-10 h-10 px-2 rounded-sm bg-primary text-primary-ink grid place-items-center text-[15px] font-semibold">{n}</span>)}
            </span>
            {([[t('customer'), detail.customerName], [t('people'), String(detail.people)], [t('babyChair'), t(detail.babyChair ? 'yes' : 'no')]] as const).map(([label, value]) => (
              <div key={label} className="min-w-0 flex flex-col"><span className="text-[13px] text-dim">{label}</span><span className="text-[15px] font-semibold text-ink truncate">{value}</span></div>
            ))}
          </div>
          {detail.notes && <p className="text-[13px] text-soft"><span className="text-dim">{t('notes')}</span> {detail.notes}</p>}
          <p className="pt-1 text-[15px] font-semibold text-ink">{t('menu')}</p>
          {detail.lines.length === 0 ? <p className="py-6 text-center text-[14px] text-soft">{t('noPreorder')}</p> : (
            <ul className="flex flex-col gap-3">
              {detail.lines.map((l) => (
                <li key={l.id} className="rounded-md border border-border overflow-hidden bg-surface">
                  <div className="p-3 flex gap-3">
                    <span className="w-20 h-20 shrink-0 rounded-sm bg-muted overflow-hidden grid place-items-center text-dim">
                      <img src={imageUrl(l.productTemplateId)} alt="" className="w-full h-full object-cover" />
                    </span>
                    <div className="min-w-0 flex flex-col gap-1 text-[13px] text-dim">
                      <span className="text-[15px] font-semibold text-ink">{l.name}</span>
                      {l.note && <span>{t('note')} {l.note}</span>}
                    </div>
                  </div>
                  <div className="px-3 pb-3 flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-ink">$ {formatCop(l.total)}</span>
                    <span className="h-8 px-2.5 rounded-sm border border-border text-[14px] font-semibold text-ink grid place-items-center">x{l.qty}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {detail.phone !== '' && <p className="flex items-center gap-1.5 text-[13px] text-dim"><Icon name="user" size={14} />{detail.phone}</p>}
        </div>
      )}
    </Modal>
  )
}
