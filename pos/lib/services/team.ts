import { toShift, type Shift } from '@/lib/domain/employees'
import type { AccountRole } from '@/lib/domain/roles'
import { callKw } from '@/lib/services/odoo'

// Plan P: cada persona de la organización es una cuenta (`res.users`, su usuario y su correo) con su empleado vinculado
// (`hr.employee`, su rol, sus restaurantes y su turno). La consola la da de alta, la edita, le reenvía la invitación y la
// desactiva con los métodos de `projectapp_ops` (≥ 19.0.2.6.0).
export interface Person {
  id: number; name: string; role: AccountRole | null; configIds: number[]; shift: Shift | null
  userId: number | null; username: string | null; email: string | null
  // «pending»: aún no ha puesto su contraseña con el código de la invitación.
  status: 'active' | 'pending' | 'no_account'
}
export interface PersonValues {
  name: string; username: string; email: string; role: AccountRole; configIds: number[]; shiftStart: number | null; shiftEnd: number | null
}

type RawEmployee = { id: number; name: string; waiter_role: AccountRole | false; waiter_config_ids: number[]; shift_start: number | false; shift_end: number | false; user_id: [number, string] | false; work_email: string | false }
type RawUser = { id: number; login: string; email: string | false; waiter_activated?: boolean }

export async function listPeople(): Promise<Person[]> {
  const rows = await callKw<RawEmployee[]>('hr.employee', 'search_read',
    [[['active', '=', true]], ['name', 'waiter_role', 'waiter_config_ids', 'shift_start', 'shift_end', 'user_id', 'work_email']], { order: 'name asc' })
  const userIds = rows.flatMap((r) => (r.user_id ? [r.user_id[0]] : []))
  // El estado de la invitación es de la cuenta; si no se puede leer, la persona se muestra sin él.
  const users = userIds.length
    ? await callKw<RawUser[]>('res.users', 'read', [userIds, ['login', 'email', 'waiter_activated']]).catch(() => [] as RawUser[])
    : []
  const byId = new Map(users.map((u) => [u.id, u]))
  return rows.map((r) => {
    const user = r.user_id ? byId.get(r.user_id[0]) : undefined
    return {
      id: r.id, name: r.name, role: r.waiter_role || null, configIds: r.waiter_config_ids ?? [], shift: toShift(r.shift_start, r.shift_end),
      userId: r.user_id ? r.user_id[0] : null, username: user?.login ?? null, email: (user?.email || r.work_email) || null,
      status: !r.user_id ? 'no_account' : user && user.waiter_activated === false ? 'pending' : 'active',
    }
  })
}

const toOdoo = (v: Partial<PersonValues>) => ({
  ...(v.name !== undefined && { name: v.name }), ...(v.username !== undefined && { username: v.username }), ...(v.email !== undefined && { email: v.email }),
  ...(v.role !== undefined && { role: v.role }), ...(v.configIds !== undefined && { config_ids: v.configIds }),
  ...(v.shiftStart !== undefined && { shift_start: v.shiftStart ?? 0 }), ...(v.shiftEnd !== undefined && { shift_end: v.shiftEnd ?? 0 }),
})

export const invitePerson = (values: PersonValues) =>
  callKw<{ employee_id: number; user_id: number }>('hr.employee', 'waiter_invite_person', [toOdoo(values)])
// El usuario no cambia al editar: es con lo que la persona entra y firma su historial.
export const updatePerson = (employeeId: number, values: Omit<Partial<PersonValues>, 'username'>) =>
  callKw<true>('hr.employee', 'waiter_update_person', [employeeId, toOdoo(values)])
export const resendInvite = (employeeId: number) => callKw<unknown>('hr.employee', 'waiter_resend_invite', [employeeId])
export const deactivatePerson = (employeeId: number) => callKw<unknown>('hr.employee', 'waiter_deactivate_person', [employeeId])
