const cop = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, useGrouping: true })

export function formatCop(amount: number): string {
  return cop.format(Math.round(amount))
}
