'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { FloorSwitcher } from '@/components/tables/FloorHeader'
import { FloorPlan } from '@/components/tables/FloorPlan'
import { Button } from '@/components/ui/Button'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { hourLabel, missingSeats, seatsOf, toggleTable } from '@/lib/domain/reservations'
import { parseFloorName } from '@/lib/domain/tablesKit'
import type { TableView } from '@/lib/domain/tableState'
import { readPlan, floorBackgroundUrl } from '@/lib/services/floorPlan'
import type { AvailableTable } from '@/lib/services/reservations'
import type { TableReservation } from '@/lib/services/tables'
import type { Floor, Table } from '@/lib/types'

// Paso 2 (Select Table.png). Es el mismo plano del salón y del editor: paredes, zonas, imágenes y mesas en su sitio, con
// el mismo encuadre. Aquí las mesas libres se eligen —una o varias: un grupo grande junta mesas, incluso de pisos
// distintos— y la barra de abajo va sumando puestos hasta que el grupo cabe. Una reservada a esa hora muestra desde
// cuándo. La disponibilidad la decidel servidor (`tables`); el plano solo la dibuja. La primera mesa tocada es la
// principal (ahí va el pre-pedido).
export function TableStep({ tables, floors, floorTables, people, date, time, selected, onSelect, onContinue, continueLabel, busy = false }: {
  tables: AvailableTable[]; floors: Floor[]; floorTables: Table[]; people: number; date: string; time: number; selected: number[]
  onSelect: (ids: number[]) => void; onContinue: () => void
  continueLabel?: string; busy?: boolean // al editar una reserva ya creada el botón guarda en vez de avanzar
}) {
  const t = useTranslations('reservations.table')
  const chosenAll = selected.flatMap((id) => tables.find((x) => x.id === id) ?? [])
  const chosen = chosenAll[0]
  const seats = seatsOf(tables, selected), missing = missingSeats(tables, selected, people)
  const status = useMemo(() => new Map(tables.map((x) => [x.id, x])), [tables])
  // Se abre en el piso de la mesa elegida o, si aún no hay, en el primero con una mesa libre para el grupo.
  const preferred = chosen?.floorId ?? tables.find((x) => x.status === 'available')?.floorId ?? tables.find((x) => x.status !== 'reserved')?.floorId ?? floors[0]?.id ?? null
  const [picked, setPicked] = useState<number | null>(null)
  const floorId = picked !== null && floors.some((f) => f.id === picked) ? picked : preferred
  const [plan, setPlan] = useState<FloorDocument | null>(null)
  useEffect(() => {
    if (floorId === null) return
    let alive = true
    readPlan(floorId).then((p) => { if (alive) setPlan(p) }).catch(() => { if (alive) setPlan(null) })
    return () => { alive = false }
  }, [floorId])

  const floor = floors.find((f) => f.id === floorId) ?? null
  const views: TableView[] = floorTables.filter((x) => x.floorId === floorId && status.has(x.id))
    .map((table) => ({ table, state: 'free', total: 0, tax: 0, orderId: null, startedAt: null, waiter: null, callSince: null }))
  const reserved: Record<number, TableReservation | null> = {}
  for (const x of tables) if (x.status === 'reserved') reserved[x.id] = { id: 0, name: '', customerName: '', people: 0, babyChair: false, state: 'confirmed', date, timeStart: 0, timeEnd: 0, label: x.reservedAt || '', timeLabel: '', tableId: x.id }
  // Libre = sin reserva a esa hora. Que una mesa no siente sola al grupo ya no la descarta: se puede juntar con otra.
  const freeHere = views.filter((v) => status.get(v.table.id)?.status !== 'reserved').length
  // Los números de mesa se repiten entre pisos: si la selección cruza pisos, cada ficha dice el suyo.
  const manyFloors = new Set(chosenAll.map((x) => x.floorId)).size > 1

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-surface">
        <span className="flex items-center gap-2 h-10 px-3 rounded-md bg-primary-soft text-primary text-[15px] font-semibold">
          <Icon name="reservations" size={16} />{new Date(`${date}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}
          <Icon name="clock" size={16} />{hourLabel(time)}
          <Icon name="users" size={16} />{people}
        </span>
        <span className="text-[14px] text-soft">{t('freeHere', { count: freeHere })}</span>
        <span className="ml-auto flex items-center gap-5 text-[14px] text-soft">
          {(['available', 'reserved'] as const).map((s) => (
            <span key={s} className="flex items-center gap-2">
              <span className={s === 'available' ? 'w-2.5 h-2.5 rounded-full bg-primary' : 'w-2.5 h-2.5 rounded-full bg-reserved'} />{t(`legend.${s}`)}
            </span>
          ))}
        </span>
        {floors.length > 1 && <FloorSwitcher floors={floors} activeId={floorId} onChange={setPicked} />}
      </header>

      <div className="relative flex-1 min-h-0 flex flex-col">
        <FloorPlan plan={plan?.id === floorId ? plan : null} views={views} selectedId={null} selectedIds={selected} pickFree reserved={reserved}
          onSelect={(id) => onSelect(toggleTable(selected, id))}
          background={floor?.hasBackground ? floorBackgroundUrl(floor.id, plan?.id === floor.id ? plan.revision : 0) : null} />
        <div role="toolbar" aria-label={t('selected')} className="absolute inset-x-4 bottom-6 z-20 mx-auto w-fit max-w-[calc(100%-2rem)] min-h-16 px-4 py-3 rounded-lg bg-overlay text-[#F7F7F7] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-xl">
          {!chosen ? <span className="text-[15px]">{t('pickHint', { people })}</span> : (
            <>
              <span className="text-[15px]">{t(chosenAll.length > 1 ? 'selectedMany' : 'selected')}</span>
              {chosenAll.map((x) => (
                <span key={x.id} className="h-10 pl-4 pr-2 rounded-md bg-[#F7F7F7] text-[#0F172A] text-[15px] font-semibold flex items-center gap-2 whitespace-nowrap">
                  {t('tableName', { number: x.tableNumber })}<span className="text-[13px] font-normal opacity-70">{manyFloors ? `${parseFloorName(x.floorName).label} · ` : ''}{t('seats', { count: x.seats })}</span>
                  <button type="button" aria-label={t('remove', { number: x.tableNumber })} onClick={() => onSelect(toggleTable(selected, x.id))} className="w-8 h-8 grid place-items-center opacity-70"><Icon name="close" size={16} /></button>
                </span>
              ))}
              {/* El contador es lo que decide: mientras falten puestos se sigue sumando mesas. */}
              <span role="status" className={missing ? 'text-[15px] font-semibold text-[#FCD34D]' : 'text-[15px] text-[#F7F7F7]/80'}>
                {missing ? t('missing', { count: missing, seats, people }) : t('fits', { seats, people })}
              </span>
              <Button variant="primary" disabled={missing > 0 || busy} onClick={onContinue}>{continueLabel ?? t('continue')}{!continueLabel && <Icon name="arrowRight" size={18} />}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
