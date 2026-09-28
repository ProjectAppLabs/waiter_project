import type { AccountRole } from '@/lib/domain/roles'
import { callKw } from '@/lib/services/odoo'

// Plan O: el equipo de la organización con los restaurantes de cada quien (`waiter_config_ids`, addon ≥ 19.0.2.5.0).
export interface TeamMember { id: number; name: string; detail: string; role: AccountRole | null; configIds: number[] }
type Raw = { id: number; name: string; login?: string; waiter_role: AccountRole | false; waiter_config_ids: number[] }

export async function listTeamEmployees(): Promise<TeamMember[]> {
  const rows = await callKw<Raw[]>('hr.employee', 'search_read', [[['active', '=', true]], ['name', 'waiter_role', 'waiter_config_ids']], { order: 'name asc' })
  return rows.map((r) => ({ id: r.id, name: r.name, detail: 'Con PIN', role: r.waiter_role || null, configIds: r.waiter_config_ids ?? [] }))
}

export async function listTeamUsers(): Promise<TeamMember[]> {
  const rows = await callKw<Raw[]>('res.users', 'search_read', [[['share', '=', false]], ['name', 'login', 'waiter_role', 'waiter_config_ids']], { order: 'name asc' })
  return rows.map((r) => ({ id: r.id, name: r.name, detail: r.login ?? '', role: r.waiter_role || null, configIds: r.waiter_config_ids ?? [] }))
}

export const setEmployeeRestaurants = (id: number, configIds: number[]) => callKw('hr.employee', 'waiter_set_restaurants', [id, configIds])
export const setUserRestaurants = (id: number, configIds: number[]) => callKw('res.users', 'waiter_set_restaurants', [id, configIds])
