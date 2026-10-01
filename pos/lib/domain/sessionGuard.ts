// Plan P: cuándo se cierra sola la sesión. En las tablets compartidas, tras un rato sin usarla (la siguiente persona no
// hereda la cuenta de la anterior); para meseros y cajeros, además, al terminar la ventana de su turno (`session_ends`).
export const IDLE_MS = 15 * 60_000
export const WARN_MS = 5 * 60_000
const REASON_KEY = 'waiter.logout-reason'

export type GuardReason = 'idle' | 'shift'
export interface GuardState { expired: GuardReason | null; warning: GuardReason | null; minutesLeft: number }

// `idleMs` en null: pantalla sin cierre por inactividad (la cocina queda encendida sin que nadie la toque).
export function guardState(now: number, lastActivity: number, sessionEnds: string | null, idleMs: number | null = IDLE_MS): GuardState {
  const ends = sessionEnds ? Date.parse(sessionEnds) : NaN
  const shiftLeft = Number.isFinite(ends) ? ends - now : Infinity
  const idleLeft = idleMs === null ? Infinity : lastActivity + idleMs - now
  if (shiftLeft <= 0) return { expired: 'shift', warning: null, minutesLeft: 0 }
  if (idleLeft <= 0) return { expired: 'idle', warning: null, minutesLeft: 0 }
  const reason: GuardReason = shiftLeft <= idleLeft ? 'shift' : 'idle'
  const left = Math.min(shiftLeft, idleLeft)
  return { expired: null, warning: left <= WARN_MS ? reason : null, minutesLeft: Math.max(1, Math.ceil(left / 60_000)) }
}

// El motivo del cierre viaja a la pantalla de inicio para explicarlo una vez.
export function rememberLogoutReason(reason: GuardReason | null): void {
  try { if (reason) sessionStorage.setItem(REASON_KEY, reason); else sessionStorage.removeItem(REASON_KEY) } catch { /* sin almacenamiento */ }
}
// Se lee sin borrarlo (el modo estricto de React monta dos veces); se borra al volver a entrar.
export function readLogoutReason(): GuardReason | null {
  try {
    const value = sessionStorage.getItem(REASON_KEY)
    return value === 'idle' || value === 'shift' ? value : null
  } catch { return null }
}
