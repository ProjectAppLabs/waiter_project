import { render } from '@testing-library/react'
import { Plantilla } from '../Renderizador'
import type { TemplateNode } from '@/lib/types'

const el = (etiqueta: string, clases: string[], hijos: TemplateNode[]): TemplateNode => ({ tipo: 'elemento', etiqueta, clases, hijos })
const datos = { 'plato.nombre': 'Bandeja paisa', 'plato.precio': 32000, 'plato.tiempo': 0, 'plato.rebaja': true, 'plato.rebaja.porcentaje': 20.5,
  lineas: [{ nombre: 'Papas', cantidad: 2 }, { nombre: 'Jugo', cantidad: 1 }] }

// Falla si el renderizador dibuja HTML crudo, pierde formatos, ignora <si>/<cada> o deja de colocar las ranuras donde dice la plantilla.
it('dibuja cada tipo de nodo desde el árbol con los datos y las ranuras del componente', () => {
  const arbol: TemplateNode[] = [
    el('div', ['ds-pila', 'ds-espacio-8'], [
      { tipo: 'ranura', nombre: 'ficha', hijos: [
        el('h3', ['ds-texto-titulo'], [{ tipo: 'texto', texto: 'Hoy:' }, { tipo: 'dato', nombre: 'plato.nombre' }]),
        { tipo: 'dato', nombre: 'plato.precio', formato: 'precio' },
        { tipo: 'si', dato: 'plato.tiempo', hijos: [{ tipo: 'texto', texto: 'NO DEBE VERSE' }] },
        { tipo: 'si', dato: 'plato.rebaja', hijos: [el('span', ['ds-insignia'], [{ tipo: 'texto', texto: '-' }, { tipo: 'dato', nombre: 'plato.rebaja.porcentaje', formato: 'numero' }, { tipo: 'texto', texto: '%' }])] },
        { tipo: 'cada', dato: 'lineas', como: 'linea', hijos: [el('li', [], [{ tipo: 'dato', nombre: 'linea.cantidad', formato: 'numero' }, { tipo: 'texto', texto: '×' }, { tipo: 'dato', nombre: 'linea.nombre' }])] },
      ] },
      { tipo: 'ranura', nombre: 'agregar', hijos: [] },
      { tipo: 'ranura', nombre: 'inexistente', hijos: [] },
      { tipo: 'decoracion', id: 'stars', movimiento: 'flotar', posicion: 'arriba-derecha' },
      { tipo: 'decoracion', id: 'hoja', movimiento: 'ninguno', posicion: 'libre', archivo: '/api/v1/demo/salon/decoraciones/hoja/?v=20260925' },
    ]),
  ]
  const { container } = render(<Plantilla arbol={arbol} datos={datos} fallback={<p>fábrica</p>}
    ranuras={{ ficha: (children) => <a href="#ficha" className="sm-food-link">{children}</a>, agregar: <button>+</button> }} />)
  const link = container.querySelector('a.sm-food-link')!
  expect(link.querySelector('h3.ds-texto-titulo')).toHaveTextContent('Hoy:Bandeja paisa')
  expect(link).toHaveTextContent('$ 32.000')
  expect(link).not.toHaveTextContent('NO DEBE VERSE')
  expect(link.querySelector('span.ds-insignia')).toHaveTextContent('-20,5%')
  expect([...link.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['2×Papas', '1×Jugo'])
  expect(container.querySelector('div.ds-pila.ds-espacio-8 > button')).toHaveTextContent('+')
  const decoration = container.querySelector('img.ds-decoracion')!
  expect(decoration).toHaveAttribute('src', '/smart-menu/stars.png')
  expect(decoration).toHaveClass('ds-mov-flotar', 'ds-esquina-arriba-derecha')
  expect(decoration).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelectorAll('img.ds-decoracion')[1]).toHaveAttribute('src', '/api/v1/demo/salon/decoraciones/hoja/?v=20260925')
  expect(container.querySelector('script')).toBeNull()
  expect(container.textContent).not.toContain('fábrica')
})

// Falla si un árbol que no se puede dibujar deja un hueco en la carta en vez de mostrar el componente de fábrica.
it('muestra el respaldo cuando el árbol no se puede dibujar', () => {
  const arbol = [{ tipo: 'elemento', etiqueta: 'script', clases: [], hijos: [] } as unknown as TemplateNode]
  const { container } = render(<Plantilla arbol={arbol} datos={{}} ranuras={{}} fallback={<p>fábrica</p>} />)
  expect(container.querySelector('script')).toBeNull()
  expect(container).toHaveTextContent('fábrica')
  const explosive = [{ tipo: 'ranura', nombre: 'bomba', hijos: [] } as TemplateNode]
  const { container: second } = render(<Plantilla arbol={explosive} datos={{}} fallback={<p>fábrica</p>} ranuras={{ bomba: () => { throw new Error('boom') } }} />)
  expect(second).toHaveTextContent('fábrica')
})
