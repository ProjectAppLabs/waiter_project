// Reglas puras del empleado: turno de hoy (shift_start / shift_end de hr.employee, horas decimales),
// cronómetro del turno y el empleado recordado en el dispositivo. El turno lo abre el servidor
// (`hr.employee.waiter_start_my_shift`) para la cuenta que entró con su usuario y su contraseña.

export interface Shift { from: number; to: number }

// Odoo entrega 0.0 cuando el campo Float está vacío: un turno de 0 a 0 es "Sin horario".
export function toShift(start: number | false | null | undefined, end: number | false | null | undefined): Shift | null {
  const from = Number(start) || 0
  const to = Number(end) || 0
  if (from === 0 && to === 0) return null
  return { from, to }
}

// 10.5 → "10:30 a. m."; 14 → "2:00 p. m." (forma española de las 12 horas del kit).
export function formatHour(hour: number): string {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60)
  const suffix = h < 12 || h === 24 ? 'a. m.' : 'p. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

// Turno en el formulario (<input type="time">): 8.5 ↔ "08:30". Vacío es «sin turno» (0 en Odoo).
export function hoursToTime(hour: number | null | undefined): string {
  if (hour === null || hour === undefined || (!hour && hour !== 0)) return ''
  const h = Math.floor(hour), m = Math.round((hour - h) * 60)
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function timeToHours(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return match ? Number(match[1]) + Number(match[2]) / 60 : null
}

export const shiftLabel = (shift: Shift | null, none: string): string => (shift ? `${formatHour(shift.from)} – ${formatHour(shift.to)}` : none)

// Las fechas de Odoo llegan en UTC sin zona ("2026-09-06 10:00:00").
export const fromOdooDatetime = (value: string): Date => new Date(value.replace(' ', 'T') + 'Z')
export const toOdooDatetime = (date: Date): string => date.toISOString().slice(0, 19).replace('T', ' ')

// Cronómetro del turno "04:25:32" (tarjeta Tiempo del modal Ajustes).
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export const EMPLOYEE_KEY = 'waiter.employee'
export interface StoredEmployee { id: number; checkIn: string; token: string; sessionEnds?: string | null }
// El empleado activo se recuerda en el dispositivo (id, hora de entrada y token de sesión) para sobrevivir
// a una recarga. El token nunca se muestra: solo viaja a Odoo para probar quién pide el cambio de PIN o el
// cierre del turno; caduca a las 16 horas y muere al cerrar el turno.
export function readStoredEmployee(): StoredEmployee | null {
  try {
    const raw = JSON.parse(localStorage.getItem(EMPLOYEE_KEY) || 'null') as Partial<StoredEmployee> | null
    if (!raw || !Number.isInteger(raw.id) || (raw.id as number) <= 0 || typeof raw.checkIn !== 'string') return null
    return { id: raw.id as number, checkIn: raw.checkIn, token: typeof raw.token === 'string' ? raw.token : '', sessionEnds: typeof raw.sessionEnds === 'string' ? raw.sessionEnds : null }
  } catch { return null }
}
export function storeEmployee(value: StoredEmployee | null): void {
  try { if (value) localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(value)); else localStorage.removeItem(EMPLOYEE_KEY) } catch { /* sin almacenamiento */ }
}
