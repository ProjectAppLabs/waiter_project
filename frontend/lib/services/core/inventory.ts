import { coreFetch } from '@/lib/services/core/http'
import type { PantryCategory } from '@/lib/services/core/catalog'

// Plan T1: el inventario por restaurante del sistema propio.
export type StockLevel = 'empty' | 'low' | 'medium' | 'high'
export type StockStatus = 'request' | 'normal' | 'good'
export interface CoreStockIngredient {
  id: number; name: string; pantry_category: PantryCategory; unit: { id: number; name: string }; qty: number; min: number; max: number
  level: StockLevel; status: StockStatus; supplier: { id: number; name: string } | null; has_image: boolean; cost: number
}
export interface CoreStockDish { id: number; name: string; category_ids: number[]; has_image: boolean; price: number; available_in_pos: boolean; has_recipe: boolean; servings: number | null; level: StockLevel | null; sold_out: boolean }
export interface CoreInventory { ingredients: CoreStockIngredient[]; dishes?: CoreStockDish[] }
export interface CoreStockDetail { stock: number; pending: number; cost: number; min: number; max: number; unit: string; history: { id: number; date: string; qty: number; reason: string; kind: string; account_name: string }[] }
export interface CoreRequest { id: number; state: 'draft' | 'sent' | 'received' | 'cancelled'; state_label: string; supplier_name: string; date: string; lines: { id: number; ingredient_id: number; name: string; qty: number; unit_name: string; price_unit: number }[] }

export const listInventory = (restaurantId: number, withDishes = false) => coreFetch<CoreInventory>(`inventory?restaurant_id=${restaurantId}${withDishes ? '&dishes=1' : ''}`)
export const stockDetail = (ingredientId: number, restaurantId: number) => coreFetch<CoreStockDetail>(`inventory/${ingredientId}?restaurant_id=${restaurantId}`)
export const moveStock = (ingredientId: number, body: { restaurant_id: number; kind: 'receipt' | 'waste' | 'count'; qty: number; reason: string; request_key: string; expected_stock?: number }) =>
  coreFetch<{ stock: number; move: { id: number } }>(`inventory/${ingredientId}/moves`, { method: 'POST', body })
export const stockSettings = (ingredientId: number, body: { restaurant_id: number; min?: number; max?: number; cost?: number }) => coreFetch<CoreStockDetail>(`inventory/${ingredientId}/settings`, { method: 'PUT', body })
export const listRequests = (restaurantId: number) => coreFetch<{ requests: CoreRequest[] }>(`inventory/requests?restaurant_id=${restaurantId}`).then((r) => r.requests)
export const requestIngredient = (restaurantId: number, ingredientId: number, qty?: number) => coreFetch<{ request: CoreRequest }>('inventory/requests', { method: 'POST', body: { restaurant_id: restaurantId, ingredient_id: ingredientId, qty } }).then((r) => r.request)
export const markRequest = (id: number, state: 'sent' | 'received' | 'cancelled') => coreFetch<{ request: CoreRequest }>(`inventory/requests/${id}/mark`, { method: 'POST', body: { state } }).then((r) => r.request)
