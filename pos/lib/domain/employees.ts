
export interface Shift { from: number; to: number }

// 10.5 → "10:30 a. m."; 14 → "2:00 p. m." (forma española de las 12 horas del kit).
export function formatHour(hour: number): string {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60)
  const suffix = h < 12 || h === 24 ? 'a. m.' : 'p. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

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

// Cronómetro del turno "04:25:32" (tarjeta Tiempo del modal Ajustes).
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function clearStoredEmployee(): void {
  try { localStorage.removeItem('waiter.employee') } catch { /* sin almacenamiento */ }
}
