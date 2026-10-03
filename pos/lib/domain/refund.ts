import type { RefundableLine, RefundableMethod } from '@/lib/services/core/refunds'

// Plan U1: el valor de lo que se devuelve y el reparto por método. El servidor recalcula y manda; esto es para que la
// pantalla muestre lo mismo antes de confirmar.
export type Selection = Record<number, number>

// Lo que vale devolver `qty` de una línea: todo lo que queda si se devuelve todo (sin errores de redondeo), y si no,
// el valor por unidad.
export function lineAmount(line: RefundableLine, qty: number): number {
  if (qty <= 0) return 0
  if (qty >= line.refundable_qty) return line.refundable_amount
  return Math.round(line.unit_amount * qty)
}

export function refundTotal(lines: RefundableLine[], selection: Selection, tip: number): number {
  return lines.reduce((sum, l) => sum + lineAmount(l, selection[l.line_id] ?? 0), 0) + Math.max(0, tip)
}

export const everything = (lines: RefundableLine[]): Selection => Object.fromEntries(lines.filter((l) => l.refundable_qty > 0).map((l) => [l.line_id, l.refundable_qty]))

// Reparto inicial: primero el efectivo (sale de la caja en el acto), luego los demás métodos, sin pasar de lo
// devolvible de cada uno. La persona puede cambiarlo antes de confirmar.
export function allocate(total: number, methods: RefundableMethod[]): Record<number, number> {
  let left = total
  const out: Record<number, number> = {}
  const ordered = [...methods].sort((a, b) => Number(b.type === 'cash') - Number(a.type === 'cash'))
  for (const m of ordered) {
    const take = Math.min(left, m.refundable)
    if (take > 0) { out[m.method_id] = take; left -= take }
  }
  return out
}

export const allocated = (payments: Record<number, number>) => Object.values(payments).reduce((a, b) => a + b, 0)
