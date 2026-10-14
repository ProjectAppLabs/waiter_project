export type StockStatus = 'out' | 'low' | 'ok'
export const LOW_STOCK = 5

export function stockStatus(qty: number, low = LOW_STOCK): StockStatus {
  if (qty <= 0) return 'out'
  return qty <= low ? 'low' : 'ok'
}
