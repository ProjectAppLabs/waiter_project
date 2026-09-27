import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { designSystemVars, themeFonts } from '../designSystem'
import { designSystemAttributes } from '../designVariants'
import { DEFAULT_TEMPLATE, fontsToLoad, loadGoogleFonts } from '../template'
import type { MenuTheme } from '@/lib/types'

// Plan L: fuentes globales de la sede, tinta del fondo, banners del tema y utilidades de marca.
const theme = (fundamentos: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 2, fundamentos: { densidad: 1, texto: 1, titulo: 1,
  forma: { tarjeta: 1, boton: 1, chip: 1, campo: 1, imagen: 1, hoja: 1 }, colores: {}, tipografia: { display: 'DM Sans', cuerpo: 'Mulish' }, ...fundamentos }, ...extra }) as unknown as MenuTheme

// Falla si las fuentes globales dejan de exponerse como --ds-fuente-N, si una posición vacía no cae en la de títulos o si
// un nombre que no es de familia (con comillas, punto y coma o llaves) llega al CSS.
it('expone hasta tres fuentes globales y descarta nombres que no son de familia', () => {
  const vars = designSystemVars(theme({ tipografia: { display: 'Anton', cuerpo: 'DM Sans', fuentes: ['Anton', 'Oswald', "x'; }body{", 'Anton'] } }))
  expect(vars['--ds-fuente-1']).toBe("'Anton', var(--t-display)")
  expect(vars['--ds-fuente-2']).toBe("'Oswald', var(--t-display)")
  expect(vars['--ds-fuente-3']).toBe('var(--t-display)')
  expect(themeFonts(theme({ tipografia: { display: 'DM Sans', cuerpo: 'Mulish', fuentes: ['A1', 'B2', 'C3', 'D4'] } }))).toEqual(['A1', 'B2', 'C3'])
  expect(themeFonts(undefined)).toEqual([])
})

// Falla si las fuentes globales no se piden a Google Fonts para toda la página o se piden dos veces.
it('pide las fuentes globales una sola vez para toda la página', () => {
  const template = { ...DEFAULT_TEMPLATE, tema: theme({ tipografia: { display: 'DM Sans', cuerpo: 'Mulish', fuentes: ['Anton', 'Oswald'] } }) }
  const fonts = fontsToLoad(template)
  expect(fonts).toEqual(expect.arrayContaining(['Anton', 'Oswald']))
  document.head.innerHTML = ''
  expect(loadGoogleFonts(fonts)).toEqual(fonts)
  expect(loadGoogleFonts(fonts)).toEqual([])
  expect([...document.head.querySelectorAll('link')].map((l) => l.getAttribute('href')).filter((h) => h?.includes('Anton'))).toHaveLength(1)
})

// Falla si la tinta del fondo no llega al CSS o si un valor corrupto sustituye la tinta normal.
it('traduce la tinta del fondo y cae en la tinta normal si no hay o no es un color', () => {
  expect(designSystemVars(theme({ colores: { tintaFondo: '#fcf7f2' } }))['--t-tinta-fondo']).toBe('#FCF7F2')
  expect(designSystemVars(theme({ colores: { tintaFondo: 'red; x' } }))['--t-tinta-fondo']).toBe('var(--t-tinta)')
  expect(designSystemVars(undefined)['--t-tinta-fondo']).toBe('var(--t-tinta)')
})

// Falla si la variante de banners no llega como atributo o acepta un valor fuera del catálogo.
it('marca la variante de banners del tema', () => {
  expect(designSystemAttributes(theme({}, { variantes: { banners: 'tema' } }))['data-ds-banners']).toBe('tema')
  expect(designSystemAttributes(theme({}, { variantes: { banners: 'otra' } }))['data-ds-banners']).toBe('actual')
})

// Falla si una utilidad de marca deja de existir en el CSS o si ds-texto-enorme baja del mínimo legible.
it('define las utilidades de marca en el CSS del menú', () => {
  const css = readFileSync(join(__dirname, '../../../components/smart/smart-utilities.css'), 'utf8')
  for (const cls of ['ds-sombra-dura', 'ds-borde-grueso', 'ds-fondo-reticula', 'ds-inclinado-izquierda', 'ds-inclinado-derecha', 'ds-barra', 'ds-texto-enorme', 'ds-fuente-1', 'ds-fuente-2', 'ds-fuente-3'])
    expect([cls, css.includes(`.smart-menu .${cls} {`)]).toEqual([cls, true])
  expect(css).toMatch(/\.ds-texto-enorme \{[^}]*calc\(40px/)
})

// Falla si la textura del fondo deja de traducirse a su patrón del catálogo, acepta un patrón o un rango inventado, o
// deja de usar la tinta del fondo (así sirve con fondos claros y oscuros).
it('traduce la textura del fondo a un patrón del catálogo con su tamaño e intensidad', () => {
  const vars = designSystemVars(theme({ textura: { patron: 'reticula', tamano: 16, intensidad: .07 } }))
  expect(vars['--ds-textura']).toContain('linear-gradient(to right, var(--sm-textura-tinta) 1px')
  expect(vars['--ds-textura-tamano']).toBe('16px')
  expect(vars['--ds-textura-intensidad']).toBe('7%')
  expect(designSystemVars(theme({ textura: { patron: 'cuaderno', tamano: 24, intensidad: .1 } }))['--ds-textura']).toBe('linear-gradient(to bottom, var(--sm-textura-tinta) 1px, transparent 1px)')
  const bad = designSystemVars(theme({ textura: { patron: 'url(http://x)', tamano: 500, intensidad: 3 } }))
  expect([bad['--ds-textura'], bad['--ds-textura-tamano'], bad['--ds-textura-intensidad']]).toEqual(['none', '16px', '7%'])
  expect(designSystemVars(undefined)['--ds-textura']).toBe('none')
  const css = readFileSync(join(__dirname, '../../../components/smart/smart-marca.css'), 'utf8')
  expect(css).toContain('--sm-textura-tinta: color-mix(in srgb, var(--sm-ink-fondo) var(--ds-textura-intensidad), transparent)')
})
