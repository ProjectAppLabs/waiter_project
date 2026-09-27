'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { FloorSwitcher } from '@/components/tables/FloorHeader'
import { PageTitle } from '@/components/ui/PageHeader'
import { Icon } from '@/components/kit/Icon'
import { ReservationDetailModal } from '@/components/reservations/ReservationDetailModal'
import { ReservationTimeline, TimelineSkeleton } from '@/components/reservations/ReservationTimeline'
import { ReservationWizard } from '@/components/reservations/ReservationWizard'
import { Button } from '@/components/ui/Button'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useAuthStore } from '@/lib/stores/authStore'
import { useReservationsStore } from '@/lib/stores/reservationsStore'
import { toast } from '@/lib/stores/toastStore'

// Reservas del kit (7 – Reservation / Home.png): grilla mesa × hora del día, con piso, fecha y "Nueva reserva".
export default function ReservasPage() {
  const t = useTranslations('reservations')
  const session = useAuthStore((s) => s.session)
  const catalog = useCatalogStore((s) => s.catalog)
  const configId = session?.configId ?? catalog?.settings.configId ?? null
  const r = useReservationsStore()
  const [detail, setDetail] = useState<number | null>(null)

  useEffect(() => { if (configId) void r.load(configId) }, [configId, r.date, r.floorId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Cada visita trae la grilla fresca: al salir se olvida lo cargado (lo que se evita es repetir la misma petición
  // dentro de una visita, no volver a pedirla en la siguiente).
  useEffect(() => () => r.forget(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const floors = r.timeline?.floors ?? catalog?.floors ?? []
  const floorSelector = <FloorSwitcher compact floors={floors} activeId={r.floorId} onChange={r.setFloor} />
  const timelineCurrent = r.loadedKey === `${configId}|${r.date}|${r.floorId ?? ''}`
  return (
    <>
      <header className="shrink-0 min-h-[88px] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <PageTitle>{t('title')}</PageTitle>

        <label className="ml-auto flex items-center gap-2 h-12 px-3 rounded-md border border-border text-[15px] text-ink">
          <Icon name="reservations" size={18} className="text-soft" />
          <input type="date" aria-label={t('day')} value={r.date} onChange={(e) => r.setDate(e.target.value)} className="bg-transparent text-ink focus:outline-none" />
        </label>
        <Button variant="primary" size="compact" disabled={!configId} onClick={r.openWizard}><Icon name="plus" size={18} />{t('add')}</Button>
      </header>

      {!r.error && (!timelineCurrent || r.loading)
        ? <TimelineSkeleton floorSelector={floorSelector} />
        : <ReservationTimeline floorSelector={floorSelector} error={r.error} slots={r.timeline?.slots ?? []} tables={r.timeline?.tables ?? []} onOpen={(card) => setDetail(card.id)} />}

      <ReservationDetailModal reservationId={detail} open={detail !== null} onClose={() => setDetail(null)} configId={configId} onChanged={() => { if (configId) void r.load(configId, true) }}
        onAction={(id, state) => { if (configId) { void r.changeState(id, state, configId); setDetail(null) } }} />
      {configId && <ReservationWizard configId={configId} onCreated={(created) => {
        toast({ title: t('created', { name: created.name }), body: created.customerEmail ? t('createdMail') : t('createdBody') })
        // Con anticipo pendiente, el siguiente paso es cobrarlo: se abre el detalle con el enlace de pago listo para compartir.
        if (created.depositState === 'pending') setDetail(created.id)
      }} />}
    </>
  )
}
