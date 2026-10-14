import type { Brand } from '@/lib/types'

// Seis variables por restaurante; el resto del sistema no se toca (sistema de diseño §06).
export function themeVars(brand: Brand | null): Record<string, string> {
  if (!brand) return {}
  return { '--r-brand': brand.color, '--r-brand-ink': brand.colorTexto, '--r-brand-soft': brand.colorSuave, '--r-display': `'${brand.fuente}'`, '--r-radius': `${brand.radio}px` }
}

export function greetingFor(hour: number, custom: string): string {
  if (custom.trim()) return custom
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
}
