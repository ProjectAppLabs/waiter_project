// Diferencia de arqueo: positiva sobra, negativa falta. "ok" dentro de la tolerancia (COP).
export const TOLERANCE = 500

// `tolerance`: la que fija el dueño en Cuadres de caja (plan Q3); la de 500 queda solo si no se pudo leer.
export function cashDifference(expected: number, counted: number, tolerance = TOLERANCE): { amount: number; tone: 'ok' | 'warn' | 'busy' } {
  const amount = Math.round(counted - expected)
  if (Math.abs(amount) <= tolerance) return { amount, tone: 'ok' }
  return { amount, tone: amount > 0 ? 'warn' : 'busy' }
}

// Plan Q: cerrar con una caja que no cuadra (por poco que sea) exige explicar por qué; el dueño lee la nota en los cuadres.
// Odoo hace la misma comprobación al cerrar.
export const needsNote = (expected: number, counted: number | null, notes: string): boolean =>
  counted !== null && Math.round(counted - expected) !== 0 && !notes.trim()
