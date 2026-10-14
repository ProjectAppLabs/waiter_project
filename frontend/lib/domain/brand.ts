// Espejo de registry/registry_app/utils/brand.py. Las reglas son las mismas para que la vista previa del POS
// muestre exactamente el tema que el comensal recibirá del bloque 3; la paridad la vigila __tests__/brand.test.ts.
export const FONTS = ['Instrument Serif', 'Playfair Display', 'Fraunces', 'DM Serif Display', 'Lora', 'Cormorant Garamond'] as const
export type Font = (typeof FONTS)[number]
export const RADII = [4, 14, 24] as const
export type Radius = (typeof RADII)[number]
// Claves de i18n (pos.settings.brand.*) para cada redondeo: recto, suave, muy redondeado.
export const RADIUS_LABELS: Record<Radius, 'straight' | 'soft' | 'round'> = { 4: 'straight', 14: 'soft', 24: 'round' }
export const DEFAULT_COLOR = '#C1873A'
export const INK_DARK = '#1A1815'
export const INK_LIGHT = '#FFFFFF'
// Fondo crema de la portada del comensal (diner globals.css --color-canvas): sobre él va el color como texto.
export const CANVAS_LIGHT = '#FDFBF7'
export const MIN_CONTRAST = 4.5

export interface Theme { color: string; colorTexto: string; colorSuave: string; fuente: Font; radio: Radius; contraste: number }

export const isHex = (color: string): boolean => /^#[0-9a-fA-F]{6}$/.test(color)
export const isFont = (font: string): font is Font => (FONTS as readonly string[]).includes(font)
export const isRadius = (radius: number): radius is Radius => (RADII as readonly number[]).includes(radius)

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

// Luminancia relativa WCAG 2.x, con el umbral 0.03928 que usa el registro (no el 0.04045 de la errata).
function luminance(hex: string): number {
  const channel = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const [r, g, b] = rgb(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// round() de Python: la mitad exacta va al par. Math.round la sube y 13 valores de canal saldrían distintos al registro.
function pyRound(x: number): number {
  const floor = Math.floor(x)
  const frac = x - floor
  if (frac < 0.5) return floor
  if (frac > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Texto sobre el color de acción: blanco o tinta, el que contraste más (el sistema exige ≥ 4.5).
export function inkFor(color: string): string {
  return contrast(color, INK_LIGHT) >= contrast(color, INK_DARK) ? INK_LIGHT : INK_DARK
}

// Mezcla al 10 % sobre blanco: fondo de selección. Misma aritmética en coma flotante que el registro.
export function softFor(color: string): string {
  const mix = (c: number) => pyRound(255 - (255 - c) * 0.10).toString(16).toUpperCase().padStart(2, '0')
  const [r, g, b] = rgb(color)
  return `#${mix(r)}${mix(g)}${mix(b)}`
}

// Un color pasa si el texto que se le calcula lo lee cualquiera: ≥ 4.5:1.
export const meetsContrast = (color: string): boolean => contrast(color, inkFor(color)) >= MIN_CONTRAST

// El comensal también usa el color como texto sobre el fondo crema («Ver todos», «Llamar al mesero»). No bloquea
// (el sistema solo exige el contraste con su tinta), pero por debajo de 4.5:1 esos enlaces se ven tenues y se avisa.
export const linkContrast = (color: string): number => contrast(color, CANVAS_LIGHT)
export const linkReadable = (color: string): boolean => linkContrast(color) >= MIN_CONTRAST

// Misma regla que diner/lib/domain/theme.ts greetingFor: con el saludo vacío el comensal saluda según la hora,
// y la vista previa del POS tiene que enseñar exactamente eso.
export function greetingFor(hour: number, custom: string): string {
  if (custom.trim()) return custom
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function theme(color: string, font: string, radius: number): Theme {
  const c = (isHex(color) ? color : DEFAULT_COLOR).toUpperCase()
  return {
    color: c, colorTexto: inkFor(c), colorSuave: softFor(c),
    fuente: isFont(font) ? font : FONTS[0], radio: isRadius(radius) ? radius : 14,
    // round(x, 2) de Python redondea el valor binario exacto; toFixed hace lo mismo (solo difiere en empates exactos, que aquí no ocurren).
    contraste: Number(contrast(c, inkFor(c)).toFixed(2)),
  }
}
