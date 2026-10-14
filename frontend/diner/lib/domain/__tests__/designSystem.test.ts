import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DESIGN_FACTORS, SHAPE_FACTOR, SHAPE_ROLES, designSystemVars } from '../designSystem'
import { DEFAULT_TEMPLATE, templateVars } from '../template'
import type { MenuTheme } from '@/lib/types'

const root = join(__dirname, '../../../..')
const schema = JSON.parse(readFileSync(join(root, 'experience/experience_app/diseno/esquema.json'), 'utf8'))
const inventory = JSON.parse(readFileSync(join(root, 'experience/experience_app/diseno/inventario.json'), 'utf8'))
const smart = join(root, 'diner/components/smart')
const css = readdirSync(smart).filter((file) => file.endsWith('.css')).map((file) => readFileSync(join(smart, file), 'utf8')).join('\n')
const tokensCSS = readFileSync(join(smart, 'smart-tokens.css'), 'utf8')
const theme = (foundation: Partial<MenuTheme['fundamentos']> = {}): MenuTheme => ({
  version: 2, fundamentos: {
    densidad: 1, texto: 1, titulo: 1,
    forma: { tarjeta: 1, boton: 1, chip: 1, campo: 1, imagen: 1, hoja: 1 },
    colores: DEFAULT_TEMPLATE.tokens,
    tipografia: { display: 'DM Sans', cuerpo: 'Mulish' }, ...foundation,
  },
})

// Falla si el comensal admite factores que experience rechaza o si cambia la apariencia antes de cargar el tema.
it('mantiene rangos y valores predeterminados iguales al esquema del servidor y al CSS', () => {
  const foundation = schema.properties.fundamentos.properties
  for (const [key, rule] of Object.entries(DESIGN_FACTORS)) {
    expect(foundation[key]).toMatchObject({ minimum: rule.min, maximum: rule.max, default: rule.default })
  }
  expect(Object.keys(foundation.forma.properties)).toEqual([...SHAPE_ROLES])
  for (const role of SHAPE_ROLES) {
    expect(foundation.forma.properties[role]).toMatchObject({ minimum: SHAPE_FACTOR.min, maximum: SHAPE_FACTOR.max, default: SHAPE_FACTOR.default })
  }
  for (const [variable, value] of Object.entries(designSystemVars())) {
    expect(tokensCSS).toContain(`${variable}: ${value};`)
  }
  expect(designSystemVars(theme())).toEqual(designSystemVars())
})

// Falla si el tema llega a la API pero sus escalas no llegan a los estilos del menú, o si 0 deja de producir esquinas rectas.
it('traduce densidad, texto, títulos y cada forma a variables CSS', () => {
  const custom = theme({ densidad: .75, texto: 1.25, titulo: 1.5,
    forma: { tarjeta: 0, boton: .5, chip: 2, campo: 1.25, imagen: .75, hoja: 1.5 } })
  expect(templateVars({ ...DEFAULT_TEMPLATE, tema: custom })).toMatchObject({
    '--ds-densidad': '0.75', '--ds-texto': '1.25', '--ds-titulo': '1.5',
    '--ds-forma-tarjeta': '0', '--ds-forma-boton': '0.5', '--ds-forma-chip': '2',
    '--ds-forma-campo': '1.25', '--ds-forma-imagen': '0.75', '--ds-forma-hoja': '1.5',
  })
})

// Falla si una respuesta vieja o corrupta permite inyectar CSS o deja el menú con medidas inválidas.
it('vuelve a las escalas originales ante versiones, rangos y tipos inválidos', () => {
  for (const broken of [null, { version: 3 }, { version: 2 }, theme({ texto: .5 }), theme({ densidad: NaN }),
    theme({ titulo: Infinity }), { version: 2, fundamentos: { densidad: '1);color:red' } }]) {
    expect(designSystemVars(broken as MenuTheme)).toEqual(designSystemVars())
  }
})

// Falla si el inventario anuncia fundamentos sin variable, componentes sin CSS o pantallas con componentes desconocidos.
it('cruza el inventario de fundamentos y componentes con los estilos reales', () => {
  const variables = templateVars(DEFAULT_TEMPLATE)
  for (const vars of Object.values(inventory.fundamentos) as string[][]) {
    for (const variable of vars) expect(variables).toHaveProperty(variable)
  }
  for (const variable of Object.keys(inventory.derivadas)) {
    expect(variable in variables || tokensCSS.includes(`${variable}:`)).toBe(true)
  }
  for (const component of inventory.componentes) {
    for (const selector of component.selectores) expect(css).toContain(selector)
    for (const foundation of component.fundamentos) expect(inventory.fundamentos).toHaveProperty([foundation])
    for (const variant of component.variantes) expect(inventory.variantes).toHaveProperty(variant)
  }
  const ids = inventory.componentes.map((component: { id: string }) => component.id)
  for (const components of Object.values(inventory.pantallas) as string[][]) {
    for (const id of components) expect(ids).toContain(id)
  }
})
