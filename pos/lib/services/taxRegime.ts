import * as coreCatalog from '@/lib/services/core/catalog'

export type TaxRegime = 'inc' | 'iva' | 'none'
export interface TaxRegimeInfo { regime: TaxRegime | 'mixed'; products: number; taxes: number[] }

export async function taxRegime(configId: number, regime?: TaxRegime): Promise<TaxRegimeInfo> {
  const r = regime ? await coreCatalog.setTaxRegime(regime) : await coreCatalog.listTaxes()
  const dishes = (await coreCatalog.overview()).dishes.length
  return { regime: r.regime as TaxRegimeInfo['regime'], products: dishes, taxes: r.taxes.map((t) => t.id) }
}
