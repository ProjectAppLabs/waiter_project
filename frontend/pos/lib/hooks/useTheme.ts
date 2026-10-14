'use client'

import { useEffect, useState } from 'react'

import { THEME_MODES, type ThemeMode } from '@/lib/design/tokens'

const KEY = 'waiter.theme'
const read = (): ThemeMode => { try { const v = localStorage.getItem(KEY); return (THEME_MODES as readonly string[]).includes(v ?? '') ? (v as ThemeMode) : 'system' } catch { return 'system' } }

// Fija <html data-theme> (claro u oscuro) resolviendo "sistema" con prefers-color-scheme, y recuerda la elección.
export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try { localStorage.setItem(KEY, mode) } catch { /* sin almacenamiento */ }
}

// El modo se lee del dispositivo al montar y se aplica cada vez que cambia (ThemeBoot lo monta una vez por app).
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(read)
  useEffect(() => { applyTheme(mode) }, [mode])
  return { mode, setMode }
}
