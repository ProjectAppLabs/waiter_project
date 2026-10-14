import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { COMPONENTS, DEMONSTRATED_BY, FIELDS, PLACEHOLDERS, SAMPLES, Sample, sampleDishes, showcase, type VariantField } from '../samples'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Dish, Entry } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
const inventory = JSON.parse(readFileSync(join(__dirname, '../../../../experience/experience_app/diseno/inventario.json'), 'utf8'))
const dish = (id: number, extra: Partial<Dish> = {}): Dish => ({ id, nombre: `Plato ${id}`, precio: 1000 * id, agotado: false, categorias: [1], ...extra })
const entry = { banners: null, contexto: { restaurante: { slug: 'demo', nombre: 'Demo' }, sede: { slug: 'salon', nombre: 'Salón' }, mesa: null,
  marca: { nombre: 'Demo', lema: '', logo: null, saludo: '', mesero: '', bienvenida: '', color: '#6755A0', colorTexto: '#FFFFFF', colorSuave: '#EEEBF5', fuente: 'Mulish', radio: 16 } },
  carta: { restaurante: 'Demo', categorias: [{ id: 1, nombre: 'Fuertes', productos: [dish(1), dish(2, { foto: '/f2.png', agotado: true }), dish(3, { foto: '/f3.png' })] }] } } as Entry

// Falla si la copia local del inventario (nombres, orden o variantes consumidas) se separa del contrato de experience.
it('mantiene la lista local de componentes igual al inventario y demuestra cada variante en un consumidor', () => {
  expect(COMPONENTS.map(({ id, nombre, variantes }) => ({ id, nombre, variantes: [...variantes] })))
    .toEqual(inventory.componentes.map(({ id, nombre, variantes }: { id: string; nombre: string; variantes: string[] }) => ({ id, nombre, variantes })))
  expect(Object.keys(DEMONSTRATED_BY).sort()).toEqual(Object.keys(inventory.variantes).sort())
  for (const [field, componentId] of Object.entries(DEMONSTRATED_BY)) {
    const component = COMPONENTS.find((c) => c.id === componentId)!
    expect(component.variantes as readonly string[]).toContain(field)
    expect(SAMPLES[componentId]).toBeDefined()
  }
  expect(Object.keys(SAMPLES).sort()).toEqual(COMPONENTS.map((c) => c.id).sort())
})

// Falla si la página deja de mostrar platos con foto primero, o se queda sin muestras con una carta vacía.
it('elige platos reales con foto y completa con muestras', () => {
  expect(sampleDishes(entry).map((d) => d.id)).toEqual([3, 1, 2])
  expect(sampleDishes({ ...entry, carta: { restaurante: 'Demo', categorias: [] } })).toEqual(PLACEHOLDERS)
  expect(sampleDishes(entry, 5).map((d) => d.id)).toEqual([3, 1, 2, -1, -2])
  const shown = showcase(dish(4, { valoracion: { promedio: 3.5, cantidad: 2 } }))
  expect(shown.valoracion).toEqual({ promedio: 3.5, cantidad: 2 })
  expect(shown.atributos?.precioAntes).toBeGreaterThan(4000)
  expect(showcase(dish(5)).valoracion?.cantidad).toBeGreaterThan(0)
})

// Falla si una muestra no lleva los atributos completos del tema con la opción demostrada, deja de ser inerte o rompe al dibujarse.
it('dibuja cada componente dentro de un contenedor inerte con la variante demostrada', () => {
  useDinerStore.setState({ keys: { rest: 'demo', venue: 'salon', token: null } })
  const template = { ...DEFAULT_TEMPLATE, tema: { version: 2 as const, variantes: { boton: 'suave' }, distribucion: { carta: 'lista' } } as never }
  const dishes = sampleDishes(entry)
  for (const component of COMPONENTS) {
    const field = component.variantes[0] as VariantField | undefined
    const { container, unmount } = render(<Sample template={template} override={field ? { [field]: FIELDS[field].values[1] } : undefined}>{SAMPLES[component.id]({ entry, dishes })}</Sample>)
    const sample = container.querySelector('.ds-sample')!
    expect(sample).toHaveAttribute('inert')
    expect(sample).toHaveAttribute('data-ds-boton', field === 'boton' ? 'contorno' : 'suave')
    expect(sample).toHaveAttribute('data-ds-carta', field === 'carta' ? 'cuadricula' : 'lista')
    if (field) expect(sample).toHaveAttribute(FIELDS[field].attribute, FIELDS[field].values[1])
    for (const selector of inventory.componentes.find((c: { id: string }) => c.id === component.id).selectores as string[]) {
      if (component.id !== 'carta') expect([component.id, selector, !!container.querySelector(selector)]).toEqual([component.id, selector, true])
    }
    unmount()
  }
})
