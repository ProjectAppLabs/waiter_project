'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { TableStep } from '@/components/reservations/TableStep'
import { getAvailableTables, setReservationTables, type AvailableTable, type ReservationDetail } from '@/lib/services/reservations'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { toast } from '@/lib/stores/toastStore'

// Cambiar las mesas de una reserva ya creada (quitar, sumar o mover): el mismo plano y el mismo contador de puestos del
// asistente, abierto con las mesas que la reserva ya tiene. Esas mesas se ven libres porque la disponibilidad se pide
// sin contar a la propia reserva. La primera mesa de la lista queda como principal y el pre-pedido la sigue.
export function ReservationTablesEditor({ reservation, configId, onClose, onSaved }: {
  reservation: ReservationDetail; configId: number; onClose: () => void; onSaved: (updated: ReservationDetail) => void
}) {
  const t = useTranslations('reservations.detail.editTables')
  const catalog = useCatalogStore((s) => s.catalog)
  const [tables, setTables] = useState<AvailableTable[] | null>(null)
  const [selected, setSelected] = useState<number[]>(reservation.tableIds)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    getAvailableTables(configId, reservation.date, reservation.timeStart, reservation.people, reservation.prepMinutes, reservation.id)
      .then((list) => { if (alive) setTables(list) }).catch(() => { if (alive) setError(t('loadFailed')) })
    return () => { alive = false }
  }, [configId, reservation, t])

  async function save() {
    setBusy(true); setError('')
    try { const updated = await setReservationTables(reservation.id, selected); toast({ title: t('saved') }); onSaved(updated) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t('title', { name: reservation.name })} className="fixed inset-0 z-50 bg-canvas flex flex-col">
      <header className="h-[76px] shrink-0 px-6 flex items-center gap-4 bg-surface border-b border-border">
        <h2 className="text-[20px] font-semibold text-ink">{t('title', { name: reservation.name })}</h2>
        <span className="text-[15px] text-soft">{reservation.customerName}</span>
        {error && <span role="alert" className="text-[14px] text-danger-ink">{error}</span>}
        <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose} disabled={busy} className="ml-auto w-10 h-10 rounded-full bg-ink text-surface grid place-items-center"><Icon name="close" size={20} /></button>
      </header>
      {!tables || !catalog ? <p className="p-8 text-center text-dim">{error ? '' : t('loading')}</p> : (
        <TableStep tables={tables} floors={catalog.floors} floorTables={catalog.tables} people={reservation.people} date={reservation.date} time={reservation.timeStart}
          selected={selected} onSelect={setSelected} onContinue={() => void save()} continueLabel={busy ? t('saving') : t('save')} busy={busy} />
      )}
    </div>
  )
}
