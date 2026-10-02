import type { RolePolicy } from '@/lib/domain/permissions'
import * as sales from '@/lib/services/core/sales'
import { toRolePolicy } from '@/lib/services/core/salesBridge'

// Sin `policy` lee; con `policy` la guarda (solo el dueño). En el sistema propio la política es de la organización.
export async function rolePolicy(configId: number, policy?: RolePolicy): Promise<RolePolicy> {
  return toRolePolicy(policy ? await sales.putRolePolicy(policy) : (await sales.getSettings(configId)).role_policy)
}
