'use client'

import { createContext, useContext } from 'react'

import type { Restaurant } from '@/lib/services/restaurants'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan O: lo que comparten las vistas de la consola del dueño: los restaurantes de la organización y cómo releerlos.
export interface OrgContextValue { restaurants: Restaurant[]; reload: () => Promise<void>; companyName: string }
export const OrgContext = createContext<OrgContextValue>({ restaurants: [], reload: async () => undefined, companyName: '' })
export const useOrg = () => useContext(OrgContext)

export const anyConfigId = (restaurants: Restaurant[], current: number | null = useAuthStore.getState().restaurant?.id ?? null): number | null =>
  (current !== null && restaurants.some((r) => r.id === current) ? current : restaurants[0]?.id ?? null)
