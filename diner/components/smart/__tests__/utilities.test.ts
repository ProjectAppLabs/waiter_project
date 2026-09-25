import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Plan K1: las utilidades ds-* que admite una plantilla son las mismas en el validador de experience y en el CSS del menú.
const root = join(__dirname, '../../../..')
const catalog = JSON.parse(readFileSync(join(root, 'experience/experience_app/diseno/utilidades.json'), 'utf8'))
const css = readFileSync(join(root, 'diner/components/smart/smart-utilities.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const declared = catalog.grupos.flatMap((group: { utilidades: { clase: string; descripcion: string }[] }) => group.utilidades)
const implemented = new Set([...css.matchAll(/\.smart-menu \.(ds-[a-z0-9-]+)/g)].map((m) => m[1]))

// Falla si el catálogo anuncia una clase que el CSS no implementa, o si el CSS tiene clases que la IA no puede usar.
it('mantiene el catálogo de utilidades igual al CSS, con descripción y ámbito .smart-menu', () => {
  const names = declared.map((u: { clase: string }) => u.clase)
  expect(new Set(names).size).toBe(names.length)
  expect(names.filter((name: string) => !implemented.has(name))).toEqual([])
  expect([...implemented].filter((name) => !names.includes(name))).toEqual([])
  for (const utility of declared) expect(utility.descripcion.length).toBeGreaterThan(8)
  expect(css).not.toMatch(/^\s*\.ds-/m)
})

// Falla si una utilidad vuelve a fijar colores, tamaños de texto o radios sin pasar por los tokens del tema.
it('deriva colores, texto y forma de los tokens del tema', () => {
  const rules = [...css.matchAll(/\.smart-menu \.(ds-[a-z0-9-]+)\s*\{([^}]*)\}/g)].map((m) => [m[1], m[2]] as const)
  for (const [name, body] of rules) {
    if (/(^|[^-])color\s*:/.test(body) || /background\s*:/.test(body)) expect(`${name}: ${body}`).toMatch(/var\(--(?:t|sm)-/)
    if (/font-size|font\s*:/.test(body)) expect(`${name}: ${body}`).toMatch(/var\(--ds-texto\)/)
    if (/border-radius/.test(body) && !/999px/.test(body)) expect(`${name}: ${body}`).toMatch(/var\(--ds-forma-/)
    if (/gap|padding/.test(body)) expect(`${name}: ${body}`).toMatch(/var\(--ds-espacio-/)
  }
})
