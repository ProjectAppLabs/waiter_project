import { onCore } from '@/lib/domain/backend'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import type { Assignments, StaffSource, ZoneStaff } from '@/lib/domain/zoneStaff'
import * as sales from '@/lib/services/core/sales'
import * as coreTables from '@/lib/services/core/tables'
import { backgroundOf, toCorePlan, toFloorDocument, toZoneStaff } from '@/lib/services/core/salesBridge'
import { callKw } from '@/lib/services/odoo'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan T2: el plano del sistema propio viaja como el mismo documento; el fondo guardado se trae por su URL pública.
async function corePlan(id: number): Promise<FloorDocument> {
  const plan = await coreTables.readPlan(id)
  return toFloorDocument(plan, typeof plan.background === 'string' ? plan.background : await backgroundOf(id, plan.revision, plan.background === true))
}
export const readPlan = (id: number) => (onCore() ? corePlan(id) : callKw<FloorDocument>('restaurant.floor', 'waiter_read_plan', [[id]]))
export async function savePlan(configId: number, plan: FloorDocument) {
 if (onCore()) { const saved = await coreTables.savePlan(plan.id as number, toCorePlan(plan, plan.id as number)); return toFloorDocument(saved, plan.background ?? await backgroundOf(saved.id, saved.revision, saved.background === true)) }
 const e = useAuthStore.getState().employee
 return callKw<FloorDocument>('restaurant.floor', 'waiter_save_plan', [configId, plan.id, plan, e?.id, e?.token])
}
// Elimina un piso del terminal (caja cerrada, como guardar el plano). `removed`: se borró con sus mesas. `archived`: tenía
// ventas en el historial, así que se archivó y se desvinculó; para el restaurante desaparece igual.
export async function deleteFloor(configId: number, floorId: number) {
 if (onCore()) return { id: floorId, ...(await coreTables.deleteFloor(floorId)) }
 const e = useAuthStore.getState().employee
 return callKw<{id:number;result:'removed'|'archived'|'detached'}>('restaurant.floor', 'waiter_delete_floor', [configId, floorId, e?.id, e?.token])
}
export type { Assignments } from '@/lib/domain/zoneStaff'
// Quién atiende cada zona ahora: el ajuste del turno si lo hay, o el reparto habitual del piso (`source` lo dice).
// Sin turno abierto (`sessionId` nulo) devuelve siempre el habitual.
export async function readZoneStaff(floorId: number, sessionId?: number | null): Promise<ZoneStaff> {
 if (onCore()) {
   const now = await coreTables.zoneStaff(floorId, sessionId ?? null)
   return toZoneStaff(now, now.source === 'shift' ? await coreTables.zoneStaff(floorId, null) : null)
 }
 const raw = await callKw<{assignments: Assignments | false; source: StaffSource; plan: Assignments | false}>('restaurant.floor', 'waiter_zone_staff_for', [[floorId], sessionId ?? false])
 return { assignments: raw.assignments || {}, source: raw.source, plan: raw.plan || {} }
}
// Reparto habitual del piso: no necesita caja abierta.
export function assignZoneStaff(configId: number, floorId: number, assignments: Assignments) {
 if (onCore()) return coreTables.setZoneStaff(floorId, assignments)
 const e = useAuthStore.getState().employee
 return callKw('restaurant.floor', 'waiter_assign_zone_staff', [configId, floorId, assignments, e?.id, e?.token])
}
// Ajuste solo de este turno; `null` lo borra y el turno vuelve al reparto habitual.
export function assignZones(sessionId: number, floorId: number, assignments: Assignments | null) {
 if (onCore()) return sales.assignShiftZones(sessionId, floorId, assignments)
 const e = useAuthStore.getState().employee
 return callKw('pos.session', 'waiter_assign_zones', [[sessionId], floorId, assignments, e?.id, e?.token])
}

// En el sistema propio el aviso de plato listo ya llega solo a los meseros de la zona: no hay que filtrar en la tablet.
export const zoneNoticeTargets = (orderIds: number[]) => (onCore() ? Promise.resolve({} as Record<string, number[]>) : callKw<Record<string, number[]>>('pos.order', 'waiter_zone_targets', [orderIds]))

// La imagen de fondo de un piso: en el sistema propio por su ruta pública, en Odoo por el binario del piso.
export const floorBackgroundUrl = (floorId: number, revision: number) =>
  onCore() ? coreTables.backgroundUrl(floorId, revision) : `/odoo/web/image/restaurant.floor/${floorId}/floor_background_image?unique=${revision}`
