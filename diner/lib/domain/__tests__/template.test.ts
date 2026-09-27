import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_TEMPLATE, applyGoogleFonts, applyPreview, encodePreview, familyOf, fontsToLoad, initials, loadGoogleFonts, parsePreview, previewOverride, templateFromSpec, templateVars } from '@/lib/domain/template'
import type { TemplateSpec } from '@/lib/types'

const B1_SPEC = join(__dirname, '..', '..', '..', '..', 'experience', 'experience_app', 'plantillas', 'catalogo', 'S1.json')
const a1: TemplateSpec = {
  codigo: 'A1', nombre: 'Carta editorial', familia: 'A', fotos: { requiere: 'ninguna', recorte: 'ninguno' },
  tokens: { ...DEFAULT_TEMPLATE.tokens, fondo: '#FAF8F5', acento: '#7A2E2A', displayFont: 'Fraunces', displayPeso: 400, radioTarjeta: 4 },
  pantallas: { menu: { layout: 'A1' }, carrito: { layout: 'familia-A' }, pago: { layout: 'familia-A' }, registro: { patron: 'portada' }, codigo: { patron: 'revisaCorreo' }, historial: { patron: 'tablaCufe' } },
  fuentesGoogle: ['Fraunces'],
}

// Falla si la plantilla embebida se separa del spec.json de B1 (tokens, layouts y patrones): el motor pintaría otra cosa que el diseño.
it('embeds Smart Menu exactly as its versioned spec describes it', () => {
  const spec = JSON.parse(readFileSync(B1_SPEC, 'utf8')) as TemplateSpec
  expect(DEFAULT_TEMPLATE.tokens).toEqual(spec.tokens)
  expect(templateFromSpec(spec)).toEqual(DEFAULT_TEMPLATE)
})

// Falla si algún token no llega a su variable --t-* (o llega con otro nombre): las utilidades de globals.css leen exactamente estos nombres.
it('maps every token to a --t-* css variable', () => {
  const vars = templateVars(DEFAULT_TEMPLATE)
  expect(Object.keys(vars).filter((name) => !name.startsWith('--ds-')).sort()).toEqual([
    '--sm-accent-text', '--sm-highlight-ink', '--sm-highlight-text', '--sm-readable-muted', '--t-acento', '--t-acento-suave', '--t-acento-tinta', '--t-borde', '--t-cuerpo', '--t-display', '--t-display-peso', '--t-display-tracking', '--t-display-transform',
    '--t-fondo', '--t-mono', '--t-radio-boton', '--t-radio-chip', '--t-radio-tarjeta', '--t-superficie', '--t-tinta', '--t-tinta-suave', '--t-tinta-terciaria',
  ])
  expect(vars['--t-acento']).toBe('#6755A0')
  expect(vars['--t-display']).toBe("'DM Sans', system-ui, sans-serif")
  expect(vars['--t-display-peso']).toBe('500')
  expect(vars['--t-radio-chip']).toBe('16px')
  expect(vars['--t-mono']).toBe("'Mulish', ui-monospace, monospace")
})

// Falla si "familia-B" no se reduce a 'B' o si un layout raro no cae en la familia de la plantilla.
it('reads the family out of a cart or pay layout name', () => {
  expect(familyOf('familia-B', 'A')).toBe('B')
  expect(familyOf('familia-f', 'A')).toBe('F')
  expect(familyOf('B1', 'C')).toBe('C')
  expect(familyOf(undefined, 'D')).toBe('D')
})

// Falla si la vista previa no se decodifica de base64url, si acepta basura, o si una paleta pisa tokens que no son colores o con hex inválidos.
it('parses ?vista_previa and applies palette and typography over the catalog tokens', () => {
  const raw = encodePreview({ plantilla: 'a1', paleta: { acento: '#123abc', fondo: 'rojo', displayFont: '#000000', radioTarjeta: '#000000' } as never, tipografia: { display: 'Bebas Neue' } })
  expect(raw).not.toMatch(/[+/=]/)
  expect(parsePreview(raw)).toEqual({ plantilla: 'A1', paleta: { acento: '#123abc', fondo: 'rojo', displayFont: '#000000', radioTarjeta: '#000000' }, tipografia: { display: 'Bebas Neue' } })
  expect(parsePreview(null)).toBeNull()
  expect(parsePreview('')).toBeNull()
  expect(parsePreview('%%%no-es-base64%%%')).toBeNull()
  expect(parsePreview(btoa('[1,2]'))).toBeNull()
  const out = previewOverride(`?vista_previa=${raw}`, [a1], DEFAULT_TEMPLATE)
  expect(out).not.toBeNull()
  expect(out!.codigo).toBe('A1')
  expect(out!.tokens.acento).toBe('#123ABC')
  expect(out!.tokens.fondo).toBe('#FAF8F5')
  expect(out!.tokens.displayFont).toBe('Bebas Neue')
  expect(out!.tokens.radioTarjeta).toBe(4)
  expect(out!.fuentesGoogle).toEqual(['Fraunces', 'Bebas Neue'])
  expect(out!.descuento).toEqual(DEFAULT_TEMPLATE.descuento)
  expect(out!.layouts).toEqual({ menu: 'A1', carrito: 'familia-A', pago: 'familia-A', registro: 'portada', codigo: 'revisaCorreo', historial: 'tablaCufe' })
})

// Falla si un código que no está en el catálogo rompe la vista previa (debe partir de la plantilla actual) o si sin parámetro devuelve algo.
it('falls back to the current template for unknown codes and returns null without the param', () => {
  const out = previewOverride(new URLSearchParams({ vista_previa: encodePreview({ plantilla: 'Z9', paleta: { acento: '#000000' } }) }), [a1], DEFAULT_TEMPLATE)
  expect(out!.codigo).toBe('S1')
  expect(out!.tokens.acento).toBe('#000000')
  expect(previewOverride('', [a1], DEFAULT_TEMPLATE)).toBeNull()
  expect(previewOverride(null, [a1], DEFAULT_TEMPLATE)).toBeNull()
  expect(applyPreview(DEFAULT_TEMPLATE, {})).toEqual(DEFAULT_TEMPLATE)
})

// Falla si se piden a Google las fuentes que ya carga el layout, si una familia se pide dos veces, o si el <link> no lleva un id estable por familia.
it('loads each google font once and skips the ones the layout already ships', () => {
  const t = { ...DEFAULT_TEMPLATE, fuentesGoogle: ['Bebas Neue', 'Fraunces', 'Bebas Neue'], tokens: { ...DEFAULT_TEMPLATE.tokens, displayFont: 'Space Grotesk' } }
  expect(fontsToLoad(t)).toEqual(['Bebas Neue', 'Space Grotesk', 'Mulish'])
  expect(fontsToLoad(DEFAULT_TEMPLATE)).toEqual(['DM Sans', 'Mulish'])
  document.head.innerHTML = ''
  expect(applyGoogleFonts(t)).toEqual(['Bebas Neue', 'Space Grotesk', 'Mulish'])
  expect(loadGoogleFonts(['Bebas Neue'])).toEqual([])
  const links = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
  expect(links.map((l) => l.id)).toEqual(['gf-bebas-neue', 'gf-space-grotesk', 'gf-mulish'])
  expect(links[0].getAttribute('href')).toBe('https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400;500;600;700&display=swap')
  expect(loadGoogleFonts(['Bebas Neue'], undefined)).toEqual([])
})

it('builds avatar initials from the first two words', () => {
  expect(initials('Camila Ruiz')).toBe('CR')
  expect(initials('  ana ')).toBe('A')
  expect(initials('Juan Pablo Pérez')).toBe('JP')
})

test('preview derives readable accent ink and soft color over the chosen dark canvas', () => {
  const dark = applyPreview(DEFAULT_TEMPLATE, { paleta: { acento: '#000000', fondo: '#202020' } })
  expect(dark.tokens.acentoTinta).toBe('#FFFFFF')
  expect(dark.tokens.acentoSuave).toBe('#1D1D1D')
  expect(applyPreview(DEFAULT_TEMPLATE, { paleta: { acento: '#FFFFFF' } }).tokens.acentoTinta).toBe('#1A1815')
})
