import { type Shift } from '@/lib/domain/employees'
import type { AccountRole } from '@/lib/domain/roles'
import { toCorePerson, toPerson } from '@/lib/services/core/bridge'
import * as core from '@/lib/services/core/pos'

export interface Person {
  id: number; name: string; role: AccountRole | null; configIds: number[]; shift: Shift | null
  userId: number | null; username: string | null; email: string | null
  // «pending»: aún no ha puesto su contraseña con el código de la invitación ni ha entrado nunca.
  status: 'active' | 'pending' | 'no_account'
  // Plan Y5: valor de la hora para el pago estimado de Horas y propinas.
  hourlyRate?: number | null
}
export interface PersonValues {
  name: string; username: string; email: string; role: AccountRole; configIds: number[]; shiftStart: number | null; shiftEnd: number | null; hourlyRate?: number | null
}

export async function listPeople(): Promise<Person[]> {
  return (await core.listPeople()).map(toPerson)
}

export const invitePerson = (values: PersonValues) => core.invitePerson({ name: values.name, username: values.username, email: values.email, role: values.role, restaurant_ids: values.configIds.map(String), shift_start: values.shiftStart, shift_end: values.shiftEnd, hourly_rate: values.hourlyRate ?? null }).then((r) => ({ employee_id: Number(r.person.id), user_id: Number(r.person.id), invite_sent: r.invite_sent }))
// El usuario no cambia al editar: es con lo que la persona entra y firma su historial.
export const updatePerson = (employeeId: number, values: Omit<Partial<PersonValues>, 'username'>) => core.updatePerson(String(employeeId), toCorePerson(values)).then(() => true as const)
export const resendInvite = (employeeId: number) => (core.resendInvite(String(employeeId)))
export const deactivatePerson = (employeeId: number) => (core.deactivatePerson(String(employeeId)))
