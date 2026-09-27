import fs from 'node:fs'
import path from 'node:path'

// Plan J1: el CSS del menú se mide con las variables del design system (smart-tokens.css), no con medidas fijas. Estas
// pruebas cuidan que siga así: si alguien escribe un padding o un tamaño de letra a mano, el tema de la sede (Plan J2)
// ya no lo podría cambiar y la IA vería un menú que no responde.
const DIR = path.join(__dirname, '..')
const TOKENS = 'smart-tokens.css'
const sheets = fs.readdirSync(DIR).filter((f) => f.endsWith('.css') && f !== TOKENS)
const css = (file: string) => fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const defined = new Set([...fs.readFileSync(path.join(DIR, TOKENS), 'utf8').matchAll(/(--ds-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))

// Declaraciones «propiedad: valor» de un archivo, sin las variables personalizadas.
function declarations(file: string): [string, string][] {
  return [...css(file).matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)].map((m) => [m[1], m[2]] as [string, string]).filter(([p]) => !p.startsWith('--'))
}
const pxValues = (value: string) => [...value.matchAll(/(?<![\w.-])-?(\d+(?:\.\d+)?)px\b/g)].map((m) => Number(m[1]))

// Falla si el CSS usa una variable --ds-* que smart-tokens.css no define: el navegador la ignoraría en silencio.
it('uses only design system variables that exist', () => {
  const used = new Set(sheets.flatMap((f) => [...css(f).matchAll(/var\((--ds-[a-z0-9-]+)/g)].map((m) => m[1])))
  expect([...used].filter((v) => !defined.has(v))).toEqual([])
  expect(used.size).toBeGreaterThan(20)
})

// Falla si vuelve un espaciado fijo. Se permiten 0, 1 px (líneas finas) y los huecos grandes (> 64 px) para barras fijas.
it('has no fixed spacing between 2 and 64 px', () => {
  const fixed = sheets.flatMap((f) => declarations(f)
    .filter(([p]) => /^(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?$/.test(p))
    .filter(([, v]) => pxValues(v).some((n) => n >= 2 && n <= 64))
    .map(([p, v]) => `${f}: ${p}:${v.trim()}`))
  expect(fixed).toEqual([])
})

// Falla si vuelve un tamaño de letra o un interlineado fijo: no crecería con la escala de texto del tema.
it('scales every font size and line height with the text scale', () => {
  const fixed = sheets.flatMap((f) => declarations(f)
    .filter(([p]) => p === 'font-size' || p === 'line-height' || p === 'font')
    .filter(([, v]) => pxValues(v).length > 0 && !v.includes('var(--ds-texto)') && !v.includes('clamp('))
    .map(([p, v]) => `${f}: ${p}:${v.trim()}`))
  expect(fixed).toEqual([])
})

// Falla si un radio entre 2 y 32 px no pasa por la forma de su rol (tarjeta, botón, chip, campo, imagen u hoja).
it('multiplies every radius by the shape of its role', () => {
  const fixed = sheets.flatMap((f) => declarations(f)
    .filter(([p]) => /radius$/.test(p))
    .filter(([, v]) => pxValues(v).some((n) => n >= 2 && n <= 32) && !/var\(--ds-forma-/.test(v))
    .map(([p, v]) => `${f}: ${p}:${v.trim()}`))
  expect(fixed).toEqual([])
})
