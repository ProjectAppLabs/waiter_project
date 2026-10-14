import { fireEvent, screen, within } from '@testing-library/react'

import { B4Menu, weekday } from '@/components/templates/families/B/B4Menu'
import { angus, menuProps, tacos, wrap } from '@/components/templates/families/B/__tests__/fixtures'

// Falla si la pizarra no pinta un paso por categoría con las opciones y su precio en mono, si el agotado se puede elegir,
// o si inventa un precio único / recargo que la carta no tiene.
it('paints one step per category with the real options and prices', () => {
  wrap(<B4Menu {...menuProps('B4')} />)
  expect(screen.getByText(`Hoy, ${weekday()}`)).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Menú del día')
  const steps = screen.getAllByRole('group')
  expect(steps.map((s) => s.getAttribute('aria-label'))).toEqual(['Hamburguesas', 'Bebidas', 'Platos', 'Para compartir'])
  const option = within(steps[0]).getByRole('button', { name: /Hamburguesa Angus/ })
  expect(option).toHaveAttribute('aria-pressed', 'false')
  expect(within(option).getByText('30.000')).toHaveClass('font-t-mono')
  expect(within(steps[1]).getByRole('button', { name: /Club Colombia/ })).toBeDisabled()
  expect(within(steps[1]).getByRole('button', { name: /Club Colombia/ })).toHaveTextContent('Agotado')
  expect(screen.queryByText(/\+4\.000/)).toBeNull()
})

// Falla si elegir no es un toggle con aria-pressed, si «Ver plato →» (en la fila del rótulo, solo con elección) no abre el elegido,
// o si «Armar» no agrega cada elección.
it('builds the menu from one choice per step and opens the chosen dish from the step label row', () => {
  const p = menuProps('B4')
  wrap(<B4Menu {...p} />)
  const cta = screen.getByRole('button', { name: 'Armar mi menú' })
  expect(cta).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Ver plato/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Hamburguesa Angus 30.000' }))
  expect(screen.getByRole('button', { name: 'Hamburguesa Angus 30.000' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Hamburguesa Clásica 20.000' }))
  expect(screen.getByRole('button', { name: 'Hamburguesa Angus 30.000' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Hamburguesa Angus 30.000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Tacos de carne 110.000' }))
  const steps = screen.getAllByRole('group')
  expect(screen.getAllByRole('button', { name: /Ver plato →/ })).toHaveLength(2)
  fireEvent.click(within(steps[0]).getByRole('button', { name: 'Ver plato →: Hamburguesa Angus' }))
  expect(p.onOpen).toHaveBeenCalledWith(angus)
  expect(screen.queryByText(/Elegido/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Armar mi menú · 2 elecciones' }))
  expect(p.onAdd).toHaveBeenCalledTimes(2)
  expect(p.onAdd).toHaveBeenCalledWith(angus)
  expect(p.onAdd).toHaveBeenCalledWith(tacos)
})

// Falla si un paso deja de ser UNA línea de texto como en el marco («Ajiaco · Crema de auyama»): opciones en píldoras de 40 px,
// separador suelto que puede abrir línea, «Ver plato» como línea extra, o el agotado atenuado dos veces / con insignia ilegible.
it('writes each step as one text line: inline options, separator glued to the previous option, legible sold-out', () => {
  wrap(<B4Menu {...menuProps('B4')} />)
  const steps = screen.getAllByRole('group')
  const line = steps[0].querySelector('p')!
  expect(line).toHaveTextContent('Hamburguesa Angus 30.000 · Hamburguesa Clásica 20.000')
  expect(line).toHaveClass('text-[17px]')
  const option = within(steps[0]).getByRole('button', { name: 'Hamburguesa Angus 30.000' })
  expect(option).toHaveClass('inline-block', 'py-[9px]', '-my-[9px]')
  expect(option.className).not.toMatch(/h-\[40px\]|rounded-t-chip/)
  // Opción y su separador comparten el mismo trozo no partible: el « · » nunca queda al inicio de la línea siguiente.
  expect(option.parentElement).toHaveClass('whitespace-nowrap')
  expect(option.parentElement).toHaveTextContent(/^Hamburguesa Angus 30\.000 ·$/)
  expect(steps[0].querySelectorAll('p span.whitespace-nowrap')).toHaveLength(2)
  fireEvent.click(option)
  expect(option).toHaveClass('font-bold', 'underline', 'decoration-t-acento')
  const soldOut = within(steps[1]).getByRole('button', { name: 'Club Colombia Agotado' })
  expect(within(soldOut).getByText('Club Colombia')).toHaveClass('opacity-55')
  expect(within(soldOut).getByText('Agotado')).not.toHaveClass('opacity-55')
  expect(within(soldOut).getByText('Agotado')).toHaveClass('bg-t-acento-suave', 'text-t-tinta')
  expect(soldOut.className).not.toMatch(/opacity-55/)
})

// Falla si la búsqueda de Waiter no reduce los pasos o si no dice que nada coincide.
it('filters the steps with the search and reports no matches', () => {
  const { unmount } = wrap(<B4Menu {...menuProps('B4', { query: 'taco' })} />)
  expect(screen.getAllByRole('group')).toHaveLength(1)
  unmount()
  wrap(<B4Menu {...menuProps('B4', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
