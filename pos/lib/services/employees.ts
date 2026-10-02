import type { Shift } from '@/lib/domain/employees'
import type { AccountRole } from '@/lib/domain/roles'
import { CoreError } from '@/lib/services/core/http'
import * as coreLoyalty from '@/lib/services/core/loyalty'
import * as corePos from '@/lib/services/core/pos'

export interface PosEmployee { id: number; name: string; code: string | null; role: AccountRole | null; shift: Shift | null }
export interface EmployeeProfile {
  id: number; name: string; code: string | null; phone: string | null; email: string | null; address: string | null
  joiningDate: string | null; accessRole: AccountRole | null; employmentStatus: string | null; manager: string | null
  jobTitle: string | null; shift: Shift | null
}
// Personas del restaurante para asignar zonas y ver la configuración: el equipo de la organización que ve el encargado,
// filtrado a quienes trabajan en ese restaurante. El sistema propio no guarda código de empleado.
export async function listPosEmployees(restaurantId?: number | null): Promise<PosEmployee[]> {
  const people = await corePos.listPeople()
  return people
    .filter((p) => p.status === 'active' && (restaurantId == null || p.restaurant_ids.map(Number).includes(restaurantId)))
    .map((p) => ({ id: Number(p.id), name: p.name, code: null, role: p.role, shift: p.shift }))
}

// El perfil del panel «Mi cuenta» es el de la persona con la sesión abierta: el sistema propio solo guarda nombre,
// correo, rol y turno; los demás campos quedan vacíos.
export async function getEmployeeProfile(id: number): Promise<EmployeeProfile> {
  const { account } = await corePos.me()
  if (Number(account.id) !== id) throw new CoreError(403, 'forbidden', 'Solo puedes ver tu propio perfil.')
  return { id, name: account.name, code: null, phone: null, email: account.email, address: null, joiningDate: null,
    accessRole: account.role, employmentStatus: null, manager: null, jobTitle: null, shift: account.shift }
}

export type NotifyPrefs = Record<NotifyKey, boolean>
export type NotifyKey = 'kitchen_popup' | 'kitchen_sound' | 'inventory_popup' | 'inventory_sound' | 'system_popup' | 'system_sound'
export const NOTIFY_KEYS: NotifyKey[] = ['kitchen_popup', 'kitchen_sound', 'inventory_popup', 'inventory_sound', 'system_popup', 'system_sound']

export const getNotifyPrefs = (uid: number): Promise<NotifyPrefs> => (coreLoyalty.notifyPrefs<NotifyPrefs>())
export const setNotifyPrefs = (uid: number, prefs: Partial<NotifyPrefs>): Promise<NotifyPrefs> =>
  coreLoyalty.saveNotifyPrefs<NotifyPrefs>(prefs)
