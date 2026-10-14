import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { COMPONENT_VARIANTS, SCREEN_LAYOUTS, designSystemAttributes } from '../designVariants'

const root = join(__dirname, '../../../..')
const schema = JSON.parse(readFileSync(join(root, 'experience/experience_app/diseno/esquema.json'), 'utf8'))
const inventory = JSON.parse(readFileSync(join(root, 'experience/experience_app/diseno/inventario.json'), 'utf8'))
const smart = join(root, 'diner/components/smart')
const css = readdirSync(smart).filter(file => file.endsWith('.css')).map(file => readFileSync(join(smart, file), 'utf8')).join('\n')
const layers = { variantes: COMPONENT_VARIANTS, distribucion: SCREEN_LAYOUTS }

// Falla si la API, el inventario y el comensal discrepan sobre opciones, atributos o valores predeterminados.
it('mantiene el catálogo de variantes sincronizado en ambas direcciones', () => {
  const attributes = designSystemAttributes()
  const declared = new Set<string>()
  for (const [layer, definitions] of Object.entries(layers)) {
    expect(Object.keys(schema.properties[layer].properties)).toEqual(Object.keys(definitions))
    for (const [key, definition] of Object.entries(definitions)) {
      const rule = schema.properties[layer].properties[key]
      const item = inventory.variantes[key]
      expect(rule).toMatchObject({ type: 'string', enum: [...definition.values], default: definition.default })
      expect(item).toMatchObject({ ruta: `${layer}.${key}`, atributo: definition.attribute, predeterminada: definition.default })
      expect(item.opciones.map((option: { valor: string }) => option.valor)).toEqual([...definition.values])
      expect(attributes[definition.attribute]).toBe(definition.default)
      for (const option of item.opciones) {
        expect(option.descripcion.length).toBeGreaterThan(10)
        expect(css).toContain(option.selector)
        if (option.valor !== definition.default) expect(option.selector).toBe(`[${definition.attribute}="${option.valor}"]`)
        declared.add(`${definition.attribute}=${option.valor}`)
      }
    }
  }
  expect(Object.keys(inventory.variantes).sort()).toEqual([...Object.keys(COMPONENT_VARIANTS), ...Object.keys(SCREEN_LAYOUTS)].sort())
  for (const match of css.matchAll(/\[(data-ds-[\w-]+)=["']([^"']+)["']\]/g)) expect(declared.has(`${match[1]}=${match[2]}`)).toBe(true)
  for (const match of css.matchAll(/\[(data-ds-[\w-]+)(?:\]|=)/g)) expect(attributes).toHaveProperty(match[1])
  const consumed = new Set(inventory.componentes.flatMap((component: { variantes: string[] }) => component.variantes))
  expect([...consumed].sort()).toEqual(Object.keys(inventory.variantes).sort())
})

// Falla si alguna opción válida se pierde entre el tema resuelto y los atributos de <main>.
it('emite cada variante y distribución sin alterar las demás', () => {
  const defaults = designSystemAttributes()
  for (const [layer, definitions] of Object.entries(layers)) {
    for (const [key, definition] of Object.entries(definitions)) {
      for (const value of definition.values) {
        expect(designSystemAttributes({ version: 2, [layer]: { [key]: value } })).toEqual({ ...defaults, [definition.attribute]: value })
      }
    }
  }
})

// Falla si un tema anterior o dañado puede inyectar atributos, CSS o esconder acciones mediante valores no admitidos.
it('usa valores seguros ante respuestas incompletas o corruptas', () => {
  const defaults = designSystemAttributes()
  for (const theme of [undefined, null, {}, { version: 3, variantes: { boton: 'contorno' } },
    { version: 2, variantes: null, distribucion: [] },
    { version: 2, variantes: { boton: 'none;display:none', saludo: false, onclick: 'alert(1)' }, distribucion: { carta: '<style/>' } }]) {
    expect(designSystemAttributes(theme as Parameters<typeof designSystemAttributes>[0])).toEqual(defaults)
  }
})
