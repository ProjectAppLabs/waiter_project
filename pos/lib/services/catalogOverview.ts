import { onCore } from '@/lib/domain/backend'
import * as coreCatalog from '@/lib/services/core/catalog'
import { toOverview } from '@/lib/services/core/catalogBridge'
import { callKw } from '@/lib/services/odoo'

// Plan R: el catálogo de la organización de una vez para la consola (projectapp_pantry ≥ 19.0.2.7.0): cada plato con el
// estado de su receta y su costo, y cada ingrediente con su costo y en cuántos platos se usa.
export interface OverviewDish {
  templateId: number; name: string; categories: string[]; categoryIds: number[]; listPrice: number; availableInPos: boolean
  hasImage: boolean; hasRecipe: boolean; ingredientsCount: number; recipeCost: number | null; missingCosts: string[]
}
export interface OverviewIngredient { templateId: number; name: string; uom: string; cost: number; usedIn: number }
export interface CatalogOverview { currency: string; dishes: OverviewDish[]; ingredients: OverviewIngredient[] }

type Raw = {
  currency: string
  dishes: { template_id: number; name: string; categories: string[]; category_ids: number[]; list_price: number; available_in_pos: boolean
    has_image: boolean; has_recipe: boolean; ingredients_count: number; recipe_cost: number | null; missing_costs: string[] }[]
  ingredients: { template_id: number; name: string; uom: string; cost: number; used_in: number }[]
}

export async function catalogOverview(): Promise<CatalogOverview> {
  if (onCore()) return toOverview(await coreCatalog.overview())
  const r = await callKw<Raw>('product.template', 'waiter_catalog_overview', [])
  return {
    currency: r.currency,
    dishes: r.dishes.map((d) => ({ templateId: d.template_id, name: d.name, categories: d.categories, categoryIds: d.category_ids, listPrice: d.list_price,
      availableInPos: d.available_in_pos, hasImage: d.has_image, hasRecipe: d.has_recipe, ingredientsCount: d.ingredients_count,
      recipeCost: d.recipe_cost, missingCosts: d.missing_costs ?? [] })),
    ingredients: r.ingredients.map((i) => ({ templateId: i.template_id, name: i.name, uom: i.uom, cost: i.cost, usedIn: i.used_in })),
  }
}

// El costo del ingrediente vale para toda la organización (plan Q: solo el dueño lo cambia).
export const setIngredientCost = (templateId: number, cost: number) => onCore() ? coreCatalog.updateProduct(templateId, { cost }).then(() => ({ template_id: templateId, cost })) :
  callKw<{ template_id: number; cost: number }>('product.template', 'waiter_set_ingredient_cost', [[templateId], cost])

// En qué está la receta de un plato: es lo que separa «Sin receta» de «Sin costo» en los filtros de la consola.
export type RecipeState = 'costed' | 'noRecipe' | 'missingCost'
export const recipeState = (d: OverviewDish): RecipeState => (!d.hasRecipe ? 'noRecipe' : d.recipeCost === null ? 'missingCost' : 'costed')
