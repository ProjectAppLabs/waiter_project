import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { COMPONENT_CONTRACTS, TEMPLATE_TAGS, resolveData, templateFor, truthy } from '../plantillas'
import type { MenuTheme, TemplateNode } from '@/lib/types'

const contractsDir = join(__dirname, '../../../../experience/experience_app/diseno/componentes')
const contract = { ...JSON.parse(readFileSync(join(contractsDir, '../componentes.json'), 'utf8')),
  componentes: Object.fromEntries(readdirSync(contractsDir).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(contractsDir, f), 'utf8'))])) }
const theme = (plato: unknown): MenuTheme => ({ version: 2, componentes: { plato } } as unknown as MenuTheme)
const tree: TemplateNode[] = [{ tipo: 'ranura', nombre: 'ficha', hijos: [{ tipo: 'elemento', etiqueta: 'h3', clases: ['ds-texto-titulo'], hijos: [{ tipo: 'dato', nombre: 'plato.nombre' }] }] }]

// Falla si el comensal y experience discrepan sobre la versión del contrato de un componente o las etiquetas admitidas.
it('mantiene versiones de contrato y etiquetas iguales a componentes.json', () => {
  expect(Object.fromEntries(Object.entries(contract.componentes).map(([id, c]) => [id, (c as { version: number }).version]))).toEqual(COMPONENT_CONTRACTS)
  expect([...TEMPLATE_TAGS]).toEqual(contract.etiquetas)
})

// Falla si una plantilla de otra versión, con un árbol dañado o con etiquetas/clases fuera del lenguaje llega a dibujarse.
it('solo entrega árboles de la versión vigente y con la forma esperada', () => {
  expect(templateFor(theme({ version: 1, arbol: tree }), 'plato')).toBe(tree)
  for (const bad of [null, undefined, {}, { version: 2, arbol: tree }, { version: 1, arbol: [] }, { version: 1, arbol: 'html' },
    { version: 1, arbol: [{ tipo: 'elemento', etiqueta: 'script', clases: [], hijos: [] }] },
    { version: 1, arbol: [{ tipo: 'elemento', etiqueta: 'div', clases: ['text-red-500'], hijos: [] }] },
    { version: 1, arbol: [{ tipo: 'dato', nombre: 'plato.nombre', formato: 'html' }] },
    { version: 1, arbol: [{ tipo: 'decoracion', id: '../x', movimiento: 'flotar', posicion: 'libre' }] },
    { version: 1, arbol: [{ tipo: 'guion' }] }]) {
    expect(templateFor(theme(bad), 'plato')).toBeNull()
  }
  expect(templateFor({ version: 2 } as MenuTheme, 'plato')).toBeNull()
  expect(templateFor(undefined, 'plato')).toBeNull()
  const huge = Array.from({ length: 151 }, () => ({ tipo: 'texto', texto: 'x' }))
  expect(templateFor(theme({ version: 1, arbol: huge }), 'plato')).toBeNull()
})

// Falla si <si> muestra bloques con datos vacíos o si <cada> lee los campos del elemento equivocado.
it('evalúa condiciones y resuelve datos dentro de una repetición', () => {
  expect([true, 1, 'a', [1]].map(truthy)).toEqual([true, true, true, true])
  expect([false, 0, '', [], null, undefined, NaN].map(truthy)).toEqual([false, false, false, false, false, false, false])
  const datos = { 'plato.nombre': 'Bandeja', lineas: [{ nombre: 'Papas' }] }
  expect(resolveData('plato.nombre', datos, {})).toBe('Bandeja')
  expect(resolveData('linea.nombre', datos, { linea: { nombre: 'Papas' } })).toBe('Papas')
  expect(resolveData('linea', datos, { linea: { nombre: 'Papas' } })).toEqual({ nombre: 'Papas' })
  expect(resolveData('linea.nombre', datos, {})).toBeUndefined()
})
