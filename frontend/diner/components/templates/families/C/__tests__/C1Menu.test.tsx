import { cleanup, fireEvent, screen } from '@testing-library/react'

import { C1Menu } from '@/components/templates/families/C/C1Menu'
import { cartOf, entryOf, line, menuProps, wrap } from '@/components/templates/families/C/__tests__/fixtures'

// Falla si el número deja de ser único en la carta (Limonada es el 4, no «el 1» de Bebidas), si el subtítulo inventa texto
// (descripción → primera línea; favorito → «El más pedido»; nada → nada), si el agotado se puede elegir, o si el precio pierde la fuente mono.
it('numbers every dish once across the whole menu and paints the real subtitles', () => {
  wrap(<C1Menu {...menuProps('C1')} />)
  const first = screen.getByRole('button', { name: 'Elegir el 1: Burger + papas + gaseosa' })
  expect(first).toHaveTextContent('Angus 150 g')
  expect(first).not.toHaveTextContent('Con todo')
  expect(screen.getByRole('button', { name: 'Elegir el 2: Doble carne + papas' })).toHaveTextContent('El más pedido')
  expect(screen.getByRole('button', { name: 'Elegir el 3: Quesadilla' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Elegir el 4: Limonada' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Elegir el 6: Papas' })).toBeInTheDocument()
  const numbers = screen.getAllByRole('button', { name: /Elegir el \d+/ }).map((b) => Number((b.getAttribute('aria-label') ?? '').match(/\d+/)?.[0]))
  expect(new Set(numbers).size).toBe(numbers.length)
  expect(screen.getByText('32.900')).toHaveClass('font-t-mono')
  expect(screen.getByText('Di el número al mesero o tócalo aquí.')).toBeInTheDocument()
})

// Falla si el número cambia al filtrar por categoría (se pide en voz alta: debe ser el mismo en «Todo» y en su pestaña), o si un plato
// que vive en dos categorías recibe dos números.
it('keeps the same number in the category tab and gives a dish in two categories a single number', () => {
  wrap(<C1Menu {...menuProps('C1', { category: 2 })} />)
  expect(screen.getByRole('button', { name: 'Elegir el 4: Limonada' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Elegir el 1:/ })).toBeNull()
  cleanup()
  const entry = entryOf()
  const shared = entry.carta.categorias[0].productos[0]
  entry.carta.categorias[1].productos.unshift({ ...shared, categorias: [1, 2] })
  wrap(<C1Menu {...menuProps('C1', { entry })} />)
  expect(screen.getAllByRole('button', { name: 'Elegir el 1: Burger + papas + gaseosa' })).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Elegir el 4: Limonada' })).toBeInTheDocument()
})

// Falla si la cabecera del marco deja de ser la única (nombre en la voz de la plantilla y chip de mesa de Waiter sobre tokens), o si
// con logo de marca no lo pinta en lugar del nombre.
it('owns a single header: brand name or logo plus the table chip on template tokens', () => {
  wrap(<C1Menu {...menuProps('C1')} />)
  expect(screen.getByRole('heading', { level: 1, name: 'El Fogón' })).toHaveClass('t-title')
  expect(screen.getByText('Mesa 9')).toHaveClass('bg-t-superficie', 'text-t-tinta')
  cleanup()
  const entry = entryOf()
  entry.contexto.marca = { ...entry.contexto.marca, logo: 'https://x/logo.png' }
  entry.contexto.mesa = null
  wrap(<C1Menu {...menuProps('C1', { entry })} />)
  expect(screen.getByRole('img', { name: 'El Fogón' })).toHaveAttribute('src', 'https://x/logo.png')
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  expect(screen.getByText('Domicilio')).toBeInTheDocument()
})

// Falla si tocar una fila no la selecciona (aria-pressed), si el CTA no dice «Pedir el {n}» ni pide ese combo, o si tocar la fila ya
// seleccionada no abre su ficha.
it('selects a combo on tap, orders it from the CTA and opens the selected one on a second tap', () => {
  const p = menuProps('C1')
  wrap(<C1Menu {...p} />)
  expect(screen.getByRole('link', { name: 'Ver el pedido' })).toHaveAttribute('href', '/fogon/centro/t/Z2XUVG/pedido')
  const row = screen.getByRole('button', { name: 'Elegir el 2: Doble carne + papas' })
  fireEvent.click(row)
  expect(row).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Pedir el 2' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  expect(screen.queryByRole('button', { name: 'Pedir el 2' })).toBeNull()
  fireEvent.click(row)
  fireEvent.click(row)
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
})

// Falla si el CTA sin selección no muestra el total del pedido en mono, o si el pie vuelve a levantarse para esquivar una barra de
// Waiter que la página ya no pinta sobre este layout (dos CTA apilados con el mismo destino).
it('shows the order total in the CTA and keeps the foot as the only CTA, stuck to the bottom', () => {
  wrap(<C1Menu {...menuProps('C1', { cart: cartOf([line({})]) })} />)
  const cta = screen.getByRole('link', { name: /Ver el pedido/ })
  expect(cta).toHaveTextContent('$ 65.800')
  expect(cta.parentElement).toHaveClass('sticky', 'bottom-0')
  expect(cta.parentElement).not.toHaveClass('bottom-[92px]')
})

// Falla si el agotado pierde la insignia legible (fondo propio, fuera de la atenuación de la fila) o si la atenuación se aplica dos veces.
it('dims the sold-out row once and keeps a legible badge outside the dimmed content', () => {
  wrap(<C1Menu {...menuProps('C1')} />)
  const row = screen.getByRole('button', { name: 'Elegir el 3: Quesadilla' })
  const badge = screen.getByTestId('sold-out-badge')
  expect(badge).toHaveTextContent('Agotado')
  expect(badge).toHaveClass('bg-busy-soft', 'text-busy-ink')
  expect(badge.closest('.opacity-55')).toBeNull()
  expect(row).not.toHaveClass('opacity-55')
  expect(row.querySelectorAll('.opacity-55')).toHaveLength(2)
})

// Falla si la búsqueda y las pestañas de Waiter no están, si buscar no conserva el número original, o si el vacío no es honesto.
it('keeps the search and the category tabs, preserves numbering when searching and states an honest empty result', () => {
  const p = menuProps('C1', { query: 'doble' })
  wrap(<C1Menu {...p} />)
  expect(screen.getByRole('searchbox', { name: 'Buscar un plato' })).toHaveValue('doble')
  expect(screen.getByRole('tab', { name: 'Combos' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Elegir el 2: Doble carne + papas' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Elegir el 1/ })).toBeNull()
  wrap(<C1Menu {...menuProps('C1', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
