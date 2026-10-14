'use client'

import type { ReactNode } from 'react'

import { KitShell } from '@/components/kit/KitShell'
import type { NavItem } from '@/lib/domain/roles'

// Compatibilidad: las pantallas anteriores a la oleada I.1 siguen llamando a Shell; todo se pinta con el armazón del kit.
// Los badges y la subnavegación del sidebar antiguo se ignoran: cada pantalla rediseñada lleva sus propios chips.
export interface NavBadge { count: number; tone: 'brand' | 'warn' | 'busy' }
export interface SubNavItem { key: string; label: string; href: string; active?: boolean }
export interface Autonomy { autonomous: number; total: number }
interface ShellProps { mode: 'sidebar' | 'rail'; active?: NavItem; children: ReactNode; badges?: Partial<Record<NavItem, NavBadge>>; subnav?: { label: string; items: SubNavItem[] }; autonomy?: Autonomy | null }

export function Shell({ children }: ShellProps) {
  return <KitShell>{children}</KitShell>
}
