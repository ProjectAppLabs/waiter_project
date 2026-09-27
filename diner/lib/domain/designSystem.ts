import type { MenuTheme } from '@/lib/types'

// Contrato de experience/diseno/esquema.json; la prueba de paridad vigila rangos y valores predeterminados.
export const DESIGN_FACTORS = {
  densidad: { min: .75, max: 1.5, default: 1 },
  texto: { min: 1, max: 1.5, default: 1 },
  titulo: { min: 1, max: 1.5, default: 1 },
} as const
export const SHAPE_ROLES = ['tarjeta', 'boton', 'chip', 'campo', 'imagen', 'hoja'] as const
export const SHAPE_FACTOR = { min: 0, max: 2, default: 1 } as const

export function designSystemVars(theme?: MenuTheme): Record<string, string> {
  const foundation = theme?.version === 2 ? theme.fundamentos : undefined
  const entries = [
    ...Object.entries(DESIGN_FACTORS).map(([key, rule]) =>
      [`--ds-${key}`, foundation?.[key as keyof typeof DESIGN_FACTORS], rule] as const),
    ...SHAPE_ROLES.map((role) => [`--ds-forma-${role}`, foundation?.forma?.[role], SHAPE_FACTOR] as const),
  ]
  // Respuestas viejas o corruptas mantienen todas las escalas originales, sin valores CSS arbitrarios.
  const valid = foundation && entries.every(([, value, rule]) => typeof value === 'number' && Number.isFinite(value) && value >= rule.min && value <= rule.max)
  return Object.fromEntries(entries.map(([name, value, rule]) => [name, String(valid ? value : rule.default)]))
}
