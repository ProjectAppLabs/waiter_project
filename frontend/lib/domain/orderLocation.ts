import type { FloorDocument } from '@/lib/domain/floorPlan'
import { parseFloorName } from '@/lib/domain/tablesKit'
import type { Catalog } from '@/lib/types'

export interface OrderLocation {
  floorId?: number | null
  zoneId?: string | null
  floor: string | null
  zone: string | null
  zoneStatus: 'loading' | 'ready' | 'unassigned' | 'unavailable'
}

// Los números de mesa se repiten entre pisos: la ubicación se resuelve siempre por id.
export function orderLocation(tableId: number, catalog: Pick<Catalog, 'tables' | 'floors'>, plan: FloorDocument | null | undefined): OrderLocation {
  const table = catalog.tables.find((t) => t.id === tableId)
  const floor = catalog.floors.find((f) => f.id === table?.floorId)
  const base = { floorId: floor?.id ?? null, zoneId: null, floor: floor ? parseFloorName(floor.name).label : null, zone: null }
  if (!table || !floor || plan === null) return { ...base, zoneStatus: 'unavailable' }
  if (plan === undefined) return { ...base, zoneStatus: 'loading' }
  const plannedTable = plan.id === floor.id ? plan.tables.find((t) => t.id === tableId) : undefined
  if (!plannedTable) return { ...base, zoneStatus: 'unavailable' }
  if (!plannedTable.zone) return { ...base, zoneStatus: 'unassigned' }
  const zone = plan.zones.find((z) => z.id === plannedTable.zone)?.name
  return zone ? { ...base, zoneId: plannedTable.zone, zone, zoneStatus: 'ready' } : { ...base, zoneStatus: 'unavailable' }
}

// Las claves incluyen el piso: nombres e incluso ids de zona pueden repetirse en planos distintos.
export function locationZoneKey(location: OrderLocation): string {
  return JSON.stringify([location.floorId, location.zoneId])
}

export function matchesLocation(tableId: number | null, location: OrderLocation | undefined, floor: string, zone: string): boolean {
  if (floor === 'no_table') return tableId === null
  if (floor !== 'all' && String(location?.floorId) !== floor) return false
  if (zone === 'all') return true
  if (tableId === null || !location) return false
  if (zone === 'unassigned') return location.zoneStatus === 'unassigned'
  if (zone === 'unavailable') return location.zoneStatus === 'unavailable'
  return location.zoneStatus === 'ready' && locationZoneKey(location) === zone
}
