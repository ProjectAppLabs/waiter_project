import type { Role } from '@/lib/domain/roles'

export const ROLE_VIEWS = ['dashboard', 'tables', 'orders', 'reservations', 'history', 'inventory', 'kitchen', 'sales', 'customers', 'billing'] as const
// `refund_orders` (plan U1): devolver pedidos cobrados; por omisión solo el encargado.
export const ROLE_ACTIONS = ['create_orders', 'charge_orders', 'serve_orders', 'edit_inventory', 'refund_orders'] as const
export type RoleView = typeof ROLE_VIEWS[number]
export type RoleAction = typeof ROLE_ACTIONS[number]
export type RolePolicy = Record<Role, { views: RoleView[]; actions: RoleAction[] }>
export const DEFAULT_ROLE_POLICY: RolePolicy = {
  waiter: { views: ['tables'], actions: ['create_orders', 'serve_orders'] },
  cashier: { views: ['orders'], actions: ['create_orders', 'charge_orders'] },
  admin: { views: [...ROLE_VIEWS], actions: [...ROLE_ACTIONS] },
}
export const roleCan = (role: Role, permission: RoleAction | RoleView, policy = DEFAULT_ROLE_POLICY): boolean =>
  role === 'admin' || [...policy[role].views, ...policy[role].actions].includes(permission)
