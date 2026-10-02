import * as coreCatalog from '@/lib/services/core/catalog'
import { toOverview } from '@/lib/services/core/catalogBridge'

// Plan R: el catálogo de la organización de una vez para la consola: cada plato con el
// estado de su receta y su costo, y cada ingrediente con su costo y en cuántos platos se usa.
export interface OverviewDish {
  templateId: number; name: string; categories: string[]; categoryIds: number[]; listPrice: number; availableInPos: boolean
  hasImage: boolean; hasRecipe: boolean; ingredientsCount: number; recipeCost: number | null; missingCosts: string[]
}
export interface OverviewIngredient { templateId: number; name: string; uom: string; cost: number; usedIn: number }
export interface CatalogOverview { currency: string; dishes: OverviewDish[]; ingredients: OverviewIngredient[] }

export async function catalogOverview(): Promise<CatalogOverview> {
  return toOverview(await coreCatalog.overview())
}

// El costo del ingrediente vale para toda la organización (plan Q: solo el dueño lo cambia).
export const setIngredientCost = (templateId: number, cost: number) => coreCatalog.updateProduct(templateId, { cost }).then(() => ({ template_id: templateId, cost }))

// En qué está la receta de un plato: es lo que separa «Sin receta» de «Sin costo» en los filtros de la consola.
export type RecipeState = 'costed' | 'noRecipe' | 'missingCost'
export const recipeState = (d: OverviewDish): RecipeState => (!d.hasRecipe ? 'noRecipe' : d.recipeCost === null ? 'missingCost' : 'costed')
