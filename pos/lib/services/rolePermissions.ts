import { onCore } from '@/lib/domain/backend'
import type { RolePolicy } from '@/lib/domain/permissions'
import { callKw } from '@/lib/services/odoo'
import * as sales from '@/lib/services/core/sales'
import { toRolePolicy } from '@/lib/services/core/salesBridge'
import { useAuthStore } from '@/lib/stores/authStore'

// Sin `policy` lee; con `policy` la guarda (solo el dueño). En el sistema propio la política es de la organización.
export async function rolePolicy(configId: number, policy?: RolePolicy): Promise<RolePolicy> {
  if (onCore()) return toRolePolicy(policy ? await sales.putRolePolicy(policy) : (await sales.getSettings(configId)).role_policy)
  const employee = useAuthStore.getState().employee
  return callKw<RolePolicy>('pos.config', 'waiter_role_policy', [[configId], employee?.id, employee?.token, policy ?? null])
}
