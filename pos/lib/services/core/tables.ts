import { currentOrg } from '@/lib/domain/tenant'
import { coreFetch } from '@/lib/services/core/http'

// Plan T2: pisos, mesas, plano, llamadas y reparto por zonas del sistema propio.
export type CallKind = 'none' | 'ordering' | 'assist' | 'bill'
export interface CoreTable {
  id: number; number: number; seats: number; x: number; y: number; width: number; height: number; shape: 'square' | 'round'; color: string
  zone_id: string; active: boolean; call: CallKind; call_at: string | null; token: string; reserved_at: string | null
}
export interface CoreFloor { id: number; name: string; sequence: number; active: boolean; revision: number; has_background: boolean; table_count: number; tables: CoreTable[] }
export interface CorePlanRect { x: number; y: number; width: number; height: number }
export interface CorePlan {
  id: number; name: string; revision: number
  tables: (CorePlanRect & { id: number | null; key: string; number: number; seats: number; zone: string })[]
  walls: (CorePlanRect & { id: string; color?: string })[]
  zones: (CorePlanRect & { id: string; name: string; color: string })[]
  decor?: unknown[]
  images?: (CorePlanRect & { id: string; data?: string })[]
  background: boolean | string | null
  background_size?: { x?: number; y?: number; width: number; height: number } | null
}
export interface CoreCall { table_id: number; table_number: number; kind: Exclude<CallKind, 'none'>; since: string }
export interface CoreZoneStaff { assignments: Record<string, number[]>; source: 'plan' | 'shift'; people: { id: number; name: string; role: string }[] }

export const listFloors = (restaurantId: number, all = false) => coreFetch<{ floors: CoreFloor[] }>(`floors?restaurant_id=${restaurantId}${all ? '&all=1' : ''}`).then((r) => r.floors)
export const createFloor = (restaurantId: number, name: string) => coreFetch<{ floor: CoreFloor }>('floors', { method: 'POST', body: { restaurant_id: restaurantId, name } }).then((r) => r.floor)
export const patchFloor = (id: number, patch: { name?: string; active?: boolean; sequence?: number }) => coreFetch<{ floor: CoreFloor }>(`floors/${id}`, { method: 'PATCH', body: patch }).then((r) => r.floor)
export const deleteFloor = (id: number) => coreFetch<{ result: 'removed' | 'archived' }>(`floors/${id}`, { method: 'DELETE' })
export const readPlan = (id: number) => coreFetch<CorePlan>(`floors/${id}/plan`)
export const savePlan = (id: number, plan: CorePlan) => coreFetch<CorePlan>(`floors/${id}/plan`, { method: 'PUT', body: plan })
export const zoneStaff = (floorId: number, shiftId: number | null) => coreFetch<CoreZoneStaff>(`floors/${floorId}/zone-staff${shiftId ? `?shift_id=${shiftId}` : ''}`)
export const setZoneStaff = (floorId: number, assignments: Record<string, number[]>) => coreFetch<CoreZoneStaff>(`floors/${floorId}/zone-staff`, { method: 'PUT', body: { assignments } })
export const listCalls = (restaurantId: number) => coreFetch<{ calls: CoreCall[] }>(`tables/calls?restaurant_id=${restaurantId}`).then((r) => r.calls)
export const setCall = (tableId: number, kind: CallKind) => coreFetch<{ table: CoreTable }>(`tables/${tableId}/call`, { method: 'PUT', body: { kind } }).then((r) => r.table)

// Las imágenes del plano salen por rutas públicas con la organización en la URL, como las fotos del catálogo.
export const backgroundUrl = (floorId: number, revision: number) => `/experience/api/pos/v1/floors/${floorId}/background?org=${currentOrg()}&v=${revision}`
export const planImageUrl = (floorId: number, imageId: string) => `/experience/api/pos/v1/floors/${floorId}/images/${encodeURIComponent(imageId)}?org=${currentOrg()}`
