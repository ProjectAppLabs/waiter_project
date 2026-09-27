import type { MenuTheme } from '@/lib/types'

// Contrato de experience/diseno/esquema.json; la prueba de paridad vigila rangos y valores predeterminados.
export const DESIGN_FACTORS = {
  densidad: { min: .75, max: 1.5, default: 1 },
  texto: { min: 1, max: 1.5, default: 1 },
  titulo: { min: 1, max: 1.5, default: 1 },
} as const
export const SHAPE_ROLES = ['tarjeta', 'boton', 'chip', 'campo', 'imagen', 'hoja'] as const
export const SHAPE_FACTOR = { min: 0, max: 2, default: 1 } as const

const HEX = /^#[0-9A-Fa-f]{6}$/
// Mismo patrón que experience/diseno/esquema.json: un nombre de familia de Google Fonts, nada que pueda romper el CSS.
export const FONT_FAMILY = /^[A-Z][A-Za-z0-9 ]{1,39}$/
export const MAX_FONTS = 3

// Plan L: fuentes globales de la sede (validadas de nuevo aquí: una respuesta corrupta nunca inyecta CSS).
export function themeFonts(theme?: MenuTheme): string[] {
  const list = theme?.version === 2 ? theme.fundamentos?.tipografia?.fuentes : undefined
  return Array.isArray(list) ? [...new Set(list.filter((f): f is string => typeof f === 'string' && FONT_FAMILY.test(f)))].slice(0, MAX_FONTS) : []
}

// Plan L: textura del fondo. Cada patrón es un fondo CSS fijo del catálogo; el tema solo elige cuál, su tamaño y su
// intensidad (validados de nuevo aquí). El valor no puede depender de otras variables: se declara en <main> y CSS lo
// resuelve allí. Por eso la tinta es currentColor, que se resuelve donde se pinta (.smart-menu, con la tinta del fondo).
export const TEXTURE = { patrones: ['ninguna', 'reticula', 'cuaderno', 'puntos', 'diagonal'], tamano: { min: 8, max: 48, default: 16 }, intensidad: { min: 0, max: .25, default: .07 } } as const
function pattern(name: string, size: number, pct: string): string {
  const ink = `color-mix(in srgb, currentColor ${pct}, transparent)`
  switch (name) {
    case 'reticula': return `linear-gradient(to right, ${ink} 1px, transparent 1px), linear-gradient(to bottom, ${ink} 1px, transparent 1px)`
    case 'cuaderno': return `linear-gradient(to bottom, ${ink} 1px, transparent 1px)`
    case 'puntos': return `radial-gradient(circle, ${ink} 1.2px, transparent 1.6px)`
    case 'diagonal': return `repeating-linear-gradient(45deg, ${ink} 0 1px, transparent 1px ${size}px)`
    default: return 'none'
  }
}
function textureVars(theme?: MenuTheme): Record<string, string> {
  const t = theme?.version === 2 ? theme.fundamentos?.textura : undefined
  const inRange = (v: unknown, r: { min: number; max: number }) => typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max
  const patron = typeof t?.patron === 'string' && (TEXTURE.patrones as readonly string[]).includes(t.patron) ? t.patron : 'ninguna'
  const size = inRange(t?.tamano, TEXTURE.tamano) ? t!.tamano : TEXTURE.tamano.default
  const alpha = inRange(t?.intensidad, TEXTURE.intensidad) ? t!.intensidad : TEXTURE.intensidad.default
  const pct = `${Math.round(alpha * 1000) / 10}%`
  return { '--ds-textura': pattern(patron, size, pct), '--ds-textura-tamano': `${size}px`, '--ds-textura-intensidad': pct }
}

// Plan L: la tinta del fondo y las tres fuentes globales como variables CSS. ds-fuente-N sin fuente usa la de títulos.
function brandVars(theme?: MenuTheme): Record<string, string> {
  const ink = theme?.version === 2 ? theme.fundamentos?.colores?.tintaFondo : undefined
  const fonts = themeFonts(theme)
  const vars: Record<string, string> = { '--t-tinta-fondo': typeof ink === 'string' && HEX.test(ink) ? ink.toUpperCase() : 'var(--t-tinta)' }
  for (let i = 0; i < MAX_FONTS; i++) vars[`--ds-fuente-${i + 1}`] = fonts[i] ? `'${fonts[i]}', var(--t-display)` : 'var(--t-display)'
  return { ...vars, ...textureVars(theme) }
}

export function designSystemVars(theme?: MenuTheme): Record<string, string> {
  const foundation = theme?.version === 2 ? theme.fundamentos : undefined
  const entries = [
    ...Object.entries(DESIGN_FACTORS).map(([key, rule]) =>
      [`--ds-${key}`, foundation?.[key as keyof typeof DESIGN_FACTORS], rule] as const),
    ...SHAPE_ROLES.map((role) => [`--ds-forma-${role}`, foundation?.forma?.[role], SHAPE_FACTOR] as const),
  ]
  // Respuestas viejas o corruptas mantienen todas las escalas originales, sin valores CSS arbitrarios.
  const valid = foundation && entries.every(([, value, rule]) => typeof value === 'number' && Number.isFinite(value) && value >= rule.min && value <= rule.max)
  return { ...Object.fromEntries(entries.map(([name, value, rule]) => [name, String(valid ? value : rule.default)])), ...brandVars(theme) }
}
