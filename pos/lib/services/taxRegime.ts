import { onCore } from '@/lib/domain/backend'
import * as coreCatalog from '@/lib/services/core/catalog'
import { callKw } from '@/lib/services/odoo'
import { useAuthStore } from '@/lib/stores/authStore'

// 'mixed' no se elige: es lo que responde Odoo cuando la carta lleva impuestos distintos entre sí.
export type TaxRegime = 'inc' | 'iva' | 'none'
export interface TaxRegimeInfo { regime: TaxRegime | 'mixed'; products: number; taxes: number[] }

export async function taxRegime(configId: number, regime?: TaxRegime): Promise<TaxRegimeInfo> {
  if (onCore()) {
    const r = regime ? await coreCatalog.setTaxRegime(regime) : await coreCatalog.listTaxes()
    const dishes = (await coreCatalog.overview()).dishes.length
    return { regime: r.regime as TaxRegimeInfo['regime'], products: dishes, taxes: r.taxes.map((t) => t.id) }
  }
  const employee = useAuthStore.getState().employee
  return callKw<TaxRegimeInfo>('pos.config', 'waiter_tax_regime', [[configId], employee?.id, employee?.token, regime ?? null])
}
