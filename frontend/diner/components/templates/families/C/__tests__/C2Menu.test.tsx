import { fireEvent, screen, within } from '@testing-library/react'

import { C2Menu } from '@/components/templates/families/C/C2Menu'
import { cartOf, combos, entryOf, line, menuProps, wrap } from '@/components/templates/families/C/__tests__/fixtures'

const slides = () => screen.getAllByRole('article', { hidden: true })

// Falla si el primer plato no ocupa la pantalla con su foto a sangre, si «Solo hoy» aparece sin atributos.soloHoy, si los tamaños
// no cambian el precio mostrado, o si el upsell no sale de la categoría de extras.
it('paints one dish per screen with photo, only-today chip, sizes that drive the price and the extras upsell', () => {
  const p = menuProps('C2')
  wrap(<C2Menu {...p} />)
  const first = slides()[0]
  expect(first.querySelector('img')).toHaveAttribute('src', 'https://x/burger.jpg')
  expect(within(first).getByText('Solo hoy')).toBeInTheDocument()
  expect(within(first).getByRole('heading', { name: 'Burger + papas + gaseosa' })).toHaveClass('t-title')
  expect(within(first).getByText('32.900')).toHaveClass('font-t-mono')
  fireEvent.click(within(first).getByRole('radio', { name: 'Doble' }))
  expect(within(first).getByText('41.900')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Añadir 41.900' })).toBeInTheDocument()
  expect(within(first).getByText('¿Le sumas Papas por 6.900?')).toBeInTheDocument()
  fireEvent.click(within(first).getByRole('button', { name: 'Sumar Papas' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }))
  expect(screen.getByText('1 / 7')).toBeInTheDocument()
})

// Falla si el stepper no multiplica el CTA, si «Añadir» no llama onAdd una vez por unidad, o si tocar la foto no abre la ficha.
it('multiplies the CTA by the quantity, adds one call per unit and opens the dish from the photo', () => {
  const p = menuProps('C2')
  wrap(<C2Menu {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  fireEvent.click(screen.getByRole('button', { name: 'Añadir 98.700' }))
  expect(p.onAdd).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('button', { name: 'Añadir 32.900' })).toBeInTheDocument()
  fireEvent.click(slides()[0].querySelector('img') as HTMLElement)
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
})

// Falla si sin foto no hay placeholder «Foto del plato», si el agotado no lleva insignia ni apaga el CTA, o si sin tamaños queda un
// hueco (ningún radiogroup) o un chip «Solo hoy» inventado.
it('shows the placeholder without photo, the sold-out badge instead of the CTA, and no invented sizes or chips', () => {
  const p = menuProps('C2', { entry: entryOf([combos]), category: 1 })
  wrap(<C2Menu {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Plato siguiente' }))
  const second = slides()[1]
  expect(within(second).getByText('Foto del plato')).toBeInTheDocument()
  expect(within(second).queryByRole('radiogroup', { hidden: true })).toBeNull()
  expect(within(second).queryByText('Solo hoy')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Plato siguiente' }))
  expect(within(slides()[2]).getByTestId('sold-out-badge')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Añadir/ })).toBeNull()
  expect(screen.getByText('3 / 3')).toBeInTheDocument()
})

// Falla si el pie vuelve a levantarse para esquivar una barra de Waiter que la página ya no pinta sobre este layout, si el segmento de
// tamaño activo deja los tokens de tinta/fondo, o si la búsqueda vacía no lo dice.
it('keeps the foot at the bottom, paints the active size on tokens and states an honest empty search', () => {
  wrap(<C2Menu {...menuProps('C2', { cart: cartOf([line({})]) })} />)
  expect(screen.getByRole('button', { name: /Añadir/ }).parentElement).toHaveClass('sticky', 'bottom-0')
  expect(screen.getByRole('button', { name: /Añadir/ }).parentElement).not.toHaveClass('bottom-[92px]')
  expect(screen.getByRole('radio', { name: 'Sencilla' })).toHaveClass('bg-t-tinta', 'text-t-fondo')
  wrap(<C2Menu {...menuProps('C2', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
