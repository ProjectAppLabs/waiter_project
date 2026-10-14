import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AURORA, KIT_DARK, KIT_LIGHT, RADII, TAP_SIZES, THEME_MODES, cssVar } from '@/lib/design/tokens'
import { contrast } from '@/lib/domain/brand'

// Falla si el primario deja de ser el azul medido en el kit. El kit pinta texto blanco sobre él a 3.8:1,
// por debajo del 4.5 que exige la marca del comensal (Plan G); se acepta como decisión del kit y se exige ≥ 3:1 (AA para texto grande).
it('primary is the kit blue and white text on it keeps at least 3:1', () => {
  expect(KIT_LIGHT.primary).toBe('#447DFC')
  expect(contrast(KIT_LIGHT.primary, '#FFFFFF')).toBeGreaterThanOrEqual(3)
})

// Falla si algún token del tema oscuro se queda sin valor o hereda del claro por descuido.
it('dark theme defines every token with a distinct background', () => {
  expect(Object.keys(KIT_DARK).sort()).toEqual(Object.keys(KIT_LIGHT).sort())
  expect(KIT_DARK.canvas).toBe('#131316')
  expect(contrast(KIT_DARK.canvas, KIT_DARK.ink)).toBeGreaterThanOrEqual(4.5)
})

// Falla si el kit pierde uno de sus modos de tema (sistema, claro, oscuro) o cambia su orden en el selector.
it('exposes the three theme modes of the kit', () => {
  expect(THEME_MODES).toEqual(['system', 'light', 'dark'])
})

// Falla si el nombre de la variable CSS deja de coincidir con el que declara globals.css.
it('names css variables in kebab-case under --kit-', () => {
  expect(cssVar('primarySoft')).toBe('--kit-primary-soft')
  expect(cssVar('ink')).toBe('--kit-ink')
})

// Falla si la vista /kit documenta un valor que el CSS ya no usa (o al revés): la documentación mentiría.
it('documents the same palette, radii, tap sizes and aurora colors that globals.css declares', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  for (const [token, hex] of Object.entries(KIT_LIGHT)) expect(css).toContain(`${cssVar(token as keyof typeof KIT_LIGHT)}: ${hex}`)
  for (const r of RADII) expect(css).toContain(`--radius-${r.token}: ${r.px}px`)
  for (const s of TAP_SIZES) expect(css).toContain(`--spacing-${s.token}: ${s.px}px`)
  for (const hex of AURORA.base) expect(css).toContain(hex)
  for (const blob of AURORA.blobs) {
    expect(css).toContain(`.login-blob-${blob.key}`)
    expect(css).toContain(blob.core)
    expect(css).toContain(`${blob.seconds}s ease-in-out infinite alternate`)
  }
})
