'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { FloorInfoChip } from '@/components/tables/FloorHeader'
import { FloorPlan } from '@/components/tables/FloorPlan'
import { FloorZones } from '@/components/tables/FloorZones'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import type { TableView } from '@/lib/domain/tableState'
import { parseFloorName, remainingByTemplate } from '@/lib/domain/tablesKit'
import { readPlan, floorBackgroundUrl } from '@/lib/services/floorPlan'
import type { TableReservation } from '@/lib/services/tables'
import type { Floor } from '@/lib/types'
import { cn } from '@/lib/utils'

// Un piso del salón con todo lo suyo: carga su plano, su lateral de zonas e información y dibuja sus mesas.
// El salón monta uno (vista normal) o dos lado a lado (pantalla partida); cada panel es independiente salvo la mesa
// seleccionada, que es una sola en toda la pantalla. `refreshKey` cambia cuando el catálogo se recarga (p. ej. tras
// guardar el plano) y obliga a releerlo. `header` contiene el selector de piso de cada lateral.
// Último plano leído de cada piso. Vive fuera del componente: al volver a Mesas (o cambiar de piso) el plano completo
// —paredes, zonas, imágenes— se pinta al instante y se relee detrás. Antes solo las mesas salían enseguida y el resto
// «saltaba» un momento después. El plano casi no cambia: al guardarlo en el editor, la carta se recarga (`refreshKey`)
// y se relee.
const planCache = new Map<number, FloorDocument>()

export function FloorPane({ floor, configId, views, reserved, selectedId, onSelect, pickFree, codeFor, refreshKey, header, controls, onVisibleTables, onOpenTable, compact = false, children }: {
  floor: Floor; configId: number; views: TableView[]; reserved: Record<number, TableReservation | null>; selectedId: number | null
  onSelect: (id: number) => void; pickFree: boolean; codeFor: (view: TableView) => string | null; refreshKey: unknown
  onOpenTable?: (id: number) => void
  onVisibleTables?: (floorId: number, ids: number[] | null) => void
  header?: ReactNode; controls?: ReactNode; compact?: boolean; children?: ReactNode
}) {
  const [plan, setPlan] = useState<FloorDocument | null>(() => planCache.get(floor.id) ?? null)
  const [visibleIds, setVisibleIds] = useState<number[] | null>(null)
  const [zoneStaff, setZoneStaff] = useState<Record<string, string[]>>({})
  useEffect(() => {
    let alive = true
    void readPlan(floor.id).then((p) => { planCache.set(floor.id, p); if (alive) { setPlan(p); setVisibleIds(null) } }).catch(() => { if (alive) setPlan(null) })
    return () => { alive = false }
  }, [floor.id, refreshKey])
  useEffect(() => { onVisibleTables?.(floor.id, visibleIds) }, [floor.id, visibleIds, onVisibleTables])
  const current = plan?.id === floor.id ? plan : planCache.get(floor.id) ?? null
  return (
    <section aria-label={parseFloorName(floor.name).label} className="relative flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="flex flex-1 min-h-0 min-w-0">
        <aside aria-label={parseFloorName(floor.name).label} className={cn('shrink-0 m-3 mr-0 rounded-lg border border-border bg-surface/40 overflow-y-auto p-4 flex flex-col gap-5', compact ? 'w-[200px]' : 'w-[248px]')}>
          {header}
          <div className="border-t border-border pt-4">
            <FloorInfoChip type={parseFloorName(floor.name).type} remaining={remainingByTemplate(views.filter((v) => !reserved[v.table.id]))} />
          </div>
          {current && <FloorZones key={floor.id} plan={current} floorName={parseFloorName(floor.name).label} configId={configId} onFilter={setVisibleIds} onStaff={setZoneStaff} />}
          {controls && <div className="mt-auto border-t border-border pt-4">{controls}</div>}
        </aside>
        <div className="relative flex-1 min-w-0 min-h-0 flex flex-col">
          <FloorPlan plan={current} zoneStaff={zoneStaff} visibleIds={visibleIds} views={views} selectedId={selectedId} onSelect={onSelect} onOpenTable={onOpenTable} pickFree={pickFree} codeFor={codeFor} reserved={reserved}
            background={floor.hasBackground ? floorBackgroundUrl(floor.id, current?.revision ?? 0) : null} />
          {children}
        </div>
      </div>
    </section>
  )
}
