import type { SalesHistory } from '@/lib/domain/insights'
import { salesInsights } from '@/lib/services/core/sales'
import { toSalesHistory } from '@/lib/services/core/salesBridge'

// Historial de ventas ya sumado por el servidor (84 días por día; 28 días por producto): una sola llamada para el tablero.
export async function getSalesHistory(configId: number): Promise<SalesHistory> {
  return toSalesHistory(await salesInsights(configId))
}
