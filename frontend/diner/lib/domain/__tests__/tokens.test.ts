import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { compile } from 'tailwindcss'

import { DEFAULT_TEMPLATE, templateVars } from '@/lib/domain/template'

const ROOT = join(__dirname, '..', '..', '..')
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [] })
const sources = () => [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]

// Falla si el token del radio del restaurante vuelve a chocar con un sufijo de lado de Tailwind (rounded-r, -l, -t, -b…):
// la utilidad compilaría border-top-right en vez del radio del restaurante. Un "rounded-t-tarjeta" (token de plantilla) no es un uso desnudo.
it('names the restaurant radius token so it cannot collide with Tailwind side utilities', () => {
  expect(CSS).toContain('--radius-rest: var(--r-radius)')
  expect(CSS).not.toMatch(/--radius-[rltbse]:/)
  const offenders = sources().filter((f) => /\brounded-[rltbse](?=[\s"'`]|$)/m.test(readFileSync(f, 'utf8')))
  expect(offenders).toEqual([])
})

// Compila globals.css con Tailwind de verdad sobre una lista de candidatos: es la única forma de saber a qué CSS llega cada utilidad.
async function build(candidates: string[]): Promise<string> {
  const twDir = join(ROOT, 'node_modules', 'tailwindcss')
  const compiler = await compile(CSS, {
    base: ROOT,
    loadStylesheet: async (id: string) => { const p = id === 'tailwindcss' ? join(twDir, 'index.css') : join(twDir, id.replace('tailwindcss/', '')); return { path: p, base: twDir, content: readFileSync(p, 'utf8') } },
  })
  return compiler.build(candidates)
}
const rule = (css: string, selector: string) => { const m = css.match(new RegExp(`\\.${selector.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[1].replace(/\s+/g, ' ').trim() : null }

// Falla si alguna utilidad --t-* deja de existir o compila a otra propiedad: "rounded-t-tarjeta" debe ser border-radius completo (no el lado
// superior), "border-t-borde" un color (no border-top-width) y "border-t-t-acento" el color del lado superior (el anillo de «Autorizando»).
it('compiles every template utility to the css property the engine expects', async () => {
  const css = await build([
    'bg-t-fondo', 'bg-t-superficie', 'text-t-tinta', 'text-t-tinta-suave', 'text-t-tinta-terciaria', 'border-t-borde', 'bg-t-acento', 'text-t-acento',
    'text-t-acento-tinta', 'bg-t-acento-suave', 'font-t-display', 'font-t-cuerpo', 'font-t-mono', 'rounded-t-tarjeta', 'rounded-t-boton', 'rounded-t-chip',
    't-title', 'border-t-t-acento', 'divide-t-borde', 'rounded-t-lg',
  ])
  expect(rule(css, 'bg-t-fondo')).toBe('background-color: var(--t-fondo);')
  expect(rule(css, 'bg-t-superficie')).toBe('background-color: var(--t-superficie);')
  expect(rule(css, 'text-t-tinta')).toBe('color: var(--t-tinta);')
  expect(rule(css, 'text-t-tinta-suave')).toBe('color: var(--t-tinta-suave);')
  expect(rule(css, 'text-t-tinta-terciaria')).toBe('color: var(--t-tinta-terciaria);')
  expect(rule(css, 'border-t-borde')).toBe('border-color: var(--t-borde);')
  expect(rule(css, 'bg-t-acento')).toBe('background-color: var(--t-acento);')
  expect(rule(css, 'text-t-acento')).toBe('color: var(--t-acento);')
  expect(rule(css, 'text-t-acento-tinta')).toBe('color: var(--t-acento-tinta);')
  expect(rule(css, 'bg-t-acento-suave')).toBe('background-color: var(--t-acento-suave);')
  expect(rule(css, 'font-t-display')).toBe('font-family: var(--t-display);')
  expect(rule(css, 'font-t-cuerpo')).toBe('font-family: var(--t-cuerpo);')
  expect(rule(css, 'font-t-mono')).toBe('font-family: var(--t-mono);')
  expect(rule(css, 'rounded-t-tarjeta')).toBe('border-radius: var(--t-radio-tarjeta);')
  expect(rule(css, 'rounded-t-boton')).toBe('border-radius: var(--t-radio-boton);')
  expect(rule(css, 'rounded-t-chip')).toBe('border-radius: var(--t-radio-chip);')
  expect(rule(css, 't-title')).toContain('font-family: var(--t-display); font-weight: var(--t-display-peso); letter-spacing: var(--t-display-tracking); text-transform: var(--t-display-transform);')
  expect(rule(css, 'border-t-t-acento')).toBe('border-top-color: var(--t-acento);')
  // Los lados de Tailwind siguen intactos: rounded-t-lg es el radio superior, no un token nuestro.
  expect(rule(css, 'rounded-t-lg')).toContain('border-top-left-radius')
})

// Falla si el :root de globals.css (lo que se ve antes de que cargue el contexto) se separa de DEFAULT_TEMPLATE (lo que pone el motor).
it('keeps the css defaults identical to the embedded S1 template', () => {
  const root: Record<string, string> = {}
  for (const m of CSS.matchAll(/(--t-[a-z-]+|--sm-(?:highlight|accent)-(?:ink|text)(?:-fondo|-superficie)?|--sm-readable-muted(?:-fondo|-superficie)?):\s*([^;]+);/g)) if (!root[m[1]]) root[m[1]] = m[2].trim()
  expect(root).toEqual(Object.fromEntries(Object.entries(templateVars(DEFAULT_TEMPLATE)).filter(([name]) => !name.startsWith('--ds-'))))
})

// Falla si un componente del motor vuelve a los tokens fijos de la marca donde debería leer la plantilla (--t-*): las 30 no se verían distintas.
it('keeps the template components on template tokens, never on brand ones', () => {
  const dir = join(ROOT, 'components', 'templates')
  const offenders = walk(dir).filter((f) => /\b(bg-brand|text-brand|font-display|rounded-rest|bg-canvas)\b/.test(readFileSync(f, 'utf8')))
  expect(offenders).toEqual([])
})


// Falla si plato, cuenta o estado vuelven a usar superficies claras con tinta de una plantilla oscura.
it('compiles untemplated screens with the active template colors', async () => {
  const css = await build(['bg-surface', 'bg-canvas', 'text-ink', 'text-soft', 'border-border'])
  expect(rule(css, 'bg-surface')).toBe('background-color: var(--t-superficie);')
  expect(rule(css, 'bg-canvas')).toBe('background-color: var(--t-fondo);')
  expect(rule(css, 'text-ink')).toBe('color: var(--t-tinta);')
  expect(rule(css, 'text-soft')).toBe('color: var(--t-tinta-suave);')
  expect(rule(css, 'border-border')).toBe('border-color: var(--t-borde);')
})
