import type { FloorDocument } from '@/lib/domain/floorPlan'
import type { Assignments, ZoneStaff } from '@/lib/domain/zoneStaff'
import * as sales from '@/lib/services/core/sales'
import { backgroundOf, toCorePlan, toFloorDocument, toZoneStaff } from '@/lib/services/core/salesBridge'
import * as coreTables from '@/lib/services/core/tables'

// Plan T2: el plano del sistema propio viaja como el mismo documento; el fondo guardado se trae por su URL pública.
async function corePlan(id: number): Promise<FloorDocument> {
  const plan = await coreTables.readPlan(id)
  return toFloorDocument(plan, typeof plan.background === 'string' ? plan.background : await backgroundOf(id, plan.revision, plan.background === true))
}
export const readPlan = (id: number) => (corePlan(id))
export async function savePlan(configId: number, plan: FloorDocument) {
  const saved = await coreTables.savePlan(plan.id as number, toCorePlan(plan, plan.id as number))
  return toFloorDocument(saved, plan.background ?? await backgroundOf(saved.id, saved.revision, saved.background === true))
}
// Elimina un piso del terminal (caja cerrada, como guardar el plano). `removed`: se borró con sus mesas. `archived`: tenía
// ventas en el historial, así que se archivó y se desvinculó; para el restaurante desaparece igual.
export async function deleteFloor(configId: number, floorId: number) {
  return { id: floorId, ...(await coreTables.deleteFloor(floorId)) }
}
export type { Assignments } from '@/lib/domain/zoneStaff'
// Quién atiende cada zona ahora: el ajuste del turno si lo hay, o el reparto habitual del piso (`source` lo dice).
// Sin turno abierto (`sessionId` nulo) devuelve siempre el habitual.
export async function readZoneStaff(floorId: number, sessionId?: number | null): Promise<ZoneStaff> {
  const now = await coreTables.zoneStaff(floorId, sessionId ?? null)
  return toZoneStaff(now, now.source === 'shift' ? await coreTables.zoneStaff(floorId, null) : null)
}
// Reparto habitual del piso: no necesita caja abierta.
export function assignZoneStaff(configId: number, floorId: number, assignments: Assignments) {
  return coreTables.setZoneStaff(floorId, assignments)
}
// Ajuste solo de este turno; `null` lo borra y el turno vuelve al reparto habitual.
export function assignZones(sessionId: number, floorId: number, assignments: Assignments | null) {
  return sales.assignShiftZones(sessionId, floorId, assignments)
}

// En el sistema propio el aviso de plato listo ya llega solo a los meseros de la zona: no hay que filtrar en la tablet.
export const zoneNoticeTargets = (orderIds: number[]) => (Promise.resolve({} as Record<string, number[]>))

export const floorBackgroundUrl = (floorId: number, revision: number) =>
  coreTables.backgroundUrl(floorId, revision)
