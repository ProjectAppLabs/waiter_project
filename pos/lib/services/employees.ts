import { toShift, type Shift } from '@/lib/domain/employees'
import type { AccountRole } from '@/lib/domain/roles'
import { callKw } from '@/lib/services/odoo'

// Empleados del terminal. Todo el PIN se resuelve en el servidor con los métodos de `projectapp_ops`
// (`waiter_check_pin`, `waiter_change_pin`, `waiter_forgot_pin`, `waiter_end_shift`): el POS nunca ve el PIN
// guardado ni su hash. Es el único archivo que conoce los campos de hr.employee.
const EMPLOYEE = 'hr.employee'
const LIST_FIELDS = ['name', 'waiter_role', 'employee_code', 'shift_start', 'shift_end']

export interface PosEmployee { id: number; name: string; code: string | null; role: AccountRole | null; shift: Shift | null }
export interface EmployeeProfile {
  id: number; name: string; code: string | null; phone: string | null; email: string | null; address: string | null
  joiningDate: string | null; accessRole: AccountRole | null; employmentStatus: string | null; manager: string | null
  jobTitle: string | null; shift: Shift | null
}
export interface CheckedEmployee { id: number; name: string; code: string | null; role: AccountRole | null; shift: Shift | null; userId: number | null }
export type PinResult =
  | { ok: true; employee: CheckedEmployee; attendanceId: number; token: string }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; lockedUntil: string }
  | { ok: false; reason: 'unknown' }

interface RawEmployee {
  id: number; name: string; waiter_role: AccountRole | false; employee_code: string | false
  shift_start: number | false; shift_end: number | false
}
interface RawProfile extends RawEmployee {
  work_phone: string | false; mobile_phone: string | false; work_email: string | false; job_title: string | false
  parent_id: [number, string] | false; joining_date: string | false; employment_status: string | false
}
interface RawPrivate { private_street: string | false; private_city: string | false; private_email: string | false; private_phone: string | false }
interface RawPin {
  ok: boolean; reason?: 'wrong' | 'locked' | 'unknown'; attempts_left?: number; locked_until?: string
  attendance_id?: number; token?: string
  employee?: { id: number; name: string; waiter_role: AccountRole | false; employee_code: string | false; shift_start: number; shift_end: number; user_id: number | false }
}

const or = (v: string | false | null | undefined): string | null => (v ? v : null)

// Selector del "Inicio de empleado": los empleados activos del terminal, con su turno de hoy.
// El servidor la resuelve (`waiter_login_list`): el código, el rol y el turno son campos de RR. HH. y un
// mesero no los puede leer por search_read, así que la lista le llegaba vacía y no podía identificarse.
export async function listPosEmployees(configId?: number | null): Promise<PosEmployee[]> {
  const rows = await callKw<RawEmployee[]>(EMPLOYEE, 'waiter_login_list', [configId ?? false])
  return rows.map((r) => ({ id: r.id, name: r.name, code: or(r.employee_code), role: r.waiter_role || null, shift: toShift(r.shift_start, r.shift_end) }))
}

// "Iniciar turno": el servidor compara el PIN, cuenta los fallos, bloquea diez minutos tras cinco, abre la
// asistencia y emite el token de sesión del empleado (identidad de las acciones sensibles: nunca se muestra).
export async function checkPin(employeeId: number, pin: string): Promise<PinResult> {
  const raw = await callKw<RawPin>(EMPLOYEE, 'waiter_check_pin', [employeeId, pin])
  if (raw.ok && raw.employee) {
    const e = raw.employee
    return {
      ok: true, attendanceId: raw.attendance_id as number, token: raw.token ?? '',
      employee: { id: e.id, name: e.name, code: or(e.employee_code), role: e.waiter_role || null, shift: toShift(e.shift_start, e.shift_end), userId: e.user_id || null },
    }
  }
  if (raw.reason === 'locked') return { ok: false, reason: 'locked', lockedUntil: raw.locked_until ?? '' }
  if (raw.reason === 'unknown') return { ok: false, reason: 'unknown' }
  return { ok: false, reason: 'wrong', attemptsLeft: raw.attempts_left ?? 0 }
}

// El token prueba que quien pide el cambio es el empleado del turno: sin él, Odoo responde AccessError.
export const changePin = (employeeId: number, newPin: string, token: string | null): Promise<true> =>
  callKw<true>(EMPLOYEE, 'waiter_change_pin', [employeeId, newPin, token])

// Siempre devuelve true: el servidor nunca revela si el correo existe.
export const forgotPin = (email: string): Promise<true> => callKw<true>(EMPLOYEE, 'waiter_forgot_pin', [email])

export interface EndShift { ok: boolean; attendanceId: number | false; workedHours: number }
export async function endShift(employeeId: number, token: string | null): Promise<EndShift> {
  const raw = await callKw<{ ok: boolean; attendance_id: number | false; worked_hours: number }>(EMPLOYEE, 'waiter_end_shift', [employeeId, token])
  return { ok: raw.ok, attendanceId: raw.attendance_id, workedHours: raw.worked_hours }
}

// Perfil de "Información del empleado". Los campos privados solo los lee RR. HH.: si Odoo los niega quedan en null ("—").
export async function getEmployeeProfile(id: number): Promise<EmployeeProfile> {
  const [pub] = await callKw<RawProfile[]>(EMPLOYEE, 'read',
    [[id], [...LIST_FIELDS, 'work_phone', 'mobile_phone', 'work_email', 'job_title', 'parent_id', 'joining_date', 'employment_status']])
  const priv = await callKw<RawPrivate[]>(EMPLOYEE, 'read', [[id], ['private_street', 'private_city', 'private_email', 'private_phone']])
    .then((r) => r[0]).catch(() => null)
  const address = [or(priv?.private_street), or(priv?.private_city)].filter(Boolean).join(', ')
  return {
    id, name: pub.name, code: or(pub.employee_code), phone: or(pub.work_phone) ?? or(pub.mobile_phone) ?? or(priv?.private_phone),
    email: or(pub.work_email) ?? or(priv?.private_email), address: address || null, joiningDate: or(pub.joining_date),
    accessRole: pub.waiter_role || null, employmentStatus: or(pub.employment_status), manager: pub.parent_id ? pub.parent_id[1] : null,
    jobTitle: or(pub.job_title), shift: toShift(pub.shift_start, pub.shift_end),
  }
}

interface RawAttendance { id: number; check_in: string }
export async function findOpenAttendance(employeeId: number): Promise<{ id: number; checkIn: string } | null> {
  const rows = await callKw<RawAttendance[]>('hr.attendance', 'search_read',
    [[['employee_id', '=', employeeId], ['check_out', '=', false]], ['check_in']], { limit: 1, order: 'check_in desc' })
  return rows.length ? { id: rows[0].id, checkIn: rows[0].check_in } : null
}

// Por el mismo motivo que la lista: un mesero no puede leer estos campos directamente, así que se piden
// al servidor y se busca el suyo. Sin esto, recargar la página dejaba al mesero sin empleado activo.
export async function readEmployee(id: number, configId: number | null = null): Promise<PosEmployee> {
  const found = (await listPosEmployees(configId)).find((e) => e.id === id)
  if (!found) throw new Error(`El empleado ${id} ya no está disponible en este terminal.`)
  return found
}

// Preferencias de aviso del usuario del terminal (res.users.get_waiter_notify / set_waiter_notify).
export type NotifyPrefs = Record<NotifyKey, boolean>
export type NotifyKey = 'kitchen_popup' | 'kitchen_sound' | 'inventory_popup' | 'inventory_sound' | 'system_popup' | 'system_sound'
export const NOTIFY_KEYS: NotifyKey[] = ['kitchen_popup', 'kitchen_sound', 'inventory_popup', 'inventory_sound', 'system_popup', 'system_sound']

export const getNotifyPrefs = (uid: number): Promise<NotifyPrefs> => callKw<NotifyPrefs>('res.users', 'get_waiter_notify', [[uid]])
export const setNotifyPrefs = (uid: number, prefs: Partial<NotifyPrefs>): Promise<NotifyPrefs> =>
  callKw<NotifyPrefs>('res.users', 'set_waiter_notify', [[uid], prefs])
