import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as core from '@/lib/services/core/pos'
import * as sales from '@/lib/services/core/sales'
import { toPosSession } from '@/lib/services/core/salesBridge'

import type { AccountRole } from '@/lib/domain/roles'

export interface AuthUser { uid: number; name: string; companyId: number; role: AccountRole }
export interface PosSession { id: number; configId: number; state: 'opened' | 'opening_control' }

export function logout(): Promise<void> {
  return core.logout().then(() => undefined)
}

// Caja abierta del restaurante elegido; sin contexto de restaurante no hay caja.
export async function getOpenSession(configId: number | null = null): Promise<PosSession | null> {
  // Plan T2: el turno de caja abierto del restaurante en el sistema propio.
  const r = configId ?? currentRestaurantId()
  const shift = r === null ? null : await sales.openShift(r)
  return shift ? toPosSession(shift) : null
}

export function changePassword(current: string, next: string): Promise<boolean> {
  return core.changePassword(current, next).then(() => true)
}
