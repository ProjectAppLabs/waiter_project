'use client'

import { create } from 'zustand'

import { EMPTY_DISH_FILTERS, EMPTY_INGREDIENT_FILTERS, type Dish, type DishFilters, type Ingredient, type IngredientFilters } from '@/lib/domain/pantry'
import { listCategories, type AdminCategory } from '@/lib/services/catalogAdmin'
import { ensureKitUnits, listDishes, listIngredients, listRequests, listSuppliers, type KitUnit, type PantryRequest, type Supplier } from '@/lib/services/pantry'

export type PantryTab = 'menu' | 'ingredients' | 'requests'

interface PantryState {
  tab: PantryTab; loading: boolean; error: string | null
  dishes: Dish[]; ingredients: Ingredient[]; requests: PantryRequest[]
  units: KitUnit[]; posCategories: AdminCategory[]; suppliers: Supplier[]
  dishFilters: DishFilters; ingredientFilters: IngredientFilters; requestQuery: string
  setTab: (tab: PantryTab) => void
  setDishFilters: (patch: Partial<DishFilters>) => void
  setIngredientFilters: (patch: Partial<IngredientFilters>) => void
  setRequestQuery: (query: string) => void
  resetFilters: () => void
  load: () => Promise<void>
  refresh: () => Promise<void>
}

export const usePantryStore = create<PantryState>((set) => ({
  tab: 'menu', loading: false, error: null,
  dishes: [], ingredients: [], requests: [], units: [], posCategories: [], suppliers: [],
  dishFilters: EMPTY_DISH_FILTERS, ingredientFilters: EMPTY_INGREDIENT_FILTERS, requestQuery: '',
  setTab: (tab) => set({ tab }),
  setDishFilters: (patch) => set((s) => ({ dishFilters: { ...s.dishFilters, ...patch } })),
  setIngredientFilters: (patch) => set((s) => ({ ingredientFilters: { ...s.ingredientFilters, ...patch } })),
  setRequestQuery: (requestQuery) => set({ requestQuery }),
  resetFilters: () => set((s) => ({ dishFilters: { ...EMPTY_DISH_FILTERS, query: s.dishFilters.query }, ingredientFilters: { ...EMPTY_INGREDIENT_FILTERS, query: s.ingredientFilters.query } })),
  load: async () => {
    set({ loading: true, error: null })
    try {
      const [units, posCategories, suppliers] = await Promise.all([ensureKitUnits(), listCategories(), listSuppliers()])
      const [dishes, ingredients, requests] = await Promise.all([listDishes(), listIngredients(), listRequests()])
      set({ units, posCategories, suppliers, dishes, ingredients, requests, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  // También categorías y proveedores: la consola los crea desde sus propios editores y los asistentes deben verlos.
  refresh: async () => {
    const [dishes, ingredients, requests, posCategories, suppliers] = await Promise.all([listDishes(), listIngredients(), listRequests(), listCategories(), listSuppliers()])
    set({ dishes, ingredients, requests, posCategories, suppliers })
  },
}))
