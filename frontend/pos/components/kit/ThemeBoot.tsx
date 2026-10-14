'use client'

import { useTheme } from '@/lib/hooks/useTheme'

// Aplica el tema guardado al cargar la app, antes de que el usuario abra Ajustes. No pinta nada.
export function ThemeBoot() {
  useTheme()
  return null
}
