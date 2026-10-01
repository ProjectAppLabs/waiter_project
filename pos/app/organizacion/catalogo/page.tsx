'use client'
import { useState } from 'react'

import { CatalogConsole, type CatalogTab, type DishFilter } from '@/components/organization/CatalogConsole'

// Plan R: ?pestana=ingredientes|categorias|precios y ?filtro=sin-receta|sin-costo abren el catálogo donde hace falta
// (Rentabilidad enlaza aquí sus «platos sin costo»).
const TAB: Record<string, CatalogTab> = { platos: 'dishes', categorias: 'categories', ingredientes: 'ingredients', precios: 'prices' }
const FILTER: Record<string, DishFilter> = { 'sin-receta': 'noRecipe', 'sin-costo': 'missingCost', 'con-costo': 'costed' }

export default function OrganizationCatalog() {
  const [params] = useState(() => (typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)))
  return <CatalogConsole initialTab={TAB[params.get('pestana') ?? ''] ?? 'dishes'} initialFilter={FILTER[params.get('filtro') ?? ''] ?? 'all'} />
}
