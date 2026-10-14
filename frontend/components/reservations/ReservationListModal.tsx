'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import type { ReservationCard } from '@/lib/domain/reservations'
import { listByTable } from '@/lib/services/reservations'

// Modal "Reservation List" del kit (6 – Table / Reservation Information.png): las reservas activas de una
// mesa con su cliente, fecha y franja. Lo abre el plano desde "Info de reserva".
export function ReservationListModal({ tableId, open, onClose, onOpenDetail }: {
  tableId: number | null; open: boolean; onClose: () => void; onOpenDetail: (id: number) => void
}) {
  const t = useTranslations('reservations.list')
  // Las filas se guardan con su mesa: sin limpiar en el efecto, el modal nunca muestra las de otra mesa.
  const [loaded, setLoaded] = useState<{ id: number; rows: ReservationCard[] }>({ id: 0, rows: [] })
  useEffect(() => {
    if (!open || tableId === null) return
    let alive = true
    listByTable(tableId).then((r) => { if (alive) setLoaded({ id: tableId, rows: r }) }).catch(() => { if (alive) setLoaded({ id: tableId, rows: [] }) })
    return () => { alive = false }
  }, [open, tableId])
  const rows = loaded.id === tableId ? loaded.rows : null

  return (
    <Modal open={open} onClose={onClose} title={t('title')} size="center">
      {rows === null ? <p className="p-8 text-center text-dim">{t('loading')}</p>
        : rows.length === 0 ? <KitEmptyState icon="reservations" title={t('empty')} body={t('emptyBody')} />
        : (
          <div className="p-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-dim">
              <span>{t('customer')}</span><span>{t('date')}</span><span>{t('time')}</span><span />
            </div>
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-4 py-3 border-t border-border text-[15px]">
                <span className="text-ink font-semibold truncate">{row.customerName}</span>
                <span className="text-soft">{new Date(`${row.date}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="text-soft tabular">{row.timeLabel}</span>
                <Button size="compact" onClick={() => onOpenDetail(row.id)}>{t('detail')}</Button>
              </div>
            ))}
          </div>
        )}
    </Modal>
  )
}
