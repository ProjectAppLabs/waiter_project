'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { listTableReservations, type TableReservation } from '@/lib/services/tables'

interface Props { open: boolean; onClose: () => void; tableId: number; tableName: string; onDetail: (reservation: TableReservation) => void; load?: (tableId: number) => Promise<TableReservation[]> }

// "Sáb, 4 mar" — la fecha corta del kit, en español y sin año (las reservas son de esta semana).
export function formatReservationDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function ReservationListModal({ open, onClose, tableId, tableName, onDetail, load = listTableReservations }: Props) {
  const t = useTranslations('tables.reservations')
  const [loaded, setLoaded] = useState<{ tableId: number; rows: TableReservation[] } | null>(null)
  useEffect(() => {
    if (!open) return
    let alive = true
    void load(tableId).then((r) => { if (alive) setLoaded({ tableId, rows: r }) }).catch(() => { if (alive) setLoaded({ tableId, rows: [] }) })
    return () => { alive = false }
  }, [open, tableId, load])
  // Las filas de otra mesa no se pintan: mientras llegan las de esta, la lista está "cargando".
  const rows = loaded?.tableId === tableId ? loaded.rows : null

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col">
        <div className="grid grid-cols-[1.1fr_1fr_1fr_auto] items-center px-4 h-12 border-b border-border text-[15px] font-semibold text-ink">
          <span>{t('customer')}</span><span>{t('date')}</span><span>{t('time')}</span><span className="w-[86px]" />
        </div>
        {rows === null ? <p role="status" className="p-8 text-center text-soft">{t('loading')}</p>
          : rows.length === 0 ? <KitEmptyState icon="reservations" title={t('emptyTitle')} body={t('emptyBody', { name: tableName })} />
            : (
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className="grid grid-cols-[1.1fr_1fr_1fr_auto] items-center px-4 h-14 border-b border-border text-[15px] text-ink">
                    <span className="truncate">{r.customerName}</span>
                    <span className="text-soft">{formatReservationDate(r.date)}</span>
                    <span className="text-soft">{r.timeLabel}</span>
                    <Button size="compact" className="w-[86px] justify-center" onClick={() => onDetail(r)}>{t('detail')}</Button>
                  </li>
                ))}
              </ul>
            )}
        <p className="px-4 py-3 flex items-center gap-1.5 text-[12px] text-dim"><Icon name="info" size={14} />{t('hint')}</p>
      </div>
    </Modal>
  )
}
