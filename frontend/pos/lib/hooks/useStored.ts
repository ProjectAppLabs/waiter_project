'use client'

import { useSyncExternalStore } from 'react'

// Lee una clave de localStorage sin setState en efectos ni desajustes de hidratación (en servidor vale '').
const subscribe = (cb: () => void) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb) }
export function useStored(key: string): string {
  return useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key) ?? '' } catch { return '' } }, () => '')
}
