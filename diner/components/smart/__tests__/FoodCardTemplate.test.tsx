import { fireEvent, render } from '@testing-library/react'
import { contracts, parseTemplate } from '@/components/plantillas/__tests__/helpers'
import { FoodCard, dishTemplateData } from '../SmartMenu'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Dish, MenuTheme } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
const contract = contracts
const parse = parseTemplate
const dish: Dish = { id: 7, nombre: 'Bandeja paisa', precio: 32000, agotado: false, categorias: [1], foto: '/b.png', valoracion: { promedio: 4.75, cantidad: 12 },
  atributos: { tiempoPreparacion: 15, precioAntes: 40000 } }
const withTemplate = (plato: unknown) => useDinerStore.setState({ keys: { rest: 'demo', venue: 'salon', token: null }, template: { ...DEFAULT_TEMPLATE, tema: { version: 2, componentes: { plato } } as unknown as MenuTheme } })
const html = (c: HTMLElement) => c.querySelector('article')!.innerHTML

beforeEach(() => useDinerStore.setState({ ...useDinerStore.getInitialState(), keys: { rest: 'demo', venue: 'salon', token: null } }, true))

// Falla si la plantilla de fábrica dibujada desde el árbol difiere del JSX de fábrica: el lenguaje dejaría de alcanzar para el diseño actual.
it('dibuja la plantilla de fábrica exactamente igual que la tarjeta actual', () => {
  const first = render(<FoodCard dish={dish} />)
  expect(first.container.querySelector('article')).not.toHaveAttribute('data-plantilla')
  const factory = html(first.container)
  first.unmount()
  withTemplate({ version: 1, arbol: parse(contract.componentes.plato.plantilla_fabrica) })
  const templated = render(<FoodCard dish={dish} />).container
  expect(templated.querySelector('article')).toHaveAttribute('data-plantilla', 'propia')
  expect(html(templated)).toBe(factory)
  expect(factory).toContain('sm-food-link')
})

// Falla si una plantilla propia pierde los datos o las acciones reales, o si puede meter etiquetas o clases fuera del lenguaje.
it('permite otra estructura conservando datos, enlace, favorito y agregar', () => {
  const add = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({ add })
  withTemplate({ version: 1, arbol: parse(`<div class="ds-pila ds-espacio-8 ds-relleno-12 ds-radio-tarjeta ds-acento-suave">
    <ranura nombre="ficha"><h3 class="ds-texto-titulo"><dato nombre="plato.nombre"/></h3>
      <div class="ds-fila ds-espacio-8"><strong class="ds-destacado-texto"><dato nombre="plato.precio" formato="precio"/></strong>
        <si dato="plato.rebaja"><span class="ds-insignia">-<dato nombre="plato.rebaja.porcentaje" formato="numero"/>%</span>
          <span class="ds-tachado"><dato nombre="plato.precioAntes" formato="precio"/></span></si></div>
      <ranura nombre="foto"/><si dato="plato.tiempo"><small class="ds-tinta-suave"><dato nombre="plato.tiempo" formato="numero"/> min</small></si>
    </ranura><div class="ds-fila ds-extremos"><ranura nombre="favorito"/><ranura nombre="agregar"/></div><decoracion id="stars" movimiento="latir" posicion="arriba-derecha"/></div>`) })
  const { container, getByRole } = render(<FoodCard dish={dish} />)
  const root = container.querySelector('article.sm-food-card > div.ds-pila.ds-acento-suave')!
  expect(root).not.toBeNull()
  const link = root.querySelector('a.sm-food-link')!
  expect(link).toHaveAttribute('href', '/demo/salon/plato/7')
  expect(link.querySelector('h3.ds-texto-titulo')).toHaveTextContent('Bandeja paisa')
  expect(link).toHaveTextContent('$ 32.000')
  expect(link.querySelector('span.ds-insignia')).toHaveTextContent('-20%')
  expect(link.querySelector('.sm-food-photo')).not.toBeNull()
  expect(link).toHaveTextContent('15 min')
  expect(link.querySelector('span.ds-tachado')).toHaveTextContent('$ 40.000')
  expect(container.querySelector('button.sm-heart')).not.toBeNull()
  expect(container.querySelector('img.ds-decoracion.ds-mov-latir')).toHaveAttribute('src', '/smart-menu/stars.png')
  fireEvent.click(getByRole('button', { name: 'Agregar: Bandeja paisa' }))
  expect(add).toHaveBeenCalledWith(7, 1, '')
})

// Falla si una plantilla de otra versión del contrato o un árbol dañado cambia la tarjeta en vez de volver a la de fábrica.
it('vuelve a la tarjeta de fábrica con plantillas obsoletas o dañadas', () => {
  const first = render(<FoodCard dish={dish} />)
  const factory = html(first.container)
  first.unmount()
  for (const bad of [{ version: 2, arbol: parse(contract.componentes.plato.plantilla_fabrica) }, { version: 1, arbol: [{ tipo: 'elemento', etiqueta: 'iframe', clases: [], hijos: [] }] }, null]) {
    withTemplate(bad)
    const { container, unmount } = render(<FoodCard dish={dish} />)
    expect(html(container)).toBe(factory)
    expect(container.querySelector('article')).not.toHaveAttribute('data-plantilla')
    unmount()
  }
})

// Falla si los datos que ve la plantilla dejan de coincidir con el contrato del componente.
it('expone exactamente los datos del contrato «plato»', () => {
  const data = dishTemplateData(dish)
  expect(Object.keys(data).sort()).toEqual(Object.keys(contract.componentes.plato.datos).sort())
  expect(data).toMatchObject({ 'plato.nombre': 'Bandeja paisa', 'plato.precio': 32000, 'plato.rebaja': true, 'plato.rebaja.porcentaje': 20, 'plato.precioAntes': 40000, 'plato.valoracion.promedio': 4.8, 'plato.agotado': false })
  expect(dishTemplateData({ id: 1, nombre: 'Sin extras', precio: 1000, agotado: true, categorias: [] })).toMatchObject({ 'plato.rebaja': false, 'plato.valoracion': false, 'plato.tiempo': null, 'plato.agotado': true })
})
