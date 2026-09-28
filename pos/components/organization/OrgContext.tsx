'use client'

import { createContext, useContext } from 'react'

import type { Restaurant } from '@/lib/services/restaurants'

// Plan O: lo que comparten las vistas de la consola del dueño: los restaurantes de la organización y cómo releerlos.
export interface OrgContextValue { restaurants: Restaurant[]; reload: () => Promise<void>; companyName: string }
export const OrgContext = createContext<OrgContextValue>({ restaurants: [], reload: async () => undefined, companyName: '' })
export const useOrg = () => useContext(OrgContext)

// Algunos ajustes de la organización todavía se guardan a través de un punto de venta (el addon los sube a la empresa):
// cualquiera de la organización sirve, se usa el primero.
export const anyConfigId = (restaurants: Restaurant[]): number | null => restaurants[0]?.id ?? null
