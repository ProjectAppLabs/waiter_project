import { currentOrg } from '@/lib/domain/tenant'
import { coreFetch } from '@/lib/services/core/http'

// Plan T1: el catálogo del sistema propio (contrato «Contrato T1» en docs/planes/2026-10-01-plan-T-sistema-propio.md).
export type ProductKind = 'dish' | 'ingredient'
export type PantryCategory = 'produce' | 'meat' | 'seafood' | 'dairy' | 'dry'
export interface CoreCategory { id: number; name: string; sequence: number; station: 'kitchen' | 'bar' | 'none' }
export interface CoreTax { id: number; name: string; amount: number; included: boolean }
export interface CoreUnit { id: number; name: string; root: 'weight' | 'volume' | 'count'; factor: number }
export interface CoreSupplier { id: number; name: string; phone: string; email: string }
export interface CoreDish {
  id: number; name: string; kind: 'dish'; category_ids: number[]; tax_ids: number[]; price: number; restaurant_price?: number | null; final_price?: number
  favorite: boolean; available_in_pos: boolean; sold_out?: boolean; has_image: boolean; image_version: string; image_origin: 'real' | 'ai' | 'placeholder' | null
  description: string; diner_attributes: Record<string, unknown>; servings?: number | null; preparation_minutes: number | null
}
export interface CoreIngredient {
  id: number; name: string; kind: 'ingredient'; unit: { id: number; name: string }; pantry_category: PantryCategory; cost: number
  supplier: { id: number; name: string } | null; has_image: boolean; image_version?: string
}
export type CoreProduct = CoreDish | CoreIngredient
export interface CoreMenu { categories: CoreCategory[]; taxes: CoreTax[]; products: CoreDish[] }
export interface RecipeLineInput { ingredient_id: number; qty: number; unit_id: number }
export interface CoreRecipe {
  recipe: { yield_qty: number; lines: { ingredient_id: number; name: string; qty: number; unit: { id: number; name: string } }[]; cost: number | null; missing_costs: string[] } | null
  by_restaurant: { restaurant_id: number; servings: number | null; limiting: string[]; ingredients: { ingredient_id: number; name: string; per_serving: number; stock: number; pending: number; free: number; servings: number }[] }[]
}
export interface CoreOverview {
  dishes: { id: number; name: string; categories: string[]; category_ids: number[]; price: number; available_in_pos: boolean; has_image: boolean; has_recipe: boolean; ingredients_count: number; recipe_cost: number | null; missing_costs: string[] }[]
  ingredients: { id: number; name: string; unit: string; cost: number; used_in: number }[]
}
export interface CoreRestaurantsCatalog { dishes: { id: number; name: string; category: string; price: number }[]; prices: Record<string, Record<string, number>>; unavailable: Record<string, number[]> }
export interface CorePhoto { id: number; sequence: number; width: number; height: number }

export const getMenu = (restaurantId: number) => coreFetch<CoreMenu>(`catalog?restaurant_id=${restaurantId}`)
export const listProducts = (kind?: ProductKind, q = '') => coreFetch<{ products: CoreProduct[] }>(`products?${kind ? `kind=${kind}&` : ''}q=${encodeURIComponent(q)}`).then((r) => r.products)
export const createProduct = (input: Record<string, unknown>) => coreFetch<{ product: CoreProduct }>('products', { method: 'POST', body: input }).then((r) => r.product)
export const updateProduct = (id: number, patch: Record<string, unknown>) => coreFetch<{ product: CoreProduct }>(`products/${id}`, { method: 'PATCH', body: patch }).then((r) => r.product)
export const archiveProduct = (id: number) => coreFetch<{ ok: true }>(`products/${id}/archive`, { method: 'POST' })
export const listPhotos = (id: number) => coreFetch<{ photos: CorePhoto[] }>(`products/${id}/photos`).then((r) => r.photos)
export const setPhotos = (id: number, photos: ({ id: number } | { image: string })[]) => coreFetch<{ photos: CorePhoto[] }>(`products/${id}/photos`, { method: 'PUT', body: photos }).then((r) => r.photos)
export const getRecipe = (id: number) => coreFetch<CoreRecipe>(`products/${id}/recipe`)
export const putRecipe = (id: number, yieldQty: number, lines: RecipeLineInput[]) => coreFetch<CoreRecipe>(`products/${id}/recipe`, { method: 'PUT', body: { yield_qty: yieldQty, lines } })
export const overview = () => coreFetch<CoreOverview>('catalog/overview')
export const restaurantsCatalog = () => coreFetch<CoreRestaurantsCatalog>('catalog/restaurants')
export const setRestaurantProduct = (restaurantId: number, productId: number, patch: { price?: number | null; unavailable?: boolean }) =>
  coreFetch<{ ok: true }>(`catalog/restaurants/${restaurantId}/products/${productId}`, { method: 'PUT', body: patch })
export const listCategories = () => coreFetch<{ categories: CoreCategory[] }>('categories').then((r) => r.categories)
export const createCategory = (input: { name: string; sequence?: number; station?: string }) => coreFetch<{ category: CoreCategory }>('categories', { method: 'POST', body: input }).then((r) => r.category)
export const updateCategory = (id: number, patch: { name?: string; sequence?: number; station?: string }) => coreFetch<{ category: CoreCategory }>(`categories/${id}`, { method: 'PATCH', body: patch }).then((r) => r.category)
export const listTaxes = () => coreFetch<{ taxes: CoreTax[]; regime: 'inc' | 'iva' | 'none' | 'mixed' }>('taxes')
export const setTaxRegime = (regime: 'inc' | 'iva' | 'none') => coreFetch<{ regime: string; taxes: CoreTax[] }>('taxes/regime', { method: 'PUT', body: { regime } })
export const listUnits = () => coreFetch<{ units: CoreUnit[] }>('units').then((r) => r.units)
export const listSuppliers = () => coreFetch<{ suppliers: CoreSupplier[] }>('suppliers').then((r) => r.suppliers)
export const createSupplier = (input: { name: string; phone?: string; email?: string }) => coreFetch<{ supplier: CoreSupplier }>('suppliers', { method: 'POST', body: input }).then((r) => r.supplier)

// Las fotos salen del sistema propio por su propia ruta pública. Una etiqueta <img> no manda cabeceras, así que la
// organización viaja en la URL.
export const photoUrl = (productId: number, size: 'card' | 'dish', version = '') => `/experience/api/pos/v1/photos/${productId}?org=${currentOrg()}&size=${size}&v=${encodeURIComponent(version)}`
export const galleryUrl = (photoId: number) => `/experience/api/pos/v1/photos/gallery/${photoId}?org=${currentOrg()}`
